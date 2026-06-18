'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ArrowLeft, ImagePlus, Wand2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  deleteStyleProfile,
  deleteTemporaryStyleImages,
  isSupabaseConfigured,
  loadStyleProfiles,
  saveStyleProfile,
  uploadTemporaryStyleImage,
} from '@/lib/supabase';
import {
  storeStylePromptForWorkspace,
  validateStyleImage,
  type StyleBrief,
  type StyleProfile,
  type StyleProfileDraft,
} from '@/lib/styleInspiration';
import ScreenshotUploader from './ScreenshotUploader';
import StyleBriefPreview from './StyleBriefPreview';
import SavedStyleProfiles from './SavedStyleProfiles';

type AnalyzeResponse = {
  title: string;
  appName: string;
  feedback: string;
  styleBrief: StyleBrief;
  promptBlock: string;
};

export default function StyleInspirationPage() {
  const router = useRouter();
  const { user, isLoading, createNewSession } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [appName, setAppName] = useState('');
  const [feedback, setFeedback] = useState('');
  const [draft, setDraft] = useState<StyleProfileDraft | null>(null);
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = 'auto';
    body.style.overflow = 'auto';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  const refreshProfiles = useCallback(async () => {
    if (!user) return;
    setLoadingProfiles(true);
    try {
      setProfiles(await loadStyleProfiles(user.id));
    } finally {
      setLoadingProfiles(false);
    }
  }, [user]);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  const canAnalyze = useMemo(
    () => !!user && isSupabaseConfigured && files.length > 0 && !analyzing,
    [analyzing, files.length, user]
  );

  const analyze = async () => {
    if (!user) {
      toast.error('Sign in before creating a style profile');
      return;
    }
    if (!isSupabaseConfigured) {
      toast.error('Supabase is not configured');
      return;
    }
    if (files.length === 0) {
      toast.error('Upload at least one screenshot');
      return;
    }

    const validationError = files.map(validateStyleImage).find(Boolean);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const uploadedPaths: string[] = [];
    setAnalyzing(true);
    try {
      const uploadedImages = [];
      for (const file of files) {
        const uploaded = await uploadTemporaryStyleImage(user.id, file);
        uploadedPaths.push(uploaded.path);
        uploadedImages.push({
          name: file.name,
          mimeType: file.type,
          dataUrl: await fileToDataUrl(file),
        });
      }

      const response = await fetch('/api/style-inspiration/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appName,
          feedback,
          images: uploadedImages,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || payload?.details || 'Style analysis failed');
      }

      const nextDraft = payload as AnalyzeResponse;
      setDraft({
        title: nextDraft.title,
        appName: nextDraft.appName,
        feedback: nextDraft.feedback,
        styleBrief: nextDraft.styleBrief,
        promptBlock: nextDraft.promptBlock,
      });
      toast.success('Style brief created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Style analysis failed');
    } finally {
      await deleteTemporaryStyleImages(uploadedPaths);
      setAnalyzing(false);
    }
  };

  const saveDraft = async () => {
    if (!user || !draft) return;
    setSaving(true);
    try {
      const saved = await saveStyleProfile(user.id, draft);
      setProfiles((prev) => [saved, ...prev.filter((profile) => profile.id !== saved.id)]);
      toast.success('Style profile saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save style profile');
    } finally {
      setSaving(false);
    }
  };

  const startWorkspace = async (profile: StyleProfile | StyleProfileDraft) => {
    setStarting(true);
    try {
      const title = profile.appName.trim()
        ? `${profile.appName.trim()} - Visual Inspiration`
        : 'Visual Inspiration Workspace';
      await createNewSession(title);
      storeStylePromptForWorkspace(profile.promptBlock);
      toast.success('Workspace created with style prompt ready');
      router.push('/chat-workspace');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start workspace');
    } finally {
      setStarting(false);
    }
  };

  const removeProfile = async (profile: StyleProfile) => {
    if (!user) return;
    const ok = window.confirm(`Delete "${profile.title}"?`);
    if (!ok) return;
    try {
      await deleteStyleProfile(profile.id, user.id);
      setProfiles((prev) => prev.filter((item) => item.id !== profile.id));
      toast.success('Style profile deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete style profile');
    }
  };

  return (
    <main className="min-h-screen bg-matrix-bg text-matrix-green">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-4 border border-matrix-border bg-matrix-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/chat-workspace"
              className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.24em] text-matrix-green-muted transition-colors hover:text-matrix-green"
            >
              <ArrowLeft size={13} />
              Back to workspace
            </Link>
            <h1 className="mt-4 text-2xl font-mono font-bold uppercase tracking-[0.2em] text-matrix-green md:text-3xl">
              Use any app as visual inspiration
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-matrix-green-muted">
              Upload references, describe what you like, and save a private style profile.
              Screenshots are deleted after analysis; only the design brief is saved.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 border border-matrix-border px-3 py-2 text-xs font-mono text-matrix-green-muted">
            <ImagePlus size={14} />
            Style Profiles
          </div>
        </header>

        {!isLoading && !user ? (
          <section className="border border-matrix-border bg-matrix-card p-6">
            <h2 className="text-lg font-mono font-bold text-matrix-green">Sign in required</h2>
            <p className="mt-2 text-sm text-matrix-green-muted">
              Style profiles are private to your account, so sign in before uploading screenshots.
            </p>
            <Link
              href="/sign-up-login-screen"
              className="mt-4 inline-flex border border-matrix-green px-4 py-2 text-sm font-mono text-matrix-green hover:bg-matrix-green-ghost"
            >
              Sign in
            </Link>
          </section>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <section className="border border-matrix-border bg-matrix-card p-5">
              <div className="flex items-center gap-2 text-matrix-green">
                <Wand2 size={16} />
                <h2 className="text-sm font-mono uppercase tracking-[0.24em]">
                  Create a style profile
                </h2>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-mono uppercase tracking-[0.18em] text-matrix-green-muted">
                    App name
                  </span>
                  <input
                    value={appName}
                    onChange={(event) => setAppName(event.target.value)}
                    placeholder="Example: NotesDesk"
                    className="mt-2 w-full border border-matrix-border bg-matrix-bg px-3 py-2 text-sm font-mono text-matrix-green outline-none transition-colors placeholder:text-matrix-green-muted focus:border-matrix-green"
                  />
                </label>
                <div className="border border-matrix-border bg-matrix-bg/60 p-3 text-xs leading-5 text-matrix-green-muted">
                  The saved profile keeps the design brief and prompt only. Uploaded images are
                  cleaned up after analysis.
                </div>
              </div>

              <label className="mt-4 block">
                <span className="text-xs font-mono uppercase tracking-[0.18em] text-matrix-green-muted">
                  What do you like about these references?
                </span>
                <textarea
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                  placeholder="Example: I like the compact sidebar, dark cards, strong accent buttons, and dashboard density. Use my own app name and content."
                  rows={5}
                  className="mt-2 w-full resize-y border border-matrix-border bg-matrix-bg px-3 py-2 text-sm font-mono text-matrix-green outline-none transition-colors placeholder:text-matrix-green-muted focus:border-matrix-green"
                />
              </label>

              <div className="mt-5">
                <ScreenshotUploader files={files} onFilesChange={setFiles} disabled={analyzing} />
              </div>

              <button
                type="button"
                onClick={analyze}
                disabled={!canAnalyze}
                className="mt-5 inline-flex items-center justify-center gap-2 border border-matrix-green bg-matrix-green px-4 py-2 text-sm font-mono font-bold text-matrix-bg transition-colors hover:bg-matrix-green-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Wand2 size={15} />
                {analyzing ? 'Analyzing references...' : 'Analyze style'}
              </button>
            </section>

            <div className="space-y-6">
              <StyleBriefPreview
                draft={draft}
                onSave={saveDraft}
                onStartWorkspace={() => draft && startWorkspace(draft)}
                saving={saving}
                starting={starting}
              />
              <SavedStyleProfiles
                profiles={profiles}
                loading={loadingProfiles}
                onStartWorkspace={startWorkspace}
                onDelete={removeProfile}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}
