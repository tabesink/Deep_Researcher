import React from "react";

import { ChatRequestOptions } from "ai";
import { Message } from "ai/react";

import ChatBottombar from "./chat-bottombar";
import ChatList from "./chat-list";
import { ChatOptions } from "./chat-options";
import ChatTopbar from "./chat-topbar";

export interface ChatProps {
  chatId?: string;
  setChatId: React.Dispatch<React.SetStateAction<string>>;
  messages: Message[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (
    e: React.FormEvent<HTMLFormElement>,
    chatRequestOptions?: ChatRequestOptions
  ) => void;
  isLoading: boolean;
  error: undefined | Error;
  stop: () => void;
}

export interface ChatTopbarProps {
  chatOptions: ChatOptions;
  setChatOptions: React.Dispatch<React.SetStateAction<ChatOptions>>;
}

const cleanMessage = (content: string): string => {
  // Remove JSON objects and their content
  return content.replace(/\{[\s\S]*?\}/g, '').trim();
};

export default function Chat({
  messages,
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  error,
  stop,
  chatOptions,
  setChatOptions,
  chatId,
  setChatId,
}: ChatProps & ChatTopbarProps) {
  // Clean the messages before passing them to ChatList
  const cleanedMessages = messages.map(msg => ({
    ...msg,
    content: cleanMessage(msg.content)
  }));

  return (
    <div className="flex flex-col justify-between w-full h-full">
      <ChatTopbar
        chatOptions={chatOptions}
        setChatOptions={setChatOptions}
        isLoading={isLoading}
        chatId={chatId}
        setChatId={setChatId}
        messages={cleanedMessages}
      />

      <ChatList
        messages={cleanedMessages}
        isLoading={isLoading}
      />

      <ChatBottombar
        selectedModel={chatOptions.selectedModel}
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        stop={stop}
      />
    </div>
  );
}
