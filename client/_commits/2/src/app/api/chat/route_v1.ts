import {
  CoreMessage,
  CoreUserMessage,
  CoreSystemMessage,
  CoreAssistantMessage,
} from "ai";
import { NextRequest, NextResponse } from "next/server";
import { encodeChat } from "@/lib/token-counter";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const addSystemMessage = (messages: CoreMessage[], systemPrompt?: string) => {
  // early exit if system prompt is empty
  if (!systemPrompt || systemPrompt === "") {
    return messages;
  }

  // add system prompt to the chat (if it's not already there)
  // check first message in the chat
  if (!messages) {
    // if there are no messages, add the system prompt as the first message
    messages = [
      {
        content: systemPrompt,
        role: "system",
      },
    ];
  } else if (messages.length === 0) {
    // if there are no messages, add the system prompt as the first message
    messages.push({
      content: systemPrompt,
      role: "system",
    });
  } else {
    // if there are messages, check if the first message is a system prompt
    if (messages[0].role === "system") {
      // if the first message is a system prompt, update it
      messages[0].content = systemPrompt;
    } else {
      // if the first message is not a system prompt, add the system prompt as the first message
      messages.unshift({
        content: systemPrompt,
        role: "system",
      });
    }
  }
  return messages;
};

const formatMessages = (messages: CoreMessage[], tokenLimit: number) => {
  // Ensure we don't exceed the token limit
  let totalTokens = encodeChat(messages);
  while (totalTokens > tokenLimit && messages.length > 1) {
    // Remove the second message (keeping system prompt if it exists)
    messages.splice(1, 1);
    totalTokens = encodeChat(messages);
  }
  return messages;
};

export async function POST(req: Request) {
  try {
    const { messages, chatOptions } = await req.json();
    if (!chatOptions.selectedModel || chatOptions.selectedModel === "") {
      throw new Error("Selected model is required");
    }

    const baseUrl = process.env.API_BASE_URL;
    if (!baseUrl) {
      throw new Error("API_BASE_URL is not set");
    }

    const formattedMessages = formatMessages(
      addSystemMessage(messages, chatOptions.systemPrompt),
      4096
    );

    // Convert messages to match server's expected format
    const serverMessages = formattedMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        messages: serverMessages,
        model: chatOptions.selectedModel,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to get response from server');
    }

    if (!response.body) {
      throw new Error('No response body received');
    }

    // Create a transformed stream for SSE
    const stream = response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new TransformStream({
        transform(chunk, controller) {
          const lines = chunk.split('\n').filter(line => line.trim().startsWith('data: '));
          
          for (const line of lines) {
            const data = line.slice(6).trim();
            
            if (data === '[DONE]') {
              controller.enqueue('data: [DONE]\n\n');
              return;
            }

            try {
              const jsonData = JSON.parse(data);

              console.log('jsonData', jsonData);
              
              // Handle the simple format (direct role/content)
              if (jsonData.role && jsonData.content) {
                controller.enqueue(`data: ${JSON.stringify({ 
                  content: jsonData.content, 
                  role: jsonData.role 
                })}\n\n`);
              }
              // Handle OpenAI-style format
              else if (jsonData.choices?.[0]?.delta) {
                const { role, content } = jsonData.choices[0].delta;
                if (content || role) {
                  controller.enqueue(`data: ${JSON.stringify({ 
                    content: content || '', 
                    role: role || 'assistant' 
                  })}\n\n`);
                }
              }
            } catch (error) {
              console.error('Failed to parse chunk:', data);
            }
          }
        }
      }));

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
