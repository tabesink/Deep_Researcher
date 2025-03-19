# Inference endpoing for deep researcher: latest version (2025-03-14)

# In memory ssession management: https://blog.futuresmart.ai/building-rag-applications-without-langchain-or-llamaindex



import os
import time
import uuid
import json
import uvicorn
import uuid

from typing import List, Optional
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessageChunk

#from langgraph.checkpoint.memory import MemorySaver 

from assistant.graph import graph

""" # Load the environment variables for API credentials
VLLM_URL = os.getenv("VLLM_URL")
VLLM_API_KEY = os.getenv("VLLM_API_KEY")
if not VLLM_URL or not VLLM_API_KEY:
    raise ValueError("VLLM_URL or VLLM_API_KEY is not set") """

# Define the data models for the input and output
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatOptions(BaseModel):
    selectedModel: str
    systemPrompt: Optional[str] = None
    temperature: float = 0.0

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str
    temperature: float = 0.0
    stream: bool = False
    # chatOptions field is no longer needed

# Initialize RAG graph at module level
#graph = AgentGraph()

# Initialize memory
#memory = MemorySaver() 


thread_id = str(uuid.uuid4())



# Initialize FastAPI app
app = FastAPI()

# Helper function to format and add system messages
def add_system_message(messages: List[ChatMessage], system_prompt: Optional[str] = None) -> List[ChatMessage]:
    if not system_prompt:
        return messages
    # Add system message to the start of the messages list
    if not messages:
        messages = [{"role": "system", "content": system_prompt}]
    elif messages[0]["role"] != "system":
        messages.insert(0, {"role": "system", "content": system_prompt})
    return messages


# Define the endpoint for retrieving available models
@app.get("/v1/models")
async def get_models():
    try:
        # Check if specific model is configured via environment variable
        env_model = os.getenv("VLLM_MODEL")
        if env_model:
            return {
                "object": "list",
                "data": [
                    {
                        "id": env_model
                    }
                ]
            }

        # Return a dummy models response
        return {
            "object": "list",
            "data": [
                {
                    "id": "local-model",
                    "object": "model",
                    "created": 1677610602,
                    "owned_by": "mtc"
                },
            ]
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal Server Error: {str(e)}"
        )


# Define the endpoint for chat interaction
@app.post("/v1/chat/completions")
async def chat(request: ChatRequest):
    try:
        # Convert Pydantic messages to LangChain messages
        messages = [
            {
                "type": "human" if msg.role == "user" else "assistant" if msg.role == "assistant" else "system",
                "content": msg.content
            }
            for msg in request.messages
        ]

        if not request.model:
            raise HTTPException(status_code=400, detail="Model is required")

        async def generate_stream():
            async for token_ in graph.astream(
                {"research_topic": messages[-1]["content"]},  # Use the last message content as the research topic
                {"configurable": {"thread_id": thread_id}},
                stream_mode="messages"):

                    token = token_[0]
                    # Stream intermediate research updates
                    if isinstance(token, AIMessageChunk):
                        content = token.content
                        
                        # Stream regular content
                        yield f"data: {json.dumps({
                            'id': f'chat-{str(uuid.uuid4())}',
                            'object': 'chat.completion.chunk',
                            'created': int(time.time()), 
                            'model': request.model,
                            'choices': [{
                                'index': 0,
                                'delta': {
                                    'role': 'assistant',
                                    'content': content
                                },
                                'finish_reason': None
                            }]
                        })}\n\n"
                            
                        """ # Check if content contains JSON-like structure
                        if '"query"' in content or '"aspect"' in content or '"rationale"' in content:
                            try:
                                # Try to parse JSON from content
                                json_data = json.loads(content)
                                # Extract values directly from parsed JSON
                                query = json_data.get('query', '')
                                aspect = json_data.get('aspect', '')
                                rationale = json_data.get('rationale', '')
                                
                                # Stream as a single message
                                message = f"Query: {query}\nAspect: {aspect}\nRationale: {rationale}\n"
                                yield f"data: {json.dumps({
                                    'id': f'chat-{str(uuid.uuid4())}',
                                    'object': 'chat.completion.chunk',
                                    'created': int(time.time()),
                                    'model': request.model, 
                                    'choices': [{
                                        'index': 0,
                                        'delta': {
                                            'role': 'assistant',
                                            'content': message
                                        },
                                        'finish_reason': None
                                    }]
                                })}\n\n"
                            except json.JSONDecodeError:
                            # If JSON parsing fails, stream content as-is
                            yield f"data: {json.dumps({
                                'id': f'chat-{str(uuid.uuid4())}',
                                'object': 'chat.completion.chunk',
                                'created': int(time.time()),
                                'model': request.model,
                                'choices': [{
                                    'index': 0,
                                    'delta': {
                                        'role': 'assistant', 
                                        'content': content
                                    },
                                    'finish_reason': None
                                }]
                            })}\n\n"
                        else:
                            # Stream regular content
                            yield f"data: {json.dumps({
                                'id': f'chat-{str(uuid.uuid4())}',
                                'object': 'chat.completion.chunk',
                                'created': int(time.time()), 
                                'model': request.model,
                                'choices': [{
                                    'index': 0,
                                    'delta': {
                                        'role': 'assistant',
                                        'content': content
                                    },
                                    'finish_reason': None
                                }]
                            })}\n\n" """
                            
                        """ if 'generate_query' in token.content:
                            # Extract query, aspect, rationale from token content
                            content_lines = token.content.split('\n')
                            query = next((line.split('": "')[1].rstrip('",') for line in content_lines if '"query"' in line), '')
                            aspect = next((line.split('": "')[1].rstrip('",') for line in content_lines if '"aspect"' in line), '')
                            rationale = next((line.split('": "')[1].rstrip('",') for line in content_lines if '"rationale"' in line), '')
                            
                            yield f"data: {json.dumps({
                                'id': f'chat-{str(uuid.uuid4())}', 
                                'object': 'chat.completion.chunk',
                                'created': int(time.time()),
                                'model': request.model,
                                'choices': [{
                                    'index': 0,
                                    'delta': {
                                        'role': 'assistant',
                                        'content': f"Query: {query}\nAspect: {aspect}\nRationale: {rationale}\n"
                                    },
                                    'finish_reason': None
                                }]
                            })}\n\n" """

                        """ # Handle 'finalize_summary' condition
                        elif 'finalize_summary' in token:
                            running_summary = token['finalize_summary'].get('running_summary', '')
                            yield f"data: {json.dumps({
                                'id': f'chat-{str(uuid.uuid4())}',
                                'object': 'chat.completion.chunk',
                                'created': int(time.time()),
                                'model': request.model,
                                'choices': [{
                                    'index': 0,
                                    'delta': {
                                        'role': 'assistant',
                                        'content': f"{running_summary}"
                                    },
                                    'finish_reason': None
                                }]
                            })}\n\n"

                        # If neither condition is matched, you can handle it as a default case (if necessary)
                        else:
                            yield f"data: {json.dumps({
                                'id': f'chat-{str(uuid.uuid4())}',
                                'object': 'chat.completion.chunk',
                                'created': int(time.time()),
                                'model': request.model,
                                'choices': [{
                                    'index': 0,
                                    'delta': {
                                        'role': 'assistant',
                                        'content': "Processing... please wait."
                                    },
                                    'finish_reason': None
                                }]
                            })}\n\n" """

            # Send final "done" message
            yield "data: [DONE]\n\n"
            
        # Stream response using Server-Sent Events (SSE)
        async def _generate_stream():
            async for token in graph.astream(
                {"research_topic": messages[-1]["content"]},  # Use the last message content as research topic
                {"configurable": {"thread_id": thread_id}},
                stream_mode="updates" 
            ): 
                #print(type(token)) # <class 'tuple'>  stream_mode="messages" --> does acutal streaming 

                # Stream intermediate research updates
                if isinstance(token, dict):
                    # Stream each type of update with appropriate content
                    if 'generate_query' in token:
                        yield f"data: {json.dumps({
                            'id': f'chat-{str(uuid.uuid4())}',
                            'object': 'chat.completion.chunk',
                            'created': int(time.time()),
                            'model': request.model,
                            'choices': [{
                                'index': 0,
                                'delta': {
                                    'role': 'assistant',
                                    'content': f"Searching for: {token['generate_query']['search_query']}\n"
                                },
                                'finish_reason': None
                            }]
                        })}\n\n"

                    elif 'web_research' in token:
                        yield f"data: {json.dumps({
                            'id': f'chat-{str(uuid.uuid4())}',
                            'object': 'chat.completion.chunk',
                            'created': int(time.time()),
                            'model': request.model,
                            'choices': [{
                                'index': 0,
                                'delta': {
                                    'role': 'assistant',
                                    'content': f"Found {len(token['web_research']['sources_gathered'])} relevant sources.\n"
                                },
                                'finish_reason': None
                            }]
                        })}\n\n"

                    elif 'summarize_sources' in token:
                        yield f"data: {json.dumps({
                            'id': f'chat-{str(uuid.uuid4())}',
                            'object': 'chat.completion.chunk',
                            'created': int(time.time()),
                            'model': request.model,
                            'choices': [{
                                'index': 0,
                                'delta': {
                                    'role': 'assistant',
                                    'content': f"{token['summarize_sources']['running_summary']}\n"
                                },
                                'finish_reason': None
                            }]
                        })}\n\n"

                    elif 'finalize_summary' in token:
                        yield f"data: {json.dumps({
                            'id': f'chat-{str(uuid.uuid4())}',
                            'object': 'chat.completion.chunk',
                            'created': int(time.time()),
                            'model': request.model,
                            'choices': [{
                                'index': 0,
                                'delta': {
                                    'role': 'assistant',
                                    'content': f"{token['finalize_summary']['running_summary']}"
                                },
                                'finish_reason': None
                            }]
                        })}\n\n"

            # Send final "done" message
            yield "data: [DONE]\n\n"

        return StreamingResponse(generate_stream(), media_type="text/event-stream")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
    
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8443)
