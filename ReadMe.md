# PDF QA Pipeline with LangChain, Chroma, Neo4j, and Ollama

## Project Overview
A comprehensive end-to-end PDF QA pipeline that combines document processing, vector search, knowledge graph construction, and interactive visualization:

- **PDF Processing**: Upload PDFs → chunk → store embeddings in Chroma vector database
- **Knowledge Graph**: Extract concepts → build relationships → store in Neo4j graph database  
- **Question Answering**: LLM-powered QA using Ollama Phi-3 with retrieval-augmented generation
- **Interactive Frontend**: React-based UI with vis-network for KG visualization and chunk exploration

## Tech Stack

### Backend
- **Framework**: FastAPI with CORS middleware
- **Document Processing**: LangChain (PyPDFLoader, RecursiveCharacterTextSplitter)
- **Vector Database**: Chroma with sentence-transformers embeddings
- **Graph Database**: Neo4j with Python driver
- **LLM**: Ollama with Phi-3 model
- **Package Management**: Poetry

### Frontend
- **Framework**: React 18
- **Network Visualization**: vis-network for interactive knowledge graph display
- **HTTP Client**: Axios for API communication
- **Build Tool**: Create React App

## Project Structure
```
graphkg-rag-demo/
├── pyproject.toml          # Poetry configuration and dependencies
├── ReadMe.md               # This file
├── src/
│   ├── backend/
│   │   ├── main.py         # FastAPI application with all endpoints
│   │   ├── utils.py        # PDF loading and text splitting utilities
│   │   ├── kg_db.py        # Neo4j database operations
│   │   └── hello.py        # Simple test file
│   └── frontend/
│       ├── package.json    # Frontend dependencies
│       └── src/
│           ├── App.jsx     # Main React component
│           └── index.jsx   # React entry point
```

## Installation & Setup

### Prerequisites
- Python 3.11+
- Node.js 16+
- Docker (for Neo4j)
- Poetry (Python package manager)

### Backend Setup
```bash
cd src/backend
poetry shell
poetry install
```

### Neo4j Setup
```bash
# Start Neo4j container
docker run -d --name neo4j \
  -p 7687:7687 -p 7474:7474 \
  -e NEO4J_AUTH=neo4j/test \
  neo4j:latest

# Access Neo4j browser at http://localhost:7474
# Default credentials: neo4j/test
```

### Ollama Setup
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull Phi-3 model
ollama pull phi3
```

### Frontend Setup
```bash
cd src/frontend
npm install
npm start
```

## Running the Application

### Start Backend
```bash
cd src/backend
poetry shell
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Start Frontend
```bash
cd src/frontend
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- Neo4j Browser: http://localhost:7474

## Features

### 1. PDF Processing & Embedding
- PDF upload and processing using LangChain
- Text chunking with configurable size (500 chars) and overlap (50 chars)
- Vector embeddings using sentence-transformers/all-MiniLM-L6-v2
- Persistent storage in Chroma vector database

### 2. Knowledge Graph Construction
- Automatic concept extraction from PDF chunks
- Node creation for each concept
- Relationship creation between consecutive concepts
- Neo4j graph database storage and querying

### 3. Question Answering
- Retrieval-augmented generation (RAG) pipeline
- Semantic search using vector similarity
- LLM-powered answer generation with Ollama Phi-3
- Relevant concept highlighting in knowledge graph

### 4. Interactive Visualization
- Real-time knowledge graph display using vis-network
- Dynamic node highlighting based on question relevance
- PDF chunk exploration and viewing
- Responsive web interface

## API Endpoints

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/upload_pdf` | POST | Upload and process PDF file | `file: UploadFile` | Upload confirmation with chunk count |
| `/ask_question` | POST | Ask question and get answer | `{"question": "string"}` | Answer + relevant concepts |
| `/get_chunks` | GET | Retrieve all PDF chunks | - | Array of text chunks |
| `/get_kg` | GET | Get knowledge graph data | - | Nodes and edges arrays |

## Usage Workflow

1. **Upload PDF**: Select a PDF file and upload it through the web interface
2. **Processing**: The system automatically chunks the PDF, creates embeddings, and builds a knowledge graph
3. **Ask Questions**: Type questions in natural language and get AI-generated answers
4. **Explore Data**: View the extracted chunks and interactive knowledge graph
5. **Visual Insights**: See relevant concepts highlighted in the graph based on your questions

## Configuration

### Backend Settings
- **Chunk Size**: 500 characters (configurable in `utils.py`)
- **Chunk Overlap**: 50 characters
- **Embedding Model**: sentence-transformers/all-MiniLM-L6-v2
- **LLM Model**: Ollama phi3
- **Vector Search**: Top 3 most relevant documents

### Database Settings
- **Neo4j**: Localhost:7687, credentials: neo4j/test
- **Chroma**: Local directory storage (`./chroma_db`)

## Development

### Adding New Features
- Backend: Extend FastAPI endpoints in `main.py`
- Frontend: Modify React components in `src/frontend/src/`
- Database: Update Neo4j operations in `kg_db.py`

### Testing
- Backend: Use FastAPI's automatic API documentation at http://localhost:8000/docs
- Frontend: React development server with hot reload

## Troubleshooting

### Common Issues
1. **Neo4j Connection**: Ensure Docker container is running and accessible
2. **Ollama Model**: Verify phi3 model is downloaded with `ollama list`
3. **Port Conflicts**: Check if ports 3000, 8000, 7474, or 7687 are available
4. **Dependencies**: Ensure Poetry and npm dependencies are properly installed

### Logs
- Backend: Check terminal output for FastAPI logs
- Frontend: Check browser console for React errors
- Neo4j: Check Docker logs with `docker logs neo4j`


## License

This project is open source and available under the MIT License.
