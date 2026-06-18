'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Cpu,
  Database,
  HardDrive,
  Zap,
  LogOut,
  Plus,
  Settings,
  ChevronDown,
  Eye,
  Home,
  Archive,
  ArchiveRestore,
  Pencil,
  Search,
  Trash2,
  Palette,
} from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import { AgentType, MemoryStage } from './types';

interface WorkspaceSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  activeAgent: AgentType | null;
  isStreaming: boolean;
  memoryStage: MemoryStage;
  sessionTokens: number;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  currentSession: WorkspaceSession | null;
  sessions: WorkspaceSession[];
  archivedSessionIds: string[];
  onCreateNewSession: () => Promise<void>;
  onSwitchSession: (sessionId: string) => Promise<void>;
  onRenameSession: (sessionId: string, title: string) => Promise<void>;
  onArchiveSession: (sessionId: string) => Promise<void>;
  onRestoreSession: (sessionId: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onLogout: () => Promise<void>;
  /** Matrix Coder AI — preview panel toggle. Optional so callers
   *  that don't want the preview can omit it without breaking. */
  previewOpen?: boolean;
  onTogglePreview?: () => void;
}

const AGENT_CONFIG: Record<AgentType, { label: string; color: string; className: string }> = {
  orchestrator: { label: 'Orchestrator', color: '#cc44ff', className: 'agent-orchestrator' },
  planning: { label: 'Planning', color: '#4da6ff', className: 'agent-planning' },
  coding: { label: 'Coding', color: '#00ff41', className: 'agent-coding' },
  reviewing: { label: 'Reviewing', color: '#ffaa00', className: 'agent-reviewing' },
};

const MEMORY_CONFIG: Record<MemoryStage, { label: string; icon: React.ReactNode; color: string }> = {
  context: { label: 'In-Context', icon: <Cpu size={11} />, color: 'text-matrix-green' },
  sql: { label: 'SQL Memory', icon: <Database size={11} />, color: 'text-matrix-blue' },
  storage: { label: 'File Storage', icon: <HardDrive size={11} />, color: 'text-matrix-amber' },
};

const MAX_TOKENS = 128000;

function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function WorkspaceTopbar({
  activeAgent,
  isStreaming,
  memoryStage,
  sessionTokens,
  sidebarCollapsed,
  onToggleSidebar,
  currentSession,
  sessions,
  archivedSessionIds,
  onCreateNewSession,
  onSwitchSession,
  onRenameSession,
  onArchiveSession,
  onRestoreSession,
  onDeleteSession,
  onLogout,
  previewOpen,
  onTogglePreview,
}: Props) {
  const router = useRouter();
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [sessionSearch, setSessionSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const memory = MEMORY_CONFIG[memoryStage];
  const tokenPct = Math.min(100, (sessionTokens / MAX_TOKENS) * 100);
  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    const visible = sessions.filter((s) =>
      showArchived ? archivedSessionIds.includes(s.id) : !archivedSessionIds.includes(s.id)
    );
    if (!q) return visible;
    return visible.filter((s) => s.title.toLowerCase().includes(q));
  }, [archivedSessionIds, sessions, sessionSearch, showArchived]);

  const handleCreateNewSession = async () => {
    try {
      setIsCreatingSession(true);
      await onCreateNewSession();
      setShowSessionMenu(false);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleSwitchSession = async (sessionId: string) => {
    await onSwitchSession(sessionId);
    setShowSessionMenu(false);
  };

  const handleRenameSession = async (session: WorkspaceSession) => {
    const nextTitle = window.prompt('Rename workspace', session.title);
    const trimmed = nextTitle?.trim();
    if (!trimmed || trimmed === session.title) return;
    try {
      setRenamingId(session.id);
      await onRenameSession(session.id, trimmed);
    } finally {
      setRenamingId(null);
    }
  };

  const handleDeleteSession = async (session: WorkspaceSession) => {
    const ok = window.confirm(
      `Delete "${session.title}"?\n\nThis removes its messages, generated files, and validation logs.`
    );
    if (!ok) return;
    try {
      setDeletingId(session.id);
      await onDeleteSession(session.id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleArchiveSession = async (session: WorkspaceSession) => {
    try {
      setArchivingId(session.id);
      await onArchiveSession(session.id);
    } finally {
      setArchivingId(null);
    }
  };

  const handleRestoreSession = async (session: WorkspaceSession) => {
    try {
      setArchivingId(session.id);
      await onRestoreSession(session.id);
    } finally {
      setArchivingId(null);
    }
  };

  const handleLogout = async () => {
    await onLogout();
    router.push('/sign-up-login-screen');
  };

  return (
    <header className="flex items-center justify-between h-11 px-4 border-b border-matrix-border bg-matrix-bg flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
          aria-label={sidebarCollapsed ? 'Expand file tree' : 'Collapse file tree'}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>

        <div className="flex items-center gap-2">
          <AppLogo size={20} />
          <span className="text-matrix-green font-mono text-sm font-bold tracking-widest neon-text-glow">
            MATRIX CODER AI
          </span>
          {/* Home → landing page. Sits next to the brand because that's
           *  where users instinctively look. Hidden on the tightest
           *  viewports (where space is precious) but always reachable
           *  via the AppLogo link below. */}
          <Link
            href="/"
            className="hidden sm:inline-flex items-center gap-1 ml-2 px-2 py-1 border border-matrix-border text-matrix-green-muted hover:text-matrix-green hover:border-matrix-green text-[10px] uppercase tracking-[0.32em] transition-colors"
            data-testid="workspace-home-btn"
            aria-label="Back to landing page"
            title="Back to landing page"
          >
            <Home size={10} />
            Home
          </Link>
          <Link
            href="/style-inspiration"
            className="hidden md:inline-flex items-center gap-1 px-2 py-1 border border-matrix-border text-matrix-green-muted hover:text-matrix-green hover:border-matrix-green text-[10px] uppercase tracking-[0.32em] transition-colors"
            data-testid="workspace-inspiration-btn"
            aria-label="Use any app as visual inspiration"
            title="Use any app as visual inspiration"
          >
            <Palette size={10} />
            Inspiration
          </Link>
        </div>

        <div className="w-px h-4 bg-matrix-border mx-1" />

        {/* Session selector */}
        <div className="relative">
          <button
            onClick={() => setShowSessionMenu((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-mono text-matrix-green-muted hover:text-matrix-green transition-colors px-2 py-1 border border-transparent hover:border-matrix-border rounded-sm"
          >
            <span className="max-w-[160px] truncate">{currentSession?.title || 'Main Workspace'}</span>
            <ChevronDown size={11} />
          </button>
          {showSessionMenu && (
            <div className="absolute top-full left-0 mt-1 w-72 max-h-[400px] overflow-y-auto bg-matrix-card border border-matrix-border rounded-sm shadow-neon-sm z-50 py-1">
              <div className="sticky top-0 z-10 bg-matrix-card border-b border-matrix-border pb-1">
                <button
                  onClick={handleCreateNewSession}
                  disabled={isCreatingSession}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono text-matrix-green hover:bg-matrix-green-ghost transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="workspace-create-session-btn"
                >
                  <Plus size={11} />
                  {isCreatingSession ? 'Creating workspace...' : 'Create Workspace'}
                </button>
                <label className="mx-2 mb-1 flex items-center gap-2 px-2 py-1 border border-matrix-border bg-matrix-bg text-matrix-green-muted">
                  <Search size={11} className="flex-shrink-0" />
                  <input
                    value={sessionSearch}
                    onChange={(event) => setSessionSearch(event.target.value)}
                    placeholder="Search workspaces"
                    className="w-full bg-transparent outline-none text-xs font-mono text-matrix-green placeholder:text-matrix-green-muted"
                    data-testid="workspace-search-input"
                  />
                </label>
                <button
                  onClick={() => setShowArchived((value) => !value)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-matrix-green-muted hover:text-matrix-green hover:bg-matrix-green-ghost transition-colors"
                  data-testid="workspace-show-archived-btn"
                >
                  {showArchived ? <ArchiveRestore size={11} /> : <Archive size={11} />}
                  {showArchived ? 'Show Active Workspaces' : 'Show Archived Workspaces'}
                </button>
              </div>

              {sessions.length === 0 ? (
                <div className="px-3 py-2 text-xs font-mono text-matrix-green-muted">
                  No workspaces yet
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="px-3 py-2 text-xs font-mono text-matrix-green-muted">
                  No matching workspaces
                </div>
              ) : (
                filteredSessions.map((s) => (
                  <div
                    key={s.id}
                    className={`w-full flex items-center gap-1 px-3 py-2 text-xs font-mono hover:bg-matrix-green-ghost transition-colors ${
                      currentSession?.id === s.id ? 'text-matrix-green' : 'text-matrix-green-muted hover:text-matrix-green'
                    }`}
                  >
                    <button
                      onClick={() => handleSwitchSession(s.id)}
                      className="min-w-0 flex-1 flex items-center justify-between text-left"
                      data-testid={`workspace-session-${s.id}`}
                    >
                      <span className="truncate">{s.title}</span>
                      <span className="text-matrix-green-muted text-xs flex-shrink-0 ml-2">
                        {formatSessionDate(s.updated_at || s.created_at)}
                      </span>
                    </button>
                    <button
                      onClick={() => handleRenameSession(s)}
                      disabled={renamingId === s.id || deletingId === s.id || archivingId === s.id}
                      className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label={`Rename ${s.title}`}
                      title="Rename workspace"
                      data-testid={`workspace-rename-${s.id}`}
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => showArchived ? handleRestoreSession(s) : handleArchiveSession(s)}
                      disabled={renamingId === s.id || deletingId === s.id || archivingId === s.id}
                      className="text-matrix-green-muted hover:text-matrix-amber transition-colors p-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label={`${showArchived ? 'Restore' : 'Archive'} ${s.title}`}
                      title={showArchived ? 'Restore workspace' : 'Archive workspace'}
                      data-testid={`workspace-${showArchived ? 'restore' : 'archive'}-${s.id}`}
                    >
                      {showArchived ? <ArchiveRestore size={11} /> : <Archive size={11} />}
                    </button>
                    <button
                      onClick={() => handleDeleteSession(s)}
                      disabled={renamingId === s.id || deletingId === s.id || archivingId === s.id}
                      className="text-matrix-green-muted hover:text-matrix-red transition-colors p-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label={`Delete ${s.title}`}
                      title="Delete workspace"
                      data-testid={`workspace-delete-${s.id}`}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Center — active agent indicator */}
      <div className="flex items-center gap-3">
        {activeAgent && (
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-mono ${AGENT_CONFIG[activeAgent].className}`}>
            {isStreaming && (
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            )}
            <span className="tracking-widest uppercase">{AGENT_CONFIG[activeAgent].label} Agent</span>
            {isStreaming && <span className="opacity-60">streaming</span>}
          </div>
        )}
        {!activeAgent && !isStreaming && (
          <div className="flex items-center gap-1.5 text-xs font-mono text-matrix-green-muted">
            <Zap size={11} />
            <span>Orchestrator ready</span>
          </div>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Memory stage */}
        <div className={`flex items-center gap-1.5 text-xs font-mono ${memory.color}`}>
          {memory.icon}
          <span className="hidden sm:inline">{memory.label}</span>
        </div>

        <div className="w-px h-4 bg-matrix-border" />

        {/* Token usage */}
        <div className="flex items-center gap-2 hidden sm:flex">
          <span className="text-xs font-mono text-matrix-green-muted">
            {sessionTokens.toLocaleString()} / {(MAX_TOKENS / 1000).toFixed(0)}k
          </span>
          <div className="w-16 h-1.5 bg-matrix-green-ghost rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                tokenPct > 80 ? 'bg-matrix-red' : tokenPct > 60 ? 'bg-matrix-amber' : 'bg-matrix-green'
              }`}
              style={{ width: `${tokenPct}%` }}
            />
          </div>
        </div>

        <div className="w-px h-4 bg-matrix-border" />

        <div className="w-px h-4 bg-matrix-border" />

        {/* Preview toggle — Matrix Coder AI. Hidden when host page
            doesn't wire `onTogglePreview` so legacy callers still work. */}
        {onTogglePreview && (
          <button
            onClick={onTogglePreview}
            className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1 border rounded-sm transition-all ${
              previewOpen
                ? 'text-matrix-green border-matrix-green bg-matrix-green-ghost'
                : 'text-matrix-green-muted border-matrix-border hover:text-matrix-green hover:border-matrix-green'
            }`}
            aria-label={previewOpen ? 'Close preview panel' : 'Open preview panel'}
            title={previewOpen ? 'Hide preview' : 'Show preview'}
            data-testid="topbar-preview-toggle"
          >
            <Eye size={11} />
            <span className="tracking-widest uppercase hidden sm:inline">
              Preview
            </span>
          </button>
        )}

        <button
          className="text-matrix-green-muted hover:text-matrix-green transition-colors p-1"
          aria-label="Settings"
        >
          <Settings size={14} />
        </button>
        <button
          onClick={handleLogout}
          className="text-matrix-green-muted hover:text-matrix-red transition-colors p-1"
          aria-label="Logout"
        >
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}
