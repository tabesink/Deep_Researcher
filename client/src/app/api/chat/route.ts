import {
  streamText,
  CoreMessage,
  CoreUserMessage,
  CoreSystemMessage,
  CoreAssistantMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";

import { encodeChat } from "@/lib/token-counter";

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

const formatMessages = (
  messages: CoreMessage[],
  tokenLimit: number = 4096
): CoreMessage[] => {
  let mappedMessages: CoreMessage[] = [];
  let messagesTokenCounts: number[] = [];
  const reservedResponseTokens = 512;

  const tokenLimitRemaining = tokenLimit - reservedResponseTokens;
  let tokenCount = 0;

  messages.forEach((m) => {
    if (m.role === "system") {
      mappedMessages.push({
        role: "system",
        content: m.content,
      } as CoreSystemMessage);
    } else if (m.role === "user") {
      mappedMessages.push({
        role: "user",
        content: m.content,
      } as CoreUserMessage);
    } else if (m.role === "assistant") {
      mappedMessages.push({
        role: "assistant",
        content: m.content,
      } as CoreAssistantMessage);
    } else {
      return;
    }

    // ignore typing
    // tslint:disable-next-line
    const messageTokens = encodeChat([m]);
    messagesTokenCounts.push(messageTokens);
    tokenCount += messageTokens;
  });

  if (tokenCount <= tokenLimitRemaining) {
    return mappedMessages;
  }

  // remove the middle messages until the token count is below the limit
  while (tokenCount > tokenLimitRemaining) {
    const middleMessageIndex = Math.floor(messages.length / 2);
    const middleMessageTokens = messagesTokenCounts[middleMessageIndex];
    mappedMessages.splice(middleMessageIndex, 1);
    messagesTokenCounts.splice(middleMessageIndex, 1);
    tokenCount -= middleMessageTokens;
  }
  return mappedMessages;
};

/**
* POST endpoint handler for chat completions
* Processes incoming chat messages and streams responses from the vLLM server
* 
 * @param req - Incoming HTTP request containing messages and chat options
* @returns Streaming response from the language model or error response
*/
export async function POST(req: Request) {
  // Could be typed as NextRequest for more specific typing
  // export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Extract messages and options from request body
    const { messages, chatOptions } = await req.json();

    // Validate that a model is selected
    if (!chatOptions.selectedModel || chatOptions.selectedModel === "") {
      throw new Error("Selected model is required");
    }

    // Get vLLM server URL from environment variables
    const baseUrl = process.env.VLLM_URL;
    if (!baseUrl) {
      throw new Error("VLLM_URL is not set");
    }

    // Optional API key for vLLM authentication
    const apiKey = process.env.VLLM_API_KEY;

    // Get token limit from env vars or use default 4096
    const tokenLimit = process.env.VLLM_TOKEN_LIMIT
      ? parseInt(process.env.VLLM_TOKEN_LIMIT)
      : 4096;

    // Format messages:
    // 1. Add system prompt if specified in chat options
    // 2. Format messages to match vLLM API requirements
    // 3. Truncate messages if they exceed token limit
    const formattedMessages = formatMessages(
      addSystemMessage(messages, chatOptions.systemPrompt),
      tokenLimit
    );

    // Initialize OpenAI-compatible client pointing to vLLM server
    const customOpenai = createOpenAI({
      baseUrl: baseUrl + "/v1", // vLLM exposes OpenAI-compatible endpoint at /v1
      apiKey: apiKey ?? "", // Use API key if provided, empty string if not
    });

    // Stream response from language model
    const result = await streamText({
      model: customOpenai(chatOptions.selectedModel),
      messages: formattedMessages,
      temperature: chatOptions.temperature, // Controls randomness of outputs
      // Callback for when generation completes - currently disabled
      // async onFinish({ text, toolCalls, toolResults, usage, finishReason }) {
      //   // implement your own logic here, e.g. for storing messages
      //   // or recording token usage
      // },
    });

    // Convert streaming result to AI response format and return
    return result.toAIStreamResponse();

  } catch (error) {
    // Log error and return formatted error response
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
