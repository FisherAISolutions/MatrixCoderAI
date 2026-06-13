'use client';
import { useState, useEffect } from 'react';
import {
  Brain,
  Code2,
  Eye,
  Cpu,
  User,
  Terminal,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  FileCode,
  Zap,
  Database,
  HardDrive,
} from 'lucide-react';
import { ChatMessage, AgentType, MemoryStage } from './types';
import { FileNode } from './types';
import { toast } from 'sonner';

interface Props {
  message: ChatMessage;
  isStreaming: boolean;
  onSelectFile: (file: FileNode) => void;
}

const AGENT_ICONS: Record<AgentType, React.ReactNode> = {
  planning: <Brain size={12} />,
  coding: <Code2 size={12} />,
  reviewing: <Eye size={12} />,
  orchestrator: <Cpu size={12} />,
};

const AGENT_LABELS: Record<AgentType, string> = {
  planning: 'Planning Agent',
  coding: 'Coding Agent',
  reviewing: 'Reviewing Agent',
  orchestrator: 'Orchestrator',
};

const AGENT_CLASSES: Record<AgentType, string> = {
  planning: 'agent-planning',
  coding: 'agent-coding',
  reviewing: 'agent-reviewing',
  orchestrator: 'agent-orchestrator',
};

const MEMORY_ICONS: Record<MemoryStage, React.ReactNode> = {
  context: <Zap size={10} />,
  sql: <Database size={10} />,
  storage: <HardDrive size={10} />,
};

const MEMORY_LABELS: Record<MemoryStage, string> = {
  context: 'In-Context',
  sql: 'SQL',
  storage: 'Storage',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function useFormattedTime(iso: string): string {
  const [formatted, setFormatted] = useState('');
  useEffect(() => {
    setFormatted(formatTime(iso));
  }, [iso]);
  return formatted;
}

function CodeBlockView({ code, language, filename }: { code: string; language: string; filename?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Code copied', {
      style: { background: '#0d1a0d', border: '1px solid #003b00', color: '#00ff41' },
    });
  };

  const lines = code.split('\n');

  return (
    <div className="code-block rounded-sm mt-2 mb-2 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-matrix-border bg-matrix-green-ghost">
        <div className="flex items-center gap-2">
          <span className="text-matrix-green-muted text-xs font-mono">{language}</span>
          {filename && (
            <>
              <span className="text-matrix-green-muted">·</span>
              <span className="text-matrix-green text-xs font-mono">{filename}</span>
            </>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="text-matrix-green-muted hover:text-matrix-green transition-colors"
          aria-label="Copy code"
        >
          {copied ? <Check size={12} className="text-matrix-green" /> : <Copy size={12} />}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <tbody>
            {lines.map((line, i) => (
              <tr key={`cb-line-${i + 1}`} className="hover:bg-matrix-green-ghost">
                <td className="select-none text-right pr-3 pl-3 py-0.5 text-matrix-green-muted w-8 border-r border-matrix-green-ghost">
                  {i + 1}
                </td>
                <td className="pl-3 pr-4 py-0.5 text-matrix-green whitespace-pre font-mono">
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ThinkingSteps({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-mono text-matrix-green-muted hover:text-matrix-green transition-colors"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>Thinking ({steps.length} steps)</span>
      </button>
      {open && (
        <div className="mt-1 pl-4 border-l border-matrix-border space-y-1">
          {steps.map((step, i) => (
            <p key={`think-${i}`} className="text-xs font-mono text-matrix-green-muted">
              <span className="text-matrix-green opacity-50">{i + 1}.</span> {step}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function renderMarkdownContent(content: string): React.ReactNode {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const lines = part.slice(3, -3).split('\n');
      const lang = lines[0]?.trim() || 'text';
      const code = lines.slice(1).join('\n');
      return <CodeBlockView key={`md-cb-${i}`} code={code} language={lang} />;
    }
    // Render non-code parts with basic markdown-like treatment
    const paragraphs = part.split('\n\n').filter(Boolean);
    return (
      <div key={`md-p-${i}`}>
        {paragraphs.map((para, j) => {
          if (para.startsWith('## ')) {
            return (
              <h2 key={`h2-${j}`} className="text-matrix-green font-mono font-bold text-sm mt-3 mb-1">
                {para.slice(3)}
              </h2>
            );
          }
          if (para.startsWith('### ')) {
            return (
              <h3 key={`h3-${j}`} className="text-matrix-green font-mono font-semibold text-xs mt-2 mb-1">
                {para.slice(4)}
              </h3>
            );
          }
          const lines2 = para.split('\n');
          return (
            <div key={`para-${j}`} className="mb-2">
              {lines2.map((line, k) => {
                if (line.startsWith('- ') || line.startsWith('* ')) {
                  return (
                    <div key={`li-${k}`} className="flex items-start gap-1.5 text-xs font-mono text-matrix-green leading-relaxed">
                      <span className="text-matrix-green opacity-60 flex-shrink-0 mt-0.5">▸</span>
                      <span>{line.slice(2)}</span>
                    </div>
                  );
                }
                if (line.startsWith('**[') && line.includes(']')) {
                  return (
                    <p key={`bold-${k}`} className="text-xs font-mono text-matrix-amber font-bold mt-1">
                      {line}
                    </p>
                  );
                }
                return (
                  <p key={`line-${k}`} className="text-xs font-mono text-matrix-green leading-relaxed">
                    {line}
                  </p>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  });
}

export default function MessageBubble({ message, isStreaming, onSelectFile }: Props) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const formattedTime = useFormattedTime(message.timestamp);

  if (isSystem) {
    return (
      <div className="flex justify-center animate-fade-in">
        <div className="flex items-center gap-2 px-3 py-1.5 border border-matrix-border rounded-sm bg-matrix-green-ghost text-xs font-mono text-matrix-green-muted">
          <Terminal size={11} className="text-matrix-green" />
          <pre className="whitespace-pre-wrap text-matrix-green-muted">{message.content}</pre>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-end animate-slide-up">
        <div className="flex items-start gap-2 max-w-[80%]">
          <div className="message-user px-4 py-3 rounded-sm">
            <p className="text-sm font-mono text-matrix-green leading-relaxed">{message.content}</p>
          </div>
          <div className="w-7 h-7 rounded-sm bg-matrix-green flex items-center justify-center flex-shrink-0 mt-0.5">
            <User size={13} className="text-black" />
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex items-start gap-2 animate-slide-up max-w-full">
      {/* Agent icon */}
      <div
        className={`w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 mt-0.5 ${
          message.agent ? AGENT_CLASSES[message.agent] : 'bg-matrix-green-ghost text-matrix-green-muted'
        }`}
      >
        {message.agent ? AGENT_ICONS[message.agent] : <Cpu size={12} />}
      </div>

      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          {message.agent && (
            <span className={`text-xs font-mono tracking-widest uppercase ${AGENT_CLASSES[message.agent]} px-1.5 py-0.5 rounded-sm`}>
              {AGENT_LABELS[message.agent]}
            </span>
          )}
          <span className="text-xs font-mono text-matrix-green-muted">
            {formattedTime}
          </span>
          {message.memoryStage && (
            <div className="flex items-center gap-1 text-xs font-mono text-matrix-green-muted">
              {MEMORY_ICONS[message.memoryStage]}
              <span>{MEMORY_LABELS[message.memoryStage]}</span>
            </div>
          )}
          {message.tokenCount && (
            <span className="text-xs font-mono text-matrix-green-muted">
              ~{message.tokenCount} tok
            </span>
          )}
        </div>

        {/* Thinking steps */}
        {message.thinkingSteps && message.thinkingSteps.length > 0 && (
          <ThinkingSteps steps={message.thinkingSteps} />
        )}

        {/* Content */}
        <div className="message-assistant px-4 py-3 rounded-sm">
          <div className="text-sm font-mono text-matrix-green leading-relaxed">
            {renderMarkdownContent(message.content)}
            {isStreaming && <span className="streaming-cursor" />}
          </div>

          {/* Generated files list */}
          {message.files && message.files.length > 0 && (
            <div className="mt-3 pt-3 border-t border-matrix-border">
              <p className="text-xs font-mono text-matrix-green-muted mb-1.5 tracking-widest uppercase">
                Files written:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {message.files.map((f) => (
                  <button
                    key={`file-badge-${f}`}
                    onClick={() =>
                      onSelectFile({
                        id: `file-${f.replace(/\//g, '-')}`,
                        name: f.split('/').pop() ?? f,
                        path: f,
                        type: 'file',
                        content: '',
                      })
                    }
                    className="flex items-center gap-1 px-2 py-1 border border-matrix-border text-xs font-mono text-matrix-green-muted hover:text-matrix-green hover:border-matrix-green transition-all rounded-sm"
                  >
                    <FileCode size={10} />
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}