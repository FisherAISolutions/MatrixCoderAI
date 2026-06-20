'use client';
import { Brain, Code2, Eye, Cpu } from 'lucide-react';
import { AgentType } from './types';

interface Props {
  activeAgent: AgentType | null;
  isStreaming: boolean;
  messageCount: number;
  /**
   * Lightweight activity feedback message (e.g. "Building repo context…",
   * "Searching embeddings…", "Streaming response…").
   * Owned by ChatWorkspacePage; cleared when the action completes or errors.
   * Optional — when null/undefined the row stays at its original height.
   */
  activityStatus?: string | null;
}

const AGENTS: { type: AgentType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    type: 'planning',
    label: 'Planning',
    icon: <Brain size={12} />,
    description: 'Breaks tasks into structured plans',
  },
  {
    type: 'coding',
    label: 'Coding',
    icon: <Code2 size={12} />,
    description: 'Generates production-grade files',
  },
  {
    type: 'reviewing',
    label: 'Reviewing',
    icon: <Eye size={12} />,
    description: 'Audits code for bugs & security',
  },
  {
    type: 'orchestrator',
    label: 'Orchestrator',
    icon: <Cpu size={12} />,
    description: 'Routes intent to correct agent',
  },
];

const AGENT_CLASSES: Record<AgentType, string> = {
  planning: 'agent-planning',
  coding: 'agent-coding',
  reviewing: 'agent-reviewing',
  orchestrator: 'agent-orchestrator',
};

export default function AgentStatusBar({
  activeAgent,
  isStreaming,
  messageCount,
  activityStatus,
}: Props) {
  return (
    <div
      className="workspace-agent-tabs flex items-center gap-2 px-4 py-2 border-b border-matrix-border flex-shrink-0 overflow-x-auto"
      data-testid="agent-status-bar"
    >
      {AGENTS.map((agent) => {
        const isActive = activeAgent === agent.type;
        return (
          <div
            key={`agent-status-${agent.type}`}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-mono transition-all duration-200 flex-shrink-0 ${
              isActive
                ? `${AGENT_CLASSES[agent.type]} ${isStreaming ? 'animate-pulse-green' : ''}`
                : 'text-matrix-green-muted border border-transparent'
            }`}
            title={agent.description}
          >
            {isActive && isStreaming && (
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse flex-shrink-0" />
            )}
            {agent.icon}
            <span className="tracking-widest uppercase hidden sm:inline">{agent.label}</span>
          </div>
        );
      })}

      {activityStatus ? (
        <div
          className="workspace-status-badge flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs font-mono flex-shrink-0 max-w-[60%] truncate"
          title={activityStatus}
          data-testid="agent-activity-status"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-matrix-green animate-pulse flex-shrink-0" />
          <span className="truncate normal-case">{activityStatus}</span>
        </div>
      ) : null}

      <div className="ml-auto flex-shrink-0 text-xs font-mono text-matrix-green-muted">
        {messageCount} msg{messageCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
