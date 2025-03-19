import {
  streamText,
  CoreMessage,
  CoreUserMessage,
  CoreSystemMessage,
  CoreAssistantMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
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

    const baseUrl = process.env.OPENAI_API_URL;
    if (!baseUrl) {
      throw new Error("OPENAI_API_URL is not set");
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const tokenLimit = process.env.TOKEN_LIMIT
      ? parseInt(process.env.TOKEN_LIMIT)
      : 4096;

    const formattedMessages = formatMessages(
      addSystemMessage(messages, chatOptions.systemPrompt),
      tokenLimit
    );

    // Call OpenAI
    const openai = createOpenAI({
      baseUrl: baseUrl,
      apiKey: apiKey,
    });

    const result = await streamText({
      model: openai(chatOptions.selectedModel),
      messages: formattedMessages,
      temperature: chatOptions.temperature,
    });

    // Respond with the stream
    return result.toAIStreamResponse();

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
