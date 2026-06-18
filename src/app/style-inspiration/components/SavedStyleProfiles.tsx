'use client';

import { Play, Trash2 } from 'lucide-react';
import type { StyleProfile } from '@/lib/styleInspiration';

interface Props {
  profiles: StyleProfile[];
  loading?: boolean;
  onStartWorkspace: (profile: StyleProfile) => void;
  onDelete: (profile: StyleProfile) => void;
}

export default function SavedStyleProfiles({
  profiles,
  loading,
  onStartWorkspace,
  onDelete,
}: Props) {
  return (
    <section className="border border-matrix-border bg-matrix-card p-5">
      <div className="flex items-center justify-between gap-3 border-b border-matrix-border pb-3">
        <div>
          <h2 className="text-sm font-mono uppercase tracking-[0.24em] text-matrix-green">
            Saved profiles
          </h2>
          <p className="mt-1 text-xs font-mono text-matrix-green-muted">
            Reuse a saved design brief in a new workspace.
          </p>
        </div>
        <span className="border border-matrix-border px-2 py-1 text-xs font-mono text-matrix-green-muted">
          {profiles.length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm font-mono text-matrix-green-muted">Loading style profiles...</p>
        ) : profiles.length === 0 ? (
          <p className="text-sm leading-6 text-matrix-green-muted">
            No saved profiles yet. Analyze screenshots and save the resulting style brief.
          </p>
        ) : (
          profiles.map((profile) => (
            <article
              key={profile.id}
              className="border border-matrix-border bg-matrix-bg/60 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-mono font-bold text-matrix-green">
                    {profile.title}
                  </h3>
                  <p className="mt-1 text-xs font-mono text-matrix-green-muted">
                    {profile.appName || 'Unnamed app'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onStartWorkspace(profile)}
                    className="text-matrix-green-muted transition-colors hover:text-matrix-green"
                    aria-label={`Start workspace from ${profile.title}`}
                  >
                    <Play size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(profile)}
                    className="text-matrix-green-muted transition-colors hover:text-matrix-red"
                    aria-label={`Delete ${profile.title}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-matrix-green-muted">
                {profile.styleBrief.summary}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
