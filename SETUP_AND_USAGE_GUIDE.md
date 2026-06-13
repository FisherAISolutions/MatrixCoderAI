# CodePilot Production Upgrade - Setup & Usage Guide

## Overview

CodePilot is a **Next.js 15 AI code generation SaaS** with persistent data storage, real authentication, and multi-agent orchestration. All data now persists to **Supabase PostgreSQL** and survives page reloads.

## Prerequisites

- **Node.js 18+** and **npm**
- **Supabase account** with a project set up (PostgreSQL database)
- **OpenAI API key** for code generation
- **.env variables** configured (see below)

## Environment Setup

### 1. Supabase Setup (if not done yet)

1. Go to [supabase.com](https://supabase.com) and create/login to your account
2. Create a new project (or use existing)
3. Copy your **Project URL** and **Anon Key** from Settings → API
4. Create tables by running `setup-supabase.sql` in the SQL Editor:
   - `users` (auth integration)
   - `sessions` (workspaces)
   - `chat_messages` (message history)
   - `files` (generated code files)
5. Enable Row-Level Security (RLS) on all tables for data isolation

### 2. Configure Environment Variables

Create/update `.env` in the project root:

```bash
# Supabase (required for persistence)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# OpenAI (required for code generation)
OPENAI_API_KEY=sk-proj-...

# Optional: Other AI providers (fallback if OpenAI unavailable)
GEMINI_API_KEY=your-gemini-key
ANTHROPIC_API_KEY=your-anthropic-key

# App URL (for production)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## Running the App

### Development Server

```bash
cd codepilot
npm install        # Install dependencies (first time only)
npm run dev        # Start dev server on http://localhost:3000
```

The dev server supports **hot reload** — changes apply instantly without restarting.

### Production Build

```bash
npm run build      # Compile to optimized bundle
npm start          # Run production server
```

## What CodePilot Can Do Now

### ✅ Core Features Implemented

#### 1. **Real Authentication**
- Sign up with email/password (Supabase Auth)
- Login/logout with session management
- User data isolation (Row-Level Security)
- Demo mode fallback if DB unavailable

#### 2. **Chat Interface**
- Multi-turn conversations with AI agents
- Real-time message streaming
- Message history persists to Supabase
- Auto-loads messages on page reload

#### 3. **AI Agent Routing**
- **Planning Agent**: Break tasks into actionable plans
- **Coding Agent**: Generate TypeScript/Next.js code with proper types
- **Reviewing Agent**: Audit code for bugs, security, performance
- **Orchestrator**: Auto-detect and route to optimal agent
- Auto-scales based on task complexity

#### 4. **Code Generation & File Management**
- AI generates files (extracted from code blocks in response)
- Files automatically saved to Supabase
- File tree sidebar shows all generated files organized by folder
- **NEW**: Click file to view contents (read-only or edit mode)
- **NEW**: Edit files inline with syntax highlighting
- **NEW**: Delete files with confirmation
- **NEW**: Create new files manually by clicking "+" button
- All file changes persist to database

#### 5. **Session Management**
- Create multiple workspaces/sessions
- Switch between sessions
- Each session has isolated chat history and files
- Session-specific token/memory tracking

#### 6. **3-Tier Memory System**
Auto-scales based on conversation length:
- **Context** (0-30 messages): In-memory, fast, limited context
- **SQL** (30-100 messages): Supabase, persistent, full history
- **Storage** (100+ messages): Vector embeddings for semantic search (future)

Memory stage shown in workspace topbar.

#### 7. **Data Persistence**
- ✅ Messages persist to `chat_messages` table
- ✅ Files persist to `files` table
- ✅ Sessions persist to `sessions` table
- ✅ All data loads on page reload
- ✅ Graceful fallback to demo mode if Supabase unavailable

#### 8. **File Editing Features**
- Click any file in the tree to open in preview panel
- Toggle **Edit Mode** to modify code
- **Save** button (disk icon) commits changes to Supabase
- **Delete** button with confirmation removes file
- **Download** button exports file as text
- Edit mode with syntax-highlighted textarea

#### 9. **TypeScript + Type Safety**
- Full TypeScript support (Next.js 15, React 19)
- Strict type checking on all components
- No `any` types in generated code
- Proper error boundaries and error handling

#### 10. **Security**
- Row-Level Security (RLS) policies on all Supabase tables
- User data isolated by auth.uid()
- No cross-user data leakage
- Secure session tokens
- Production-ready error handling

## How to Use

### Step 1: Sign Up

1. Go to http://localhost:3000
2. Click "Sign Up"
3. Enter email and password
4. A "Main Workspace" session is auto-created

### Step 2: Chat with Agents

1. Type your request in the chat box
2. Select an agent (auto-detect recommended):
   - **Planning**: "Create a plan for..."
   - **Coding**: "Generate code for..."
   - **Reviewing**: "Audit this code..."
3. Press Enter or click Send
4. Watch the agent work in real-time (streaming response)

### Step 3: Generate & Manage Files

1. Ask the Coding Agent to "Generate a React component for..."
2. Files appear in the left sidebar automatically
3. Click a file to view its contents
4. Click **Edit** button to modify code
5. Click **Save** to persist changes to DB
6. Click **Delete** to remove files
7. Click **+** button to manually create new files

### Step 4: Persistence

1. Generate some files and have a conversation
2. Refresh the page (Cmd+R / Ctrl+R)
3. All messages and files are restored from Supabase
4. Continue working where you left off

## Technical Architecture

### Database Schema

```sql
-- users (Supabase Auth integration)
-- sessions (workspaces)
  id, user_id, title, memory_stage, token_count, created_at, updated_at

-- chat_messages (conversation history)
  id, session_id, role, agent, content, files[], thinking_steps[], token_count, created_at

-- files (generated code files)
  id, session_id, file_path, file_name, content, language, size, created_at, updated_at
```

### Key Files

- `src/lib/supabase.tsx` — Supabase client + 15+ helper functions
- `src/lib/memory.ts` — 3-tier memory manager
- `src/contexts/AuthContext.tsx` — Authentication provider
- `src/app/chat-workspace/components/ChatWorkspacePage.tsx` — Main container
- `src/app/chat-workspace/components/ChatPanel.tsx` — Message display + composer
- `src/app/chat-workspace/components/FileTreeSidebar.tsx` — File tree
- `src/app/chat-workspace/components/FileViewer.tsx` — File preview + editor
- `setup-supabase.sql` — Database schema (run this in Supabase SQL editor)

## Troubleshooting

### "Error: Failed to load session data: {}"
- **Cause**: Supabase connection failed or missing env vars
- **Fix**: Check .env file has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Workaround**: App still works in demo mode (data not persisted)

### "Can't see preview"
- **Cause**: Dev server not running or wrong port
- **Fix**: Ensure `npm run dev` is running, should see "Ready in XXs"
- **Check**: http://localhost:3000 should load the app

### Files not saving
- **Cause**: RLS policy blocking writes, or Supabase unavailable
- **Fix**: Check Supabase RLS policies allow INSERT/UPDATE on `files` table
- **Fallback**: Edit local (in memory), then reload to see if persisted

### Messages not loading on reload
- **Cause**: Supabase connection or RLS policy issue
- **Fix**: Verify auth user is logged in (check top-right avatar)
- **Debug**: Open browser console (F12) and check for errors

## Performance Tips

1. **Close unused sessions** to reduce DB queries
2. **Archive old messages** (future feature) to speed up loading
3. **Use Planning Agent first** to structure work, then Coding
4. **Clear old files** periodically from sidebar
5. **Monitor token usage** (shown in topbar) — impacts cost

## Deployment Checklist

- [ ] Supabase project created and RLS policies enabled
- [ ] All 4 database tables created (`users`, `sessions`, `chat_messages`, `files`)
- [ ] .env variables configured on deployment platform
- [ ] OpenAI API key valid and has quota
- [ ] `npm run build` succeeds with no errors
- [ ] `npm start` runs without issues
- [ ] Sign up/login works and creates user
- [ ] Chat generates code and saves files
- [ ] Page reload restores all data
- [ ] Error logs monitored (Supabase dashboard)

## Next Steps / Future Enhancements

- [ ] Vector embeddings for semantic search (Storage tier)
- [ ] Streaming file uploads
- [ ] Collaborative editing (multi-user same session)
- [ ] Advanced memory compression
- [ ] Export chat history as PDF
- [ ] Custom agent templates
- [ ] Team workspaces

## Support

For issues or questions:
1. Check browser console for errors (F12)
2. Check Supabase dashboard for DB errors
3. Review logs in terminal running `npm run dev`
4. Ensure all env variables are set correctly

---

**Last Updated**: May 2026  
**Version**: 1.0.0 (Production Upgrade Complete)
