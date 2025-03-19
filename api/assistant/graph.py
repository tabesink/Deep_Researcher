import json
import asyncio

from typing import List
from typing_extensions import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
# from langchain_ollama import ChatOllama
from langgraph.graph import START, END, StateGraph

from assistant.configuration import Configuration, SearchAPI
from assistant.utils import deduplicate_and_format_sources, format_sources, load_pkl_files #tavily_search, perplexity_search, duckduckgo_search 
from assistant.state import SummaryState, SummaryStateInput, SummaryStateOutput
from assistant.prompts import query_writer_instructions, summarizer_instructions, reflection_instructions, document_grading_instructions
from assistant.vectorstore import VectorStore

from langchain_core.documents import Document

# NOTE: This needs to be run uplong app initialization
#from assistant.document_search import VectorStore, document_search, parse_documents, aadd_documents_to_vectorstore


#Load the vectorstore and add documents --> TODO: clean this up
async def load_vectorstore():
    # Load the parsed document pkl files
    pkl_dict = load_pkl_files(parsed_document_dir="./parsed_documents")
    # Load the vectorstore
    vectorstore = VectorStore()
    vectorstore.add_pkl_dict_to_vectorstore(pkl_dict)
    return vectorstore
vectorstore = asyncio.run(load_vectorstore())

# Nodes
def generate_query(state: SummaryState, config: RunnableConfig):
    """ Generate a query for web search """

    # Format the prompt
    query_writer_instructions_formatted = query_writer_instructions.format(research_topic=state.research_topic)

    # Generate a query
    configurable = Configuration.from_runnable_config(config)

    llm_json_mode = ChatOpenAI(model=configurable.openai_model,
                               base_url=configurable.openai_base_url,
                               api_key=configurable.openai_api_key,
                               temperature=0.0,
                               response_format={"type": "json_object"})
    
    
    result = llm_json_mode.invoke(
        [SystemMessage(content=query_writer_instructions_formatted),
        HumanMessage(content=f"Generate a query for web search:")]
    )
    query = json.loads(result.content)

    return {"search_query": query['query']}


def document_search(state: SummaryState, config: RunnableConfig):
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

    # Configure
    configurable = Configuration.from_runnable_config(config)
    
    search_query = state.search_query
    
    llm_json_mode = ChatOpenAI(model=configurable.openai_model,
                               base_url=configurable.openai_base_url,
                               api_key=configurable.openai_api_key,
                               temperature=0.0,
                               response_format={"type": "json_object"})
    

    if not isinstance(search_query, str) or not search_query.strip():
        raise ValueError("Search query must be a non-empty string")

    # retrieve documents
    retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
    retrieved_documents = retriever.invoke(search_query)

    # grade documents and parse JSON
    result_json = llm_json_mode.batch(
        _batch_instruction_template(retrieved_documents, search_query)
    )
    
    filtered_documents = []
    for i, response in enumerate(result_json):
        result = json.loads(response.content)
        if result['score'] == "yes":
            filtered_documents.append(retrieved_documents[i])

    search_results = _format_search_response(filtered_documents)
    search_str = deduplicate_and_format_sources(search_results, max_tokens_per_source=1000, include_raw_content=True)

    return {"sources_gathered": [format_sources(search_results)], "research_loop_count": state.research_loop_count + 1, "document_search_results": [search_str]}

def web_research(state: SummaryState, config: RunnableConfig):
    """ Gather information from the web """

    # Configure
    configurable = Configuration.from_runnable_config(config)

    # Handle both cases for search_api:
    # 1. When selected in Studio UI -> returns a string (e.g. "tavily")
    # 2. When using default -> returns an Enum (e.g. SearchAPI.TAVILY)
    if isinstance(configurable.search_api, str):
        search_api = configurable.search_api
    else:
        search_api = configurable.search_api.value

    # Search routes
    if search_api == "tavily":
        search_results = tavily_search(state.search_query, include_raw_content=True, max_results=1)
        search_str = deduplicate_and_format_sources(search_results, max_tokens_per_source=1000, include_raw_content=True)
    elif search_api == "perplexity":
        search_results = perplexity_search(state.search_query, state.research_loop_count)
        search_str = deduplicate_and_format_sources(search_results, max_tokens_per_source=1000, include_raw_content=False)
    elif search_api == "duckduckgo":
        search_results = duckduckgo_search(state.search_query, max_results=3, fetch_full_page=configurable.fetch_full_page)
        search_str = deduplicate_and_format_sources(search_results, max_tokens_per_source=1000, include_raw_content=True)
    else:
        raise ValueError(f"Unsupported search API: {configurable.search_api}")
    """ elif search_api == "document_search":
        search_results = document_search(state.search_query)
        search_str = deduplicate_and_format_sources(search_results, max_tokens_per_source=1000, include_raw_content=True) """
    
    return {"sources_gathered": [format_sources(search_results)], "research_loop_count": state.research_loop_count + 1, "web_research_results": [search_str]}

def summarize_sources(state: SummaryState, config: RunnableConfig):
    """ Summarize the gathered sources """

    # Existing summary
    existing_summary = state.running_summary

    # Most recent web research
    #most_recent_web_research = state.web_research_results[-1]
    most_recent_document_search = state.document_search_results[-1]
    
    # Build the human message
    if existing_summary:
        human_message_content = (
            f"<User Input> \n {state.research_topic} \n <User Input>\n\n"
            f"<Existing Summary> \n {existing_summary} \n <Existing Summary>\n\n"
            #f"<New Search Results> \n {most_recent_web_research} \n <New Search Results>"
            f"<New Search Results> \n {most_recent_document_search} \n <New Search Results>"
        )
    else:
        human_message_content = (
            f"<User Input> \n {state.research_topic} \n <User Input>\n\n"
            #f"<Search Results> \n {most_recent_web_research} \n <Search Results>"
            f"<Search Results> \n {most_recent_document_search} \n <Search Results>"
        )

    # Run the LLM
    configurable = Configuration.from_runnable_config(config)
    llm = ChatOpenAI(model=configurable.openai_model,
                     base_url=configurable.openai_base_url,
                     api_key=configurable.openai_api_key,
                     temperature=0.0,)
    
    
    result = llm.invoke(
        [SystemMessage(content=summarizer_instructions),
        HumanMessage(content=human_message_content)]
    )

    running_summary = result.content

    # TODO: This is a hack to remove the <think> tags w/ Deepseek models
    # It appears very challenging to prompt them out of the responses
    while "<think>" in running_summary and "</think>" in running_summary:
        start = running_summary.find("<think>")
        end = running_summary.find("</think>") + len("</think>")
        running_summary = running_summary[:start] + running_summary[end:]

    return {"running_summary": running_summary}

def reflect_on_summary(state: SummaryState, config: RunnableConfig):
    """ Reflect on the summary and generate a follow-up query """

    # Generate a query
    configurable = Configuration.from_runnable_config(config)
    
    
    #llm_json_mode = ChatOllama(base_url=configurable.ollama_base_url, model=configurable.local_llm, temperature=0, format="json")
    llm_json_mode = ChatOpenAI(model=configurable.openai_model,
                               base_url=configurable.openai_base_url,
                               api_key=configurable.openai_api_key,
                               temperature=0.0,
                               response_format={"type": "json_object"})
    
    
    
    result = llm_json_mode.invoke(
        [SystemMessage(content=reflection_instructions.format(research_topic=state.research_topic)),
        HumanMessage(content=f"Identify a knowledge gap and generate a follow-up web search query based on our existing knowledge: {state.running_summary}")]
    )
    follow_up_query = json.loads(result.content)

    # Get the follow-up query
    query = follow_up_query.get('follow_up_query')

    # JSON mode can fail in some cases
    if not query:

        # Fallback to a placeholder query
        return {"search_query": f"Tell me more about {state.research_topic}"}

    # Update search query with follow-up query
    return {"search_query": follow_up_query['follow_up_query']}

def finalize_summary(state: SummaryState):
    """ Finalize the summary """

    # Format all accumulated sources into a single bulleted list
    all_sources = "\n".join(source for source in state.sources_gathered)
    state.running_summary = f"## Summary\n\n{state.running_summary}\n\n ### Sources:\n{all_sources}"
    return {"running_summary": state.running_summary}

def route_research(state: SummaryState, config: RunnableConfig) -> Literal["finalize_summary", "document_search"]: # "web_research"
    """ Route the research based on the follow-up query """

    configurable = Configuration.from_runnable_config(config)
    
    # NOTE: TEST
    print(f"research_loop_count: {state.research_loop_count}")
    
    
    if state.research_loop_count <= configurable.max_research_loops:
        return "document_search" # "web_research"
    else:
        return "finalize_summary"

# Add nodes and edges
builder = StateGraph(SummaryState, input=SummaryStateInput, output=SummaryStateOutput, config_schema=Configuration)
builder.add_node("generate_query", generate_query)
#builder.add_node("web_research", web_research)
builder.add_node("document_search", document_search)
builder.add_node("summarize_sources", summarize_sources)
builder.add_node("reflect_on_summary", reflect_on_summary)
builder.add_node("finalize_summary", finalize_summary)

# Add edges
builder.add_edge(START, "generate_query")
builder.add_edge("generate_query", "document_search")
builder.add_edge("document_search", "summarize_sources")
#builder.add_edge("generate_query", "web_research")
#builder.add_edge("web_research", "summarize_sources")
builder.add_edge("summarize_sources", "reflect_on_summary")
builder.add_conditional_edges("reflect_on_summary", route_research)
builder.add_edge("finalize_summary", END)

graph = builder.compile()