import { createClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/types/supabase';
import {
  STYLE_INSPIRATION_BUCKET,
  buildTemporaryStyleImagePath,
  type StyleBrief,
  type StyleProfile,
  type StyleProfileDraft,
} from '@/lib/styleInspiration';

const supabaseUrl = getPublicEnv('NEXT_PUBLIC_SUPABASE_URL') || '';
const supabaseAnonKey = getPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || '';

// Create client even if env vars are missing (will gracefully fail when used)
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      }
    )
  : null;

export const isSupabaseConfigured = !!supabase;

// Auth helpers
export async function getCurrentUser() {
  if (!supabase) return null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  } catch (error) {
    console.error('getCurrentUser error:', error);
    return null;
  }
}

export async function signUpUser(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured');
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('signUpUser error:', error);
    throw error;
  }
}

export async function signInUser(email: string, password: string) {
  if (!supabase) throw new Error('Supabase not configured');
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('signInUser error:', error);
    throw error;
  }
}

export async function signOutUser() {
  if (!supabase) return;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('signOutUser error:', error);
    throw error;
  }
}

// Session helpers
export async function createSession(userId: string, title: string = 'Untitled Session') {
  if (!supabase) throw new Error('Supabase not configured');
  try {
    const { data, error } = await supabase
      .from('sessions')
      .insert({ user_id: userId, title })
      .select()
      .single();

    if (error) {
      const errorMessage = error.message || error.details || error.hint || JSON.stringify(error);
      console.error('createSession error:', errorMessage);
      throw new Error(errorMessage);
    }
    return data;
  } catch (error) {
    console.error('createSession error:', error);
    throw error;
  }
}

export async function getUserSessions(userId: string) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('getUserSessions error:', error);
    return [];
  }
}

export async function updateSessionMemoryStage(sessionId: string, stage: 'context' | 'sql' | 'storage') {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('sessions')
      .update({ memory_stage: stage })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('updateSessionMemoryStage error:', error);
    return null;
  }
}

export async function updateSessionTokens(sessionId: string, tokens: number) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('sessions')
      .update({ token_count: tokens })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('updateSessionTokens error:', error);
    return null;
  }
}

export async function renameSession(sessionId: string, title: string) {
  if (!supabase) return null;
  if (!sessionId || sessionId.startsWith('demo-')) return null;
  try {
    const { data, error } = await supabase
      .from('sessions')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('renameSession error:', error);
    throw error;
  }
}

export async function deleteSessionCascade(sessionId: string) {
  if (!supabase) return { messages: 0, files: 0, session: 0 };
  if (!sessionId || sessionId.startsWith('demo-')) {
    return { messages: 0, files: 0, session: 0 };
  }

  try {
    const messages = await supabase
      .from('chat_messages')
      .delete({ count: 'exact' })
      .eq('session_id', sessionId);
    if (messages.error) throw messages.error;

    const files = await supabase
      .from('files')
      .delete({ count: 'exact' })
      .eq('session_id', sessionId);
    if (files.error) throw files.error;

    const session = await supabase
      .from('sessions')
      .delete({ count: 'exact' })
      .eq('id', sessionId);
    if (session.error) throw session.error;

    return {
      messages: messages.count ?? 0,
      files: files.count ?? 0,
      session: session.count ?? 0,
    };
  } catch (error) {
    console.error('deleteSessionCascade error:', error);
    throw error;
  }
}

// Message helpers
export async function loadSessionMessages(sessionId: string) {
  if (!supabase) {
    console.warn('Supabase not configured - returning empty messages');
    return [];
  }

  // Prevent invalid UUID errors for demo/local sessions
  if (!sessionId || sessionId.startsWith('demo-session-')) {
    console.debug('Skipping DB load for demo session:', sessionId);
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('loadSessionMessages DB error:', error.message || JSON.stringify(error));
      throw error;
    }
    console.debug(`Loaded ${data?.length || 0} messages for session ${sessionId}`);
    return data || [];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('loadSessionMessages error:', errorMsg);
    return [];
  }
}

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  agent?: string,
  files?: string[],
  thinkingSteps?: string[]
) {
  if (!supabase) {
    console.warn('Supabase not configured - message not saved');
    return null;
  }

  // Prevent invalid UUID errors for demo/local sessions
  if (!sessionId || sessionId.startsWith('demo-session-')) {
    console.debug('Skipping DB save for demo session');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        session_id: sessionId,
        role,
        content,
        agent: (agent as any) || null,
        files: files || [],
        thinking_steps: thinkingSteps || [],
      })
      .select()
      .single();

    if (error) {
      console.error('saveMessage DB error:', error.message || JSON.stringify(error));
      throw error;
    }
    console.debug(`Saved message: ${role} (${content.length} chars)`);
    return data;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('saveMessage error:', errorMsg);
    return null;
  }
}

export async function updateMessage(
  messageId: string,
  updates: {
    content?: string;
    is_streaming?: boolean;
    token_count?: number;
    files?: string[];
    thinking_steps?: string[];
  }
) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .update(updates)
      .eq('id', messageId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('updateMessage error:', error);
    return null;
  }
}

// File helpers
export async function loadSessionFiles(sessionId: string) {
  if (!supabase) {
    console.warn('Supabase not configured - returning empty files');
    return [];
  }

  // Prevent invalid UUID errors for demo/local sessions
  if (!sessionId || sessionId.startsWith('demo-session-')) {
    console.debug('Skipping DB file load for demo session:', sessionId);
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('loadSessionFiles DB error:', error.message || JSON.stringify(error));
      throw error;
    }
    console.debug(`Loaded ${data?.length || 0} files for session ${sessionId}`);
    return data || [];
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('loadSessionFiles error:', errorMsg);
    return [];
  }
}

export async function saveFile(
  sessionId: string,
  filePath: string,
  fileName: string,
  content: string,
  language: string = 'unknown'
) {
  if (!supabase) {
    console.warn('Supabase not configured - file not saved:', filePath);
    return null;
  }

  // Prevent invalid UUID errors for demo/local sessions
  if (!sessionId || sessionId.startsWith('demo-session-')) {
    console.debug('Skipping DB file save for demo session');
    return null;
  }

  try {
    const parentPath = filePath.split('/').slice(0, -1).join('/') || null;

    const { data, error } = await supabase
      .from('files')
      .upsert(
        {
          session_id: sessionId,
          file_path: filePath,
          file_name: fileName,
          parent_path: parentPath,
          content,
          language,
          size: content.length,
          is_new: true,
        },
        { onConflict: 'session_id,file_path' }
      )
      .select()
      .single();

    if (error) {
      console.error('saveFile DB error:', error.message || JSON.stringify(error));
      throw error;
    }
    console.debug(`Saved file: ${filePath}`);
    return data;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('saveFile error:', errorMsg);
    return null;
  }
}

export async function updateFile(
  fileId: string,
  updates: {
    content?: string;
    language?: string;
    size?: number;
    is_new?: boolean;
  }
) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('files')
      .update(updates)
      .eq('id', fileId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('updateFile error:', error);
    return null;
  }
}

export async function deleteFile(fileId: string) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from('files')
      .delete()
      .eq('id', fileId);

    if (error) throw error;
  } catch (error) {
    console.error('deleteFile error:', error);
  }
}

/**
 * Milestone C â€” lightweight rename. Updates file_path / file_name /
 * parent_path of an existing row in-place (preserving the row ID, so
 * the in-memory tree node identity stays stable). Returns the updated
 * row or null on failure / demo session.
 */
export async function renameFile(
  fileId: string,
  newPath: string,
  newName: string,
  newParentPath: string | null
) {
  if (!supabase) return null;
  if (!fileId) return null;
  try {
    const { data, error } = await supabase
      .from('files')
      .update({
        file_path: newPath,
        file_name: newName,
        parent_path: newParentPath,
      })
      .eq('id', fileId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('renameFile error:', error);
    return null;
  }
}

// Bulk file upsert for zip import (batched to keep payloads reasonable).
// Falls back gracefully if Supabase is unavailable or session is demo.
export async function bulkSaveFiles(
  sessionId: string,
  files: { path: string; name: string; content: string; language: string }[],
  onBatchSaved?: (savedSoFar: number, total: number) => void
): Promise<{ saved: number; failed: number }> {
  if (!supabase) {
    console.warn('Supabase not configured - bulk save skipped');
    return { saved: 0, failed: files.length };
  }
  if (!sessionId || sessionId.startsWith('demo-')) {
    console.debug('Skipping bulk save for demo session');
    return { saved: 0, failed: files.length };
  }

  const BATCH = 100;
  let saved = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const rows = batch.map((f) => ({
      session_id: sessionId,
      file_path: f.path,
      file_name: f.name,
      parent_path: f.path.split('/').slice(0, -1).join('/') || null,
      content: f.content,
      language: f.language || 'unknown',
      size: f.content.length,
      is_new: true,
    }));

    try {
      const { error } = await supabase
        .from('files')
        .upsert(rows, { onConflict: 'session_id,file_path' });

      if (error) {
        console.error('bulkSaveFiles batch error:', error.message || JSON.stringify(error));
        failed += batch.length;
      } else {
        saved += batch.length;
      }
    } catch (e) {
      console.error('bulkSaveFiles batch exception:', e instanceof Error ? e.message : String(e));
      failed += batch.length;
    }

    onBatchSaved?.(saved, files.length);
  }

  return { saved, failed };
}

type StyleProfileRow = Database['public']['Tables']['style_profiles']['Row'];
type StyleProfileInsert = Database['public']['Tables']['style_profiles']['Insert'];

function mapStyleProfile(row: StyleProfileRow): StyleProfile {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    appName: row.app_name,
    feedback: row.feedback,
    styleBrief: row.style_brief as unknown as StyleBrief,
    promptBlock: row.prompt_block,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function uploadTemporaryStyleImage(userId: string, file: File) {
  if (!supabase) throw new Error('Supabase not configured');
  const path = buildTemporaryStyleImagePath(userId, file.name);
  const { error } = await supabase.storage
    .from(STYLE_INSPIRATION_BUCKET)
    .upload(path, file, {
      cacheControl: '60',
      contentType: file.type,
      upsert: false,
    });

  if (error) throw error;
  return { path };
}

export async function deleteTemporaryStyleImages(paths: string[]) {
  if (!supabase || paths.length === 0) return;
  const { error } = await supabase.storage
    .from(STYLE_INSPIRATION_BUCKET)
    .remove(paths);

  if (error) {
    console.warn('deleteTemporaryStyleImages error:', error.message);
  }
}

export async function saveStyleProfile(userId: string, draft: StyleProfileDraft) {
  if (!supabase) throw new Error('Supabase not configured');

  const row: StyleProfileInsert = {
    user_id: userId,
    title: draft.title,
    app_name: draft.appName,
    feedback: draft.feedback,
    style_brief: draft.styleBrief as unknown as StyleProfileInsert['style_brief'],
    prompt_block: draft.promptBlock,
  };

  const { data, error } = await supabase
    .from('style_profiles')
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return mapStyleProfile(data);
}

export async function loadStyleProfiles(userId: string) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('style_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('loadStyleProfiles error:', error.message);
    return [];
  }

  return (data ?? []).map(mapStyleProfile);
}

export async function deleteStyleProfile(profileId: string, userId: string) {
  if (!supabase) return;

  const { error } = await supabase
    .from('style_profiles')
    .delete()
    .eq('id', profileId)
    .eq('user_id', userId);

  if (error) throw error;
}


