import operator
import json
from dataclasses import dataclass, field
from typing_extensions import List
from langchain_core.documents import Document
from langchain_ollama import ChatOllama

from .vectorstore import VectorStore
from ..state import SummaryState

# load the LLM
llm_json = ChatOllama(model="llama3.2:latest", 
                 base_url="http://localhost:11434",
                 temperature=0.0,
                 json_mode=True)

def document_search(search_query: str, vectorstore: VectorStore):
    """
    Parses JSON string output from LLM grading response
    Args:
        state (dict): The current graph state

    Returns:
        list: List of parsed JSON grades
    """

    def _format_search_response(filtered_documents:List[Document]):
        formatted_documents = []
        for document in filtered_documents:
            formatted_documents.append({
                "title": document.metadata["filename"],
                "url": "n/a",
                "content": document.page_content
            })
        return {
            "results": formatted_documents,
        }
    
    def _batch_instruction_template(docs:List[Document], search_query:str):
        return [document_grading_instructions.format(
            search_query=search_query,
            document=doc.page_content
        ) for doc in docs]

    document_grading_instructions = """You are a precise document relevance evaluator. Your task is to assess how well a retrieved document matches a search query.
        INPUT:
        document: {document}
        search_query: {search_query}

        EVALUATION CRITERIA:
        1. Semantic Relevance:
        - Check if the document contains key concepts from the search query
        - Look for semantic matches, not just exact keyword matches
        - Consider contextual meaning and relationships between terms

        2. Information Value:
        - Assess if the document provides useful information for answering the query
        - Consider both direct and indirect relevance
        - Evaluate information density and specificity

        SCORING RULES:
        - Score "yes" if the document:
        * Contains relevant concepts or information
        * Would help answer or contextualize the query
        * Has meaningful semantic overlap with the query

        - Score "no" if the document:
        * Is completely unrelated to the query topic
        * Contains no useful information for the query
        * Has only incidental keyword matches

        You MUST provide the binary score as a JSON with a single key 'score' and no premable or explaination:
        {{
            "score": "string" // "yes" or "no"
        }}"""

    if not isinstance(search_query, str) or not search_query.strip():
        raise ValueError("Search query must be a non-empty string")

    # retrieve documents
    retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
    retrieved_documents = retriever.invoke(search_query)

    # grade documents and parse JSON
    result_json = llm_json.batch(
        _batch_instruction_template(retrieved_documents, search_query)
    )
    
    filtered_documents = []
    for i, response in enumerate(result_json):
        result = json.loads(response.content)
        if result['score'] == "yes":
            filtered_documents.append(retrieved_documents[i])

    return _format_search_response(filtered_documents)
