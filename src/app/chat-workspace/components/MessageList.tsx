'use client';
import { FileNode, ChatMessage } from './types';
import MessageBubble from './MessageBubble';

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSelectFile: (file: FileNode) => void;
}

export default function MessageList({ messages, isStreaming, onSelectFile }: Props) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
        <div className="text-matrix-green-muted text-xs font-mono text-center space-y-1">
          <p className="text-matrix-green text-sm neon-text-glow">// MATRIX CODER AI READY</p>
          <p>Describe what you want to build, debug, or review.</p>
          <p>The Orchestrator will route your request to the right agent.</p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-md">
          {[
            'Build a REST API with Express.js and JWT auth',
            'Debug this React hook — it re-renders infinitely',
            'Review my Supabase RLS policies for security holes',
            'Plan a microservices architecture for an e-commerce app',
          ].map((prompt) => (
            <div
              key={`prompt-${prompt.slice(0, 20)}`}
              className="px-3 py-2 border border-matrix-border text-xs font-mono text-matrix-green-muted hover:text-matrix-green hover:border-matrix-green hover:bg-matrix-green-ghost cursor-pointer transition-all duration-150 rounded-sm"
            >
              <span className="text-matrix-green opacity-60">$ </span>
              {prompt}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          isStreaming={isStreaming && msg.isStreaming === true}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  );
}