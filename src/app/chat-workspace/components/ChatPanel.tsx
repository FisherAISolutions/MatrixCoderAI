'use client';
import { useRef, useEffect } from 'react';

import { ChatMessage, AgentType, MemoryStage, FileNode } from './types';
import MessageList from './MessageList';
import ChatComposer from './ChatComposer';
import AgentStatusBar from './AgentStatusBar';
import GuidedBuildPanel from './GuidedBuildPanel';

interface Props {
  messages: ChatMessage[];
  activeFile: FileNode | null;
  fileTree: FileNode[];
  sessionId: string;
  isStreaming: boolean;
  activeAgent: AgentType | null;
  activityStatus: string | null;
  onAddMessage: (msg: ChatMessage) => void;
  onAppendMessageToUI: (msg: ChatMessage) => void;
  onUpdateLastMessage: (updater: (prev: ChatMessage) => ChatMessage) => void;
  onSetActiveAgent: (agent: AgentType | null) => void;
  onSetIsStreaming: (v: boolean) => void;
  onSetMemoryStage: (stage: MemoryStage) => void;
  onSetSessionTokens: (updater: (prev: number) => number) => void;
  onSetActivityStatus: (status: string | null) => void;
  onAddFile: (file: FileNode) => void;
  onUpdateFile: (file: FileNode) => void;
  onDeleteFile: (fileId: string) => void;
  onSelectFile: (file: FileNode) => void;
  onSaveFinalAssistantMessage: (msg: ChatMessage) => void;
  initialPrompt?: string | null;
}

export default function ChatPanel({
  messages,
  activeFile,
  fileTree,
  sessionId,
  isStreaming,
  activeAgent,
  activityStatus,
  onAddMessage,
  onAppendMessageToUI,
  onUpdateLastMessage,
  onSetActiveAgent,
  onSetIsStreaming,
  onSetMemoryStage,
  onSetSessionTokens,
  onSetActivityStatus,
  onAddFile,
  onUpdateFile,
  onDeleteFile,
  onSelectFile,
  onSaveFinalAssistantMessage,
  initialPrompt,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="workspace-chat-panel flex flex-col h-full bg-matrix-bg">
      {/* Agent status bar */}
      <AgentStatusBar
        activeAgent={activeAgent}
        isStreaming={isStreaming}
        messageCount={messages.length}
        activityStatus={activityStatus}
      />
      <GuidedBuildPanel sessionId={sessionId} isStreaming={isStreaming} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          onSelectFile={onSelectFile}
        />
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <ChatComposer
        isStreaming={isStreaming}
        messages={messages}
        activeFile={activeFile}
        fileTree={fileTree}
        sessionId={sessionId}
        onAddMessage={onAddMessage}
        onAppendMessageToUI={onAppendMessageToUI}
        onUpdateLastMessage={onUpdateLastMessage}
        onSetActiveAgent={onSetActiveAgent}
        onSetIsStreaming={onSetIsStreaming}
        onSetMemoryStage={onSetMemoryStage}
        onSetSessionTokens={onSetSessionTokens}
        onSetActivityStatus={onSetActivityStatus}
        onAddFile={onAddFile}
        onUpdateFile={onUpdateFile}
        onDeleteFile={onDeleteFile}
        onSaveFinalAssistantMessage={onSaveFinalAssistantMessage}
        initialPrompt={initialPrompt}
      />
    </div>
  );
}
