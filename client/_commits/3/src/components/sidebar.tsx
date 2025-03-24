"use client";
import { useEffect, useState, useRef } from "react";

import { Pencil2Icon, GearIcon, ChatBubbleIcon } from "@radix-ui/react-icons";
import { Message } from "ai/react";
import Image from "next/image";

import OllamaLogo from "../../public/bulb_blk.png";
import { ChatOptions } from "./chat/chat-options";
import Link from "next/link";
import * as Tabs from "@radix-ui/react-tabs";

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
  username = "User",
}: SidebarProps) {
  const [localChats, setLocalChats] = useState<Chats>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showPopup, setShowPopup] = useState(false);
  const [activeTab, setActiveTab] = useState("chats");
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
      const aDate = new Date(a.messages[0].createdAt);
      const bDate = new Date(b.messages[0].createdAt);
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

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setShowPopup(false);
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
      
      {/* Conditional rendering based on activeTab */}
      <div className="flex-1 overflow-auto">
        {activeTab === "chats" && (
          <SidebarTabs
            isLoading={isLoading}
            localChats={localChats}
            selectedChatId={chatId}
            chatOptions={chatOptions}
            setChatOptions={setChatOptions}
            handleDeleteChat={handleDeleteChat}
          />
        )}
        {activeTab === "settings" && (
          <div className="h-full mb-16 pl-2">
            <Settings chatOptions={chatOptions} setChatOptions={setChatOptions} />
          </div>
        )}
      </div>
      
      {/* User profile section - bottom of sidebar */}
      <div className="relative mt-auto p-2 border-t border-border">
        <button 
          className="flex items-center gap-2 p-2 w-full rounded-md hover:bg-accent/50 transition-colors"
          onClick={() => setShowPopup(!showPopup)}
        >
          <span className="text-sm font-medium truncate">{username}</span>
        </button>
        
        {/* Popup menu */}
        {showPopup && (
          <div 
            ref={popupRef}
            className="absolute bottom-full left-2 right-2 mb-1 bg-background border border-border rounded-md shadow-md overflow-hidden z-50"
          >
            <button
              className="flex items-center gap-2 p-3 hover:bg-accent/30 w-full text-left text-sm"
              onClick={() => handleTabChange("chats")}
            >
              <ChatBubbleIcon className="w-4 h-4" />
              <span>Chats</span>
            </button>
            <button 
              className="flex items-center gap-2 p-3 hover:bg-accent/30 w-full text-left text-sm"
              onClick={() => handleTabChange("settings")}
            >
              <GearIcon className="w-4 h-4" />
              <span>Settings</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Import these at the top of the file but defined here for clarity
import SidebarTabs from "./sidebar-tabs";
import Settings from "./settings";
