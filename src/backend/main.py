from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from utils import load_and_split_pdf
from kg_db import add_concepts, driver
from langchain.vectorstores import Chroma
from langchain.embeddings import HuggingFaceEmbeddings
from langchain.chat_models import Ollama
from langchain.chains import RetrievalQA
import os
import tempfile

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

@app.post("/upload_pdf")
async def upload_pdf(file: UploadFile = File(...)):
    global vectordb, retriever, qa_chain, pdf_chunks_data
    
    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp_file.write(await file.read())
    tmp_file.close()

    chunks = load_and_split_pdf(tmp_file.name)
    pdf_chunks_data = [doc.page_content for doc in chunks]

    concepts = [chunk.split()[0] for chunk in pdf_chunks_data[:5] if chunk.split()]
    add_concepts(concepts)

    vectordb = Chroma.from_documents(chunks, embeddings_model, persist_directory="./chroma_db")
    vectordb.persist()
    retriever = vectordb.as_retriever(search_kwargs={"k":3})
    qa_chain = RetrievalQA.from_chain_type(llm=llm, retriever=retriever)

    os.unlink(tmp_file.name)
    return {"message": f"Uploaded {file.filename}, stored {len(chunks)} chunks."}

@app.post("/ask_question")
async def ask_question(data: dict):
    question = data.get("question")
    if not qa_chain:
        return JSONResponse({"error": "No PDF uploaded yet."}, status_code=404)

    answer = qa_chain.run(question)
    relevant_docs = retriever.get_relevant_documents(question)
    relevant_concepts = [doc.page_content.split()[0] for doc in relevant_docs if doc.page_content.split()]

    return {"answer": answer, "relevant_concepts": relevant_concepts}

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