# Inference endpoing for deep researcher: latest version (2025-03-14)

# In memory ssession management: https://blog.futuresmart.ai/building-rag-applications-without-langchain-or-llamaindex

import warnings
warnings.filterwarnings('ignore', category=UserWarning)

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

#from langgraph.checkpoint.memory import MemorySaver 

from assistant.graph import graph

# Load the environment variables for API credentials
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY is not set")

# Define the data models for the input and output
class ChatMessage(BaseModel):
    role: str
    content: str

""" class ChatOptions(BaseModel):
    selectedModel: str
    systemPrompt: Optional[str] = None
    temperature: float = 0.0 """

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str
    temperature: float = 0.0
    stream: bool = False
    # chatOptions field is no longer needed

 
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
        # Convert messages to the expected format
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
            async for token in graph.astream(
                {"research_topic": messages[-1]["content"]},
                {"configurable": {"thread_id": thread_id}},
                stream_mode="updates" 
            ):
                if isinstance(token, dict):
                    content = ""
                    if 'generate_query' in token:
                        content = f"Searching for: {token['generate_query']['search_query']}\n"
                    elif 'finalize_summary' in token:
                        content = token['finalize_summary']['running_summary']
                    
                    if content:
                        chunk = {
                            'id': f'chatcmpl-{str(uuid.uuid4())}',  # Updated to match OpenAI format
                            'object': 'chat.completion.chunk',
                            'created': int(time.time()),
                            'model': request.model,
                            'choices': [{
                                'index': 0,
                                'delta': {
                                    'content': content
                                },
                                'finish_reason': None
                            }]
                        }
                        yield f"data: {json.dumps(chunk)}\n\n"
            
            # Send final chunk with finish_reason
            final_chunk = {
                'id': f'chatcmpl-{str(uuid.uuid4())}',
                'object': 'chat.completion.chunk',
                'created': int(time.time()),
                'model': request.model,
                'choices': [{
                    'index': 0,
                    'delta': {},
                    'finish_reason': 'stop'
                }]
            }
            yield f"data: {json.dumps(final_chunk)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(generate_stream(), media_type="text/event-stream")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
    
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8443)