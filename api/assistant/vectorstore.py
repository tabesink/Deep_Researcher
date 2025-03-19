import time

from qdrant_client import QdrantClient, models
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import FastEmbedSparse, QdrantVectorStore, RetrievalMode
from langchain_core.documents import Document
from typing import List

from assistant.configuration import Configuration

class VectorStore:
    """In memory vector store - supports dense and sparse embeddings"""
    def __init__(self):
        # in-memory
        self.client = QdrantClient(":memory:")
        self.collection_name="in_memory_collection"

        # Initialize dense and sparse embedding models
        self.dense_embedding_model = OpenAIEmbeddings(
            model=Configuration.openai_embedding_model,
            openai_api_key=Configuration.openai_api_key,
            openai_api_base=Configuration.openai_base_url
            )
        self.sparse_embedding_model = FastEmbedSparse(model_name="Qdrant/BM25")

        # create the collection if it doesn't exist
        if not self.client.collection_exists(self.collection_name):
            self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config={
                "dense_vector": models.VectorParams(
                    size=1536, distance=models.Distance.COSINE # ollama embeds are 1024
                    )
            },
            sparse_vectors_config={
                "sparse_vector": models.SparseVectorParams(
                    index=models.SparseIndexParams(
                        on_disk=False,
                    )
                )
            },
            )
            print(f"Collection '{self.collection_name}' created")
        else:
            print(f"Loading existing collection: '{self.collection_name}'")
            
        # load the collection
        self._vector_store = self._as_vector_store(self.collection_name)
        
    def as_retriever(self, search_kwargs={"k": 5}):
        return self._vector_store.as_retriever(search_kwargs=search_kwargs)
    
    def add_pkl_dict_to_vectorstore(self, pkl_dict:dict):
        """Adds a dictionary of parsed documents to the vector store
        Args:
            pkl_dict (dict): A dictionary of parsed documents created by llamaparser 
        """
        start_time = time.time()
        docs=[]
        for i, key in enumerate(pkl_dict.keys()):
            print(f" {i+1}. {key}, Adding to vector store...")
            for doc in pkl_dict[key]['chunks']:
                docs.append(Document(page_content=doc.page_content, metadata={
                    "filename": doc.metadata["filename"],
                    "file_path": doc.metadata["paper_path"],
                    "chunk_id": doc.metadata["chunk_num"],
                    "context": doc.metadata["context"]}))
            
        # add docs to vector store
        self.add_documents(docs)
        end_time = time.time()
        print(f"Time taken to add documents to vector store: {round(end_time - start_time, 1)} seconds")

    def add_documents(self, documents:List[Document]):
        """Add documents to the vectorstore."""
        # Skip if no documents are provided
        if not documents:
            print("No documents to add, skipping...")
            return
        
        # get filname in metadata
        filename = documents[0].metadata["filename"]

        # get the number of points in the collection
        point_count = self.client.count(self.collection_name)
        
        # create a list of ids for the documents
        ids = list(range(1, point_count.count))
        
        # Get the existing documents in the collection
        records = self._vector_store.client.retrieve(
            ids=ids,
            collection_name=self.collection_name,
            with_payload=True
        )

        # Extract unique titles from metadata
        existing_docs = list(set([record.payload['metadata']['filename'] for record in records]))

        if filename in existing_docs:
            message = f"Document {filename} already exists in collection. Skipping upload."
            return message

        """ # Filter out documents that already exist
        documents = [doc for doc in documents if doc.metadata["filename"] not in existing_docs]
        
        # Skip if all documents already exist
        if not documents:
            print("All documents already exist in collection. Skipping upload.")
            return """
        
        # create a list of ids for the documents
        ids = list(range(point_count.count + 1, point_count.count + len(documents) + 1))
        
        # add the documents to the collection
        self._vector_store.add_documents(documents=documents, ids=ids)

        message = f'{len(documents)} document chunks are added to the vector store'
        return message
    
    def _as_vector_store(self, collection_name):
        return QdrantVectorStore(
            client=self.client,
            collection_name=collection_name,
            embedding=self.dense_embedding_model,
            sparse_embedding=self.sparse_embedding_model,
            retrieval_mode=RetrievalMode.HYBRID,
            vector_name="dense_vector",
            sparse_vector_name="sparse_vector",
        )
    
    def _inspect_collection(self,):
        """inspect qdrant database collections"""
        
        # Get the existing documents in the collection
        point_count = self.client.count(self.collection_name)
        ids = list(range(1, point_count.count + 1))
        
        records = self.client.retrieve(
            ids=ids,
            collection_name=self.collection_name,
            with_payload=True
        )

        # Extract unique titles from metadata
        existing_docs = list(set([record.payload['metadata']['filename'] for record in records]))
        print(f" Documents in collection:")
        for i, doc_name in enumerate(existing_docs):
            print(f"  {i+1}. {doc_name}")
        print('\n')