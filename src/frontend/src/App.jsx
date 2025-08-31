import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { DataSet, Network } from "vis-network/standalone";

export default function App() {
  const [pdfFile, setPdfFile] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [chunks, setChunks] = useState([]);
  const [kg, setKg] = useState({ nodes: [], edges: [] });
  const [highlightNodes, setHighlightNodes] = useState([]);
  const [viewDataMessage, setViewDataMessage] = useState("");
  const networkRef = useRef(null);

  const uploadPdf = async () => {
    if (!pdfFile) return alert("Select a PDF");
    const formData = new FormData();
    formData.append("file", pdfFile);
    const res = await axios.post("http://localhost:8000/upload_pdf", formData);
    alert(res.data.message);
  };

  const askQuestion = async () => {
    if (!question) return alert("Enter a question");
    const res = await axios.post("http://localhost:8000/ask_question", { question });
    setAnswer(res.data.answer);
    setHighlightNodes(res.data.relevant_concepts || []);
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
    <div style={{ padding: "20px" }}>
      <h2>PDF QA App with Interactive KG</h2>

      <h3>1. Upload PDF</h3>
      <input type="file" accept="application/pdf" onChange={e => setPdfFile(e.target.files[0])} />
      <button onClick={uploadPdf}>Upload PDF</button>

      <h3>2. Ask Question</h3>
      <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask a question" />
      <button onClick={askQuestion}>Ask</button>
      <div style={{ marginTop: "10px" }}>
        <strong>Answer:</strong>
        <p>{answer}</p>
      </div>

      <h3>3. View Stored Data</h3>
      <button onClick={viewData}>View Chunks & KG</button>
      {viewDataMessage && <p>{viewDataMessage}</p>}

      {chunks.length > 0 && (
        <div>
          <h4>Chunks:</h4>
          <ul>{chunks.map((chunk, i) => <li key={i}>{chunk}</li>)}</ul>
        </div>
      )}

      {kg.nodes.length > 0 && (
        <div>
          <h4>Knowledge Graph:</h4>
          <div ref={networkRef} style={{ height: "500px", border: "1px solid #ccc" }}></div>
        </div>
      )}
    </div>
  );
}