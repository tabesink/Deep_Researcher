"use client";
import { useEffect, useState, useRef } from "react";

import { Pencil2Icon, GearIcon, ChatBubbleIcon } from "@radix-ui/react-icons";
import { Message } from "ai/react";
import Image from "next/image";
import useLocalStorageState from "use-local-storage-state";

import OllamaLogo from "../../public/ollama.png";
import { ChatOptions } from "./chat/chat-options";
import Link from "next/link";
import { Dialog, DialogContent } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

interface SidebarProps {
  isCollapsed: boolean;
  onClick?: () => void;
  isMobile: boolean;
  chatId: string;
  setChatId: React.Dispatch<React.SetStateAction<string>>;
  chatOptions: ChatOptions;
  setChatOptions: React.Dispatch<React.SetStateAction<ChatOptions>>;
  username?: string;
}

interface Chats {
  [key: string]: { chatId: string; messages: Message[] }[];
}

export function Sidebar({
  isCollapsed,
  isMobile,
  chatId,
  setChatId,
  chatOptions,
  setChatOptions,
}: SidebarProps) {
  const [localChats, setLocalChats] = useState<Chats>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showPopup, setShowPopup] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [tempUsername, setTempUsername] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [username, setUsername] = useLocalStorageState<string>("username", {
    defaultValue: "User"
  });
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalChats(getLocalstorageChats());
    const handleStorageChange = () => {
      setLocalChats(getLocalstorageChats());
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [chatId]);

  useEffect(() => {
    // Fetch models
    const fetchModels = async () => {
      try {
        const res = await fetch("/api/models");
        if (res.ok) {
          const data = await res.json();
          setModels(data.data.map((model: any) => model.id));
        }
      } catch (error) {
        console.error("Failed to fetch models:", error);
      }
    };
    
    fetchModels();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setShowPopup(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const getLocalstorageChats = (): Chats => {
    const chats = Object.keys(localStorage).filter((key) =>
      key.startsWith("chat_")
    );

    if (chats.length === 0) {
      setIsLoading(false);
    }

    // Map through the chats and return an object with chatId and messages
    const chatObjects = chats.map((chat) => {
      const item = localStorage.getItem(chat);
      return item
        ? { chatId: chat, messages: JSON.parse(item) }
        : { chatId: "", messages: [] };
    });

    // Sort chats by the createdAt date of the first message of each chat
    chatObjects.sort((a, b) => {
      const aDate = new Date(a.messages[0]?.createdAt || new Date());
      const bDate = new Date(b.messages[0]?.createdAt || new Date());
      return bDate.getTime() - aDate.getTime();
    });

    const groupChatsByDate = (
      chats: { chatId: string; messages: Message[] }[]
    ) => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const groupedChats: Chats = {};

      chats.forEach((chat) => {
        if (!chat.messages.length) return;
        
        const createdAt = new Date(chat.messages[0].createdAt ?? "");
        const diffInDays = Math.floor(
          (today.getTime() - createdAt.getTime()) / (1000 * 3600 * 24)
        );

        let group: string;
        if (diffInDays === 0) {
          group = "Today";
        } else if (diffInDays === 1) {
          group = "Yesterday";
        } else if (diffInDays <= 7) {
          group = "Previous 7 Days";
        } else if (diffInDays <= 30) {
          group = "Previous 30 Days";
        } else {
          group = "Older";
        }

        if (!groupedChats[group]) {
          groupedChats[group] = [];
        }
        groupedChats[group].push(chat);
      });

      return groupedChats;
    };

    setIsLoading(false);
    const groupedChats = groupChatsByDate(chatObjects);

    return groupedChats;
  };

  const handleDeleteChat = (chatId: string) => {
    localStorage.removeItem(chatId);
    setLocalChats(getLocalstorageChats());
  };

  const handleOpenSettings = () => {
    setTempUsername(username);
    setShowSettingsDialog(true);
    setShowPopup(false);
  };

  const handleSaveSettings = () => {
    setUsername(tempUsername);
    setShowSettingsDialog(false);
  };

  return (
    <div
      data-collapsed={isCollapsed}
      className="relative justify-between group bg-accent/20 dark:bg-card/35 flex flex-col h-full gap-4 data-[collapsed=true]:p-0 data-[collapsed=true]:hidden"
    >
      <div className="sticky left-0 right-0 top-0 z-20 p-1 rounded-sm m-2">
        <Link
          className="flex w-full h-10 text-sm font-medium items-center
          border border-input bg-background hover:bg-accent hover:text-accent-foreground
          px-2 py-2 rounded-sm"
          href="/"
          onClick={() => {
            setChatId("");
          }}
        >
          <div className="flex gap-3 p-2 items-center justify-between w-full">
            <div className="flex align-start gap-2">
              {!isCollapsed && !isMobile && (
                <Image
                  src={OllamaLogo}
                  alt="AI"
                  width={14}
                  height={14}
                  className="dark:invert 2xl:block"
                />
              )}
              <span>New chat</span>
            </div>
            <Pencil2Icon className="w-4 h-4" />
          </div>
        </Link>
      </div>
      
      {/* Chat list */}
      <div className="flex-1 overflow-auto">
        <SidebarTabs
          isLoading={isLoading}
          localChats={localChats}
          selectedChatId={chatId}
          chatOptions={chatOptions}
          setChatOptions={setChatOptions}
          handleDeleteChat={handleDeleteChat}
        />
      </div>
      
      {/* User profile section - bottom of sidebar */}
      <div className="relative mt-auto p-2 border-t border-border">
        <button 
          className="flex items-center gap-2 p-2 w-full rounded-md hover:bg-accent/50 transition-colors"
          onClick={() => setShowPopup(!showPopup)}
        >
          <div className="flex items-center gap-2 w-full">
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white">
              {username.substring(0, 2).toUpperCase()}
            </div>
            <span className="text-sm font-medium truncate">{username}</span>
          </div>
        </button>
        
        {/* Popup menu */}
        {showPopup && (
          <div 
            ref={popupRef}
            className="absolute bottom-full left-2 right-2 mb-1 bg-background border border-border rounded-md shadow-md overflow-hidden z-50"
          >
            <button
              className="flex items-center gap-2 p-3 hover:bg-accent/30 w-full text-left text-sm"
              onClick={() => {
                setChatId("");
                setShowPopup(false);
              }}
            >
              <ChatBubbleIcon className="w-4 h-4" />
              <span>New Chat</span>
            </button>
            <button 
              className="flex items-center gap-2 p-3 hover:bg-accent/30 w-full text-left text-sm"
              onClick={handleOpenSettings}
            >
              <GearIcon className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </div>
        )}
      </div>

      {/* Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <h2 className="text-lg font-semibold mb-4">Settings</h2>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium mb-1.5">Username</div>
              <Input 
                value={tempUsername} 
                onChange={(e) => setTempUsername(e.target.value)}
                placeholder="Enter your name"
              />
            </div>
            
            <div className="space-y-2">
              <div className="text-sm font-medium mb-1.5">Model</div>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={chatOptions.selectedModel}
                onChange={(e) => setChatOptions({...chatOptions, selectedModel: e.target.value})}
              >
                <option value="">Select a model</option>
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium mb-1.5">System Prompt</div>
              <textarea
                className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={chatOptions.systemPrompt}
                onChange={(e) => setChatOptions({...chatOptions, systemPrompt: e.target.value})}
                placeholder="System instructions for the AI..."
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium mb-1.5">Temperature: {chatOptions.temperature}</div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={chatOptions.temperature}
                onChange={(e) => setChatOptions({...chatOptions, temperature: parseFloat(e.target.value)})}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveSettings}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Import these at the top of the file but defined here for clarity
import SidebarTabs from "./sidebar-tabs";
