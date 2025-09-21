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

# Keep the old function for backward compatibility
def load_and_split_pdf(file_path: str):
    return load_and_split_document(file_path)