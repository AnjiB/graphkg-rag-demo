import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { DataSet, Network } from "vis-network/standalone";
import "./App.css";

export default function App() {
  const [documentFile, setDocumentFile] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerSource, setAnswerSource] = useState(null);
  const [sourceMessage, setSourceMessage] = useState("");
  const [chunks, setChunks] = useState([]);
  const [kg, setKg] = useState({ nodes: [], edges: [] });
  const [highlightNodes, setHighlightNodes] = useState([]);
  const [viewDataMessage, setViewDataMessage] = useState("");
  const [systemStatus, setSystemStatus] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  
  // Chat-specific states
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  
  const networkRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  const uploadDocument = async () => {
    if (!documentFile) return alert("Select a document");
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", documentFile);
    
    try {
      const res = await axios.post("http://localhost:8000/upload_document", formData);
      alert(res.data.message);
      
      // Clear file input and reset state
      setDocumentFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Refresh system status after upload
      checkSystemStatus();
    } catch (error) {
      alert(`Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const askQuestion = async () => {
    if (!question) return alert("Enter a question");
    
    setIsAsking(true);
    setAnswer(""); // Clear previous answer
    setAnswerSource(null); // Clear previous source
    setSourceMessage(""); // Clear previous source message
    setHighlightNodes([]); // Clear previous highlights
    
    try {
      const res = await axios.post("http://localhost:8000/ask_question", { question });
      setAnswer(res.data.answer);
      setAnswerSource(res.data.answer_source);
      setSourceMessage(res.data.source_message);
      setHighlightNodes(res.data.relevant_concepts || []);
    } catch (error) {
      alert(`Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsAsking(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return alert("Enter a message");
    
    setIsChatting(true);
    
    // Add user message to chat
    const userMessage = { role: "user", content: chatInput };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    
    try {
      // Send question with conversation history
      const res = await axios.post("http://localhost:8000/chat", {
        question: chatInput,
        history: chatMessages
      });
      
      // Add assistant response to chat
      const assistantMessage = { 
        role: "assistant", 
        content: res.data.answer,
        relevant_concepts: res.data.relevant_concepts || []
      };
      setChatMessages(prev => [...prev, assistantMessage]);
      
      // Update highlighted nodes if knowledge graph is visible
      setHighlightNodes(res.data.relevant_concepts || []);
    } catch (error) {
      alert(`Error: ${error.response?.data?.error || error.message}`);
      // Remove the user message if there was an error
      setChatMessages(prev => prev.slice(0, -1));
    } finally {
      setIsChatting(false);
    }
  };

  const clearChat = () => {
    setChatMessages([]);
    setChatInput("");
    setHighlightNodes([]);
  };

  const checkSystemStatus = async () => {
    try {
      const res = await axios.get("http://localhost:8000/status");
      setSystemStatus(res.data);
    } catch (error) {
      console.error("Failed to check system status:", error);
    }
  };

  const viewData = async () => {
    setViewDataMessage("");
    try {
      const chunksRes = await axios.get("http://localhost:8000/get_chunks");
      setChunks(chunksRes.data.chunks);
    } catch {
      setChunks([]);
      setViewDataMessage("No chunk data. Upload a PDF first.");
    }

    try {
      const kgRes = await axios.get("http://localhost:8000/get_kg");
      setKg(kgRes.data);
    } catch {
      setKg({ nodes: [], edges: [] });
      setViewDataMessage("No KG data. Upload a PDF first.");
    }
  };

  // Check system status on component mount
  useEffect(() => {
    checkSystemStatus();
  }, []);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (kg.nodes.length === 0 || kg.edges.length === 0) return;

    const nodes = new DataSet(
      kg.nodes.map((n, i) => ({
        id: i,
        label: n,
        color: highlightNodes.includes(n) ? "#ff5733" : "#97c2fc",
        font: { size: 16, color: "#000" },
      }))
    );

    const edges = new DataSet(
      kg.edges.map((e) => {
        const fromIndex = kg.nodes.indexOf(e.from);
        const toIndex = kg.nodes.indexOf(e.to);
        const highlight = highlightNodes.includes(e.from) && highlightNodes.includes(e.to);
        return { from: fromIndex, to: toIndex, label: e.rel, color: highlight ? "#ff5733" : "#848484" };
      })
    );

    new Network(networkRef.current, { nodes, edges }, {
      nodes: { shape: "dot", size: 20 },
      edges: { arrows: "to", font: { align: "middle" } },
      physics: { stabilization: false },
    });
  }, [kg, highlightNodes]);

  return (
    <div className="app-container">
      <div className="app-header">
        <h1>Document QA App with Interactive Knowledge Graph</h1>
        <p>Upload documents, ask questions, and explore knowledge graphs powered by AI</p>
        {systemStatus && (
          <div className={`message ${systemStatus.system_ready ? 'success' : 'info'}`}>
            {systemStatus.system_ready 
              ? `✅ System Ready - ${systemStatus.chunks_count} chunks loaded from previous session`
              : '📝 System Ready - Upload a document to get started'
            }
          </div>
        )}
      </div>

      <div className="section">
        <h2>📄 Upload Document</h2>
        <div className="upload-section">
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".pdf,.txt,.md,.py,.js,.html,.css,.json,.xml" 
            onChange={e => setDocumentFile(e.target.files[0])}
            className="file-input"
          />
          <button 
            onClick={uploadDocument} 
            className="btn"
            disabled={isUploading || !documentFile}
          >
            {isUploading ? "Uploading..." : "Upload Document"}
          </button>
        </div>
        <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '10px' }}>
          Supported formats: PDF, TXT, MD, PY, JS, HTML, CSS, JSON, XML
        </p>
        {!documentFile ? (
          <p style={{ fontSize: '0.85rem', color: '#e53e3e', marginTop: '5px', fontStyle: 'italic' }}>
            ⚠️ Please select a file to enable upload
          </p>
        ) : (
          <p style={{ fontSize: '0.85rem', color: '#38a169', marginTop: '5px', fontStyle: 'italic' }}>
            ✅ File selected: {documentFile.name}
          </p>
        )}
      </div>

      <div className="section">
        <h2>❓ Ask Questions (Single Q&A)</h2>
        <div className="question-section">
          <input 
            value={question} 
            onChange={e => setQuestion(e.target.value)} 
            placeholder="Ask a question about your document..." 
            className="question-input"
            disabled={isAsking}
            onKeyPress={e => e.key === 'Enter' && askQuestion()}
          />
          <button 
            onClick={askQuestion} 
            className="btn btn-secondary"
            disabled={isAsking || !question.trim()}
          >
            {isAsking ? "Asking..." : "Ask Question"}
          </button>
        </div>
        {answer && (
          <div className="answer-display">
            <div className="answer-header">
              <strong>Answer:</strong>
              {answerSource && (
                <div className={`source-indicator ${answerSource}`}>
                  {answerSource === 'document' ? '📄' : '🤖'} {sourceMessage}
                </div>
              )}
            </div>
            <p>{answer}</p>
          </div>
        )}
      </div>

      <div className="section">
        <h2>💬 Chat (Conversational Q&A)</h2>
        <div className="chat-container">
          <div className="chat-messages">
            {chatMessages.length === 0 ? (
              <div className="chat-placeholder">
                <p>Start a conversation! Ask a question and continue with follow-ups.</p>
                <p style={{ fontSize: '0.9rem', color: '#666' }}>The chat maintains context from previous messages.</p>
              </div>
            ) : (
              <>
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`chat-message ${msg.role}`}>
                    <div className="message-label">
                      {msg.role === 'user' ? '👤 You' : '🤖 Assistant'}
                    </div>
                    <div className="message-content">
                      {msg.content}
                    </div>
                    {msg.relevant_concepts && msg.relevant_concepts.length > 0 && (
                      <div className="message-concepts">
                        📚 Related: {msg.relevant_concepts.slice(0, 3).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </>
            )}
          </div>
          <div className="chat-input-section">
            <input 
              value={chatInput} 
              onChange={e => setChatInput(e.target.value)} 
              placeholder="Type your message or follow-up question..." 
              className="chat-input"
              disabled={isChatting}
              onKeyPress={e => e.key === 'Enter' && sendChatMessage()}
            />
            <button 
              onClick={sendChatMessage} 
              className="btn btn-chat"
              disabled={isChatting || !chatInput.trim()}
            >
              {isChatting ? "Sending..." : "Send"}
            </button>
            {chatMessages.length > 0 && (
              <button 
                onClick={clearChat} 
                className="btn btn-clear"
                disabled={isChatting}
              >
                Clear Chat
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="section">
        <h2>📊 Explore Data</h2>
        <button onClick={viewData} className="btn">
          View Chunks & Knowledge Graph
        </button>
        {viewDataMessage && (
          <div className={`message ${viewDataMessage.includes('No') ? 'error' : 'info'}`}>
            {viewDataMessage}
          </div>
        )}

        {(chunks.length > 0 || kg.nodes.length > 0) && (
          <div className="data-section">
            {chunks.length > 0 && (
              <div className="chunks-display">
                <h4>📝 Document Chunks</h4>
                <ul className="chunks-list">
                  {chunks.map((chunk, i) => (
                    <li key={i}>{chunk}</li>
                  ))}
                </ul>
              </div>
            )}

            {kg.nodes.length > 0 && (
              <div className="kg-display">
                <h4>🕸️ Knowledge Graph</h4>
                <div ref={networkRef} className="network-container"></div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}