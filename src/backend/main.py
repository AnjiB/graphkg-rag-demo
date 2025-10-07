from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from utils import load_and_split_document
from kg_db import add_concepts, driver, get_all_concepts
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.llms import Ollama
from langchain.chains import RetrievalQA
import os
import tempfile
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

vectordb = None
retriever = None
qa_chain = None
pdf_chunks_data = []

embeddings_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
llm = Ollama(model="phi3")

# Configuration
CHROMA_DB_PATH = os.path.join(os.path.dirname(__file__), "chroma_db")

def initialize_system():
    """Initialize the system by loading existing data if available"""
    global vectordb, retriever, qa_chain, pdf_chunks_data
    
    # Try to load existing ChromaDB
    if os.path.exists(CHROMA_DB_PATH) and len(os.listdir(CHROMA_DB_PATH)) > 0:
        print(f"🔍 Found ChromaDB directory with {len(os.listdir(CHROMA_DB_PATH))} items")
        try:
            vectordb = Chroma(persist_directory=CHROMA_DB_PATH, embedding_function=embeddings_model)
            retriever = vectordb.as_retriever(search_kwargs={"k": 3})
            qa_chain = RetrievalQA.from_chain_type(llm=llm, retriever=retriever)
            
            # Check if ChromaDB has any documents
            try:
                # Try to get a sample document to check if ChromaDB has data
                sample_docs = vectordb.similarity_search("test", k=1)
                if sample_docs:
                    print("✅ Loaded existing ChromaDB with data")
                else:
                    print("✅ Loaded existing ChromaDB (empty)")
            except Exception as e:
                print(f"✅ Loaded existing ChromaDB (could not check content: {e})")
            
            pdf_chunks_data = []  # Always empty since we don't load from chunks_data.json
        except Exception as e:
            print(f"⚠️  Could not load existing ChromaDB: {e}")
            print("   Starting with empty database")
            pdf_chunks_data = []
    else:
        print("📝 No existing ChromaDB found, starting fresh")
        pdf_chunks_data = []

# Initialize system on startup
initialize_system()

@app.on_event("startup")
async def startup_event():
    """Initialize system on FastAPI startup"""
    initialize_system()

@app.get("/status")
async def get_status():
    """Get system status"""
    return {
        "system_ready": qa_chain is not None,
        "chunks_count": len(pdf_chunks_data),
        "has_vectordb": vectordb is not None,
        "has_retriever": retriever is not None,
        "has_qa_chain": qa_chain is not None
    }

@app.post("/upload_document")
async def upload_document(file: UploadFile = File(...)):
    global vectordb, retriever, qa_chain, pdf_chunks_data
    
    # Get file extension
    file_extension = os.path.splitext(file.filename)[1].lower()
    
    # Validate file type
    supported_extensions = ['.pdf', '.txt', '.md', '.py', '.js', '.html', '.css', '.json', '.xml']
    if file_extension not in supported_extensions:
        return JSONResponse(
            {"error": f"Unsupported file type: {file_extension}. Supported types: {', '.join(supported_extensions)}"}, 
            status_code=400
        )
    
    # Create temporary file with proper extension
    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=file_extension)
    tmp_file.write(await file.read())
    tmp_file.close()

    try:
        chunks = load_and_split_document(tmp_file.name)
        pdf_chunks_data = [doc.page_content for doc in chunks]

        concepts = [chunk.split()[0] for chunk in pdf_chunks_data[:5] if chunk.split()]
        add_concepts(concepts)

        vectordb = Chroma.from_documents(chunks, embeddings_model, persist_directory=CHROMA_DB_PATH)
        retriever = vectordb.as_retriever(search_kwargs={"k":3})
        qa_chain = RetrievalQA.from_chain_type(llm=llm, retriever=retriever)

        os.unlink(tmp_file.name)
        return {"message": f"Uploaded {file.filename} ({file_extension}), stored {len(chunks)} chunks."}
    
    except Exception as e:
        os.unlink(tmp_file.name)
        return JSONResponse({"error": f"Error processing file: {str(e)}"}, status_code=500)

# Keep the old endpoint for backward compatibility
@app.post("/upload_pdf")
async def upload_pdf(file: UploadFile = File(...)):
    return await upload_document(file)

@app.post("/ask_question")
async def ask_question(data: dict):
    question = data.get("question")
    if not qa_chain:
        return JSONResponse({"error": "No documents uploaded yet."}, status_code=404)

    # Get relevant documents first
    relevant_docs = retriever.get_relevant_documents(question)
    relevant_concepts = [doc.page_content.split()[0] for doc in relevant_docs if doc.page_content.split()]
    
    # Get the answer
    answer = qa_chain.run(question)
    
    return {
        "answer": answer, 
        "relevant_concepts": relevant_concepts,
        "retrieved_docs_count": len(relevant_docs)
    }

@app.get("/get_chunks")
async def get_chunks():
    if not pdf_chunks_data:
        return JSONResponse({"message": "No data. Upload a PDF first."}, status_code=404)
    return {"chunks": pdf_chunks_data}

@app.get("/get_kg")
async def get_kg():
    with driver.session() as session:
        nodes = session.run("MATCH (n) RETURN n.name AS name")
        edges = session.run("MATCH (a)-[r]->(b) RETURN a.name AS from, type(r) AS rel, b.name AS to")
        node_list = [record["name"] for record in nodes]
        edge_list = [{"from": record["from"], "to": record["to"], "rel": record["rel"]} for record in edges]
    if not node_list:
        return JSONResponse({"message": "No data. Upload a PDF first."}, status_code=404)
    return {"nodes": node_list, "edges": edge_list}