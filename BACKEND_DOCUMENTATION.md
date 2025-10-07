# Backend Documentation: GraphKG RAG Demo

This document provides a comprehensive explanation of the backend codebase, focusing on the document upload and question answering flow.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Dependencies and Imports](#dependencies-and-imports)
3. [System Initialization](#system-initialization)
4. [Document Upload Process](#document-upload-process)
5. [Question Answering Process](#question-answering-process)
6. [Knowledge Graph Integration](#knowledge-graph-integration)
7. [Utility Functions](#utility-functions)
8. [Data Persistence](#data-persistence)
9. [API Endpoints](#api-endpoints)
10. [Key Libraries and Their Roles](#key-libraries-and-their-roles)

## Architecture Overview

The backend implements a **Retrieval-Augmented Generation (RAG)** system with the following components:

- **FastAPI**: Web framework for API endpoints
- **ChromaDB**: Vector database for semantic search
- **Neo4j**: Graph database for concept relationships
- **LangChain**: Document processing and QA orchestration
- **Ollama**: Local LLM for answer generation
- **HuggingFace Embeddings**: Text-to-vector conversion

## Dependencies and Imports

### main.py Imports
```python
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
```

**Purpose of each import:**
- **FastAPI**: Modern, fast web framework with automatic API documentation
- **UploadFile, File**: Handle file uploads from frontend
- **CORSMiddleware**: Enable cross-origin requests between frontend and backend
- **JSONResponse**: Return structured JSON responses
- **utils**: Custom document processing functions
- **kg_db**: Neo4j knowledge graph operations
- **Chroma**: Vector database for storing document embeddings
- **HuggingFaceEmbeddings**: Convert text to numerical vectors for similarity search
- **Ollama**: Local language model for generating answers
- **RetrievalQA**: LangChain chain combining retrieval and question answering

## System Initialization

### Global Variables and Configuration
```python
app = FastAPI()

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state variables
vectordb = None
retriever = None
qa_chain = None
pdf_chunks_data = []

# ML models
embeddings_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
llm = Ollama(model="phi3")

# Configuration paths
CHROMA_DB_PATH = os.path.join(os.path.dirname(__file__), "chroma_db")
```

**Why this setup?**
- **CORS Middleware**: Allows frontend (localhost:3000) to communicate with backend (localhost:8000)
- **Global variables**: Store vector database, retriever, and QA chain for reuse across requests
- **Embeddings model**: `all-MiniLM-L6-v2` is lightweight and efficient for text-to-vector conversion
- **LLM**: `phi3` is a small, fast local language model from Microsoft
- **Paths**: Define persistent storage location for vector database using absolute paths

## Document Upload Process

### Step-by-Step Flow

#### 1. File Validation (Lines 90-99)
```python
file_extension = os.path.splitext(file.filename)[1].lower()
supported_extensions = ['.pdf', '.txt', '.md', '.py', '.js', '.html', '.css', '.json', '.xml']
if file_extension not in supported_extensions:
    return JSONResponse(
        {"error": f"Unsupported file type: {file_extension}. Supported types: {', '.join(supported_extensions)}"}, 
        status_code=400
    )
```
**Purpose**: Prevents processing unsupported files that could cause errors.

#### 2. Temporary File Creation (Lines 101-104)
```python
tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=file_extension)
tmp_file.write(await file.read())
tmp_file.close()
```
**Why temporary file?**
- FastAPI receives file as bytes in memory
- Document loaders need actual file paths
- Temporary files are cleaned up after processing

#### 3. Document Processing (Lines 107-111)
```python
chunks = load_and_split_document(tmp_file.name)
pdf_chunks_data = [doc.page_content for doc in chunks]

concepts = [chunk.split()[0] for chunk in pdf_chunks_data[:5] if chunk.split()]
add_concepts(concepts)
```
**What happens:**
- Document is loaded and split into chunks using appropriate loader
- First 5 chunks are used to extract concepts (first word of each chunk)
- Concepts are added to Neo4j knowledge graph

#### 4. Vector Database Creation (Lines 113-115)
```python
vectordb = Chroma.from_documents(chunks, embeddings_model, persist_directory=CHROMA_DB_PATH)
retriever = vectordb.as_retriever(search_kwargs={"k":3})
qa_chain = RetrievalQA.from_chain_type(llm=llm, retriever=retriever)
```
**Setup explanation:**
- **Chroma.from_documents**: Converts chunks to embeddings and stores them persistently
- **as_retriever**: Creates a retriever that finds most relevant chunks for questions
- **search_kwargs={"k":3}**: Retrieves top 3 most relevant chunks
- **RetrievalQA**: Combines retrieval + LLM to answer questions

#### 5. Data Persistence and Cleanup (Lines 117-121)
```python
os.unlink(tmp_file.name)
return {"message": f"Uploaded {file.filename} ({file_extension}), stored {len(chunks)} chunks."}
```

## Question Answering Process

### Detailed Flow

#### 1. Question Validation (Lines 134-136)
```python
question = data.get("question")
if not qa_chain:
    return JSONResponse({"error": "No documents uploaded yet."}, status_code=404)
```
**Purpose**: Ensures documents have been uploaded and processed first.

#### 2. Document Retrieval (Lines 135-136)
```python
relevant_docs = retriever.get_relevant_documents(question)
relevant_concepts = [doc.page_content.split()[0] for doc in relevant_docs if doc.page_content.split()]
```
**Process:**
- **get_relevant_documents**: Uses vector similarity to find most relevant chunks
- **relevant_concepts**: Extracts first word from each relevant chunk for knowledge graph

#### 3. Answer Generation (Lines 139-145)
```python
answer = qa_chain.run(question)

return {
    "answer": answer, 
    "relevant_concepts": relevant_concepts,
    "retrieved_docs_count": len(relevant_docs)
}
```
**Response includes:**
- **Generated answer**: From LLM using retrieved context
- **Metadata**: Relevant concepts and document count for transparency

## Knowledge Graph Integration

### Neo4j Operations (kg_db.py)

```python
from neo4j import GraphDatabase

driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "Test1234"))

def create_node(tx, label, name):
    tx.run(f"MERGE (n:{label} {{name: $name}})", name=name)

def create_edge(tx, from_node, to_node, rel_type):
    tx.run(
        f"""
        MATCH (a {{name: $from_name}}), (b {{name: $to_name}})
        MERGE (a)-[r:{rel_type}]->(b)
        """,
        from_name=from_node, to_name=to_node
    )

def add_concepts(concepts):
    with driver.session() as session:
        for concept in concepts:
            session.write_transaction(create_node, "Concept", concept)
        for i in range(len(concepts)-1):
            session.write_transaction(create_edge, concepts[i], concepts[i+1], "RELATED_TO")
```

**Why Neo4j?**
- **Graph database**: Perfect for storing relationships between concepts
- **MERGE**: Creates nodes/edges only if they don't exist (prevents duplicates)
- **RELATED_TO**: Connects consecutive concepts to show document flow
- **Sessions**: Neo4j uses sessions for transaction management

**What gets stored:**
- Each concept becomes a node with label "Concept"
- Consecutive concepts are connected with "RELATED_TO" relationships
- Creates a graph showing how concepts relate in the document

## Utility Functions

### Document Processing (utils.py)

```python
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
import os

def load_and_split_document(file_path: str):
    """Load and split documents based on file extension"""
    file_extension = os.path.splitext(file_path)[1].lower()
    
    if file_extension == '.pdf':
        loader = PyPDFLoader(file_path)
    elif file_extension in ['.txt', '.md', '.py', '.js', '.html', '.css', '.json', '.xml']:
        loader = TextLoader(file_path, encoding='utf-8')
    else:
        raise ValueError(f"Unsupported file type: {file_extension}")
    
    docs = loader.load()
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunks = splitter.split_documents(docs)
    return chunks
```

**Why this approach?**
- **File type detection**: Different file types need different loaders
- **PyPDFLoader**: Extracts text from PDF files
- **TextLoader**: Handles plain text files with proper encoding
- **RecursiveCharacterTextSplitter**: Splits documents into chunks of 500 characters with 50-character overlap
- **Chunking is crucial**: Large documents can't fit in LLM context, so we split them into manageable pieces

## Data Persistence

### System Initialization
```python
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
```

**Why persist data?**
- Allows the system to remember uploaded documents between server restarts
- Graceful startup with error handling
- State restoration from persisted ChromaDB data only

## API Endpoints

### 1. System Status
```python
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
```

### 2. Document Upload
```python
@app.post("/upload_document")
async def upload_document(file: UploadFile = File(...)):
    # Document processing logic
    return {"message": f"Uploaded {file.filename} ({file_extension}), stored {len(chunks)} chunks."}
```

### 3. Question Answering
```python
@app.post("/ask_question")
async def ask_question(data: dict):
    # Question answering logic
    return {
        "answer": answer, 
        "relevant_concepts": relevant_concepts,
        "retrieved_docs_count": len(relevant_docs)
    }
```

### 4. Data Retrieval
```python
@app.get("/get_chunks")
async def get_chunks():
    # Return document chunks

@app.get("/get_kg")
async def get_kg():
    # Return knowledge graph data
```

## Key Libraries and Their Roles

| Library | Purpose | Why Used |
|---------|---------|----------|
| **FastAPI** | Web framework | Modern, fast, automatic API documentation |
| **LangChain** | Document processing | Orchestrates chunking, embeddings, and QA chains |
| **ChromaDB** | Vector database | Efficient semantic search and similarity matching |
| **HuggingFace Embeddings** | Text-to-vector | Converts text to numerical vectors for similarity |
| **Ollama** | Local LLM | Fast, local language model for answer generation |
| **Neo4j** | Graph database | Stores concept relationships and document flow |
| **PyPDF/TextLoader** | Document loaders | Extract text from different file formats |

## Complete Flow Summary

### Document Upload Flow:
1. **File validation** → Check supported file types
2. **Temporary file creation** → Save uploaded file temporarily
3. **Document processing** → Split into chunks using appropriate loader
4. **Knowledge graph update** → Extract concepts and add to Neo4j
5. **Vector database creation** → Convert chunks to embeddings and store in Chroma
6. **QA chain setup** → Create retriever + LLM chain
7. **Cleanup** → Remove temporary file

### Question Answering Flow:
1. **Question validation** → Check if documents are uploaded
2. **Document retrieval** → Find most relevant chunks using vector similarity
3. **Answer generation** → Use LLM with retrieved context to generate answer
4. **Response formatting** → Return answer with metadata about relevant concepts

This architecture creates a robust RAG (Retrieval-Augmented Generation) system that can answer questions based on uploaded documents.
