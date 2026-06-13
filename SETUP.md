# CodePilot — Local Setup & Testing Guide

> Generated at end of the hardening pass (Milestones A + B + C + Hardening).

---

## 1. Prerequisites

- **Node.js** ≥ 18.18 (Next.js 15 requires it)
- **Yarn** ≥ 1.22 (project lockfile is yarn-format)
- Modern browser (Chrome / Edge / Firefox / Safari) — Monaco loads from CDN
- (Optional) A **Supabase** project — pre-wired in `.env`, see §6

---

## 2. First-time setup

```bash
# 1. Install dependencies (uses package.json + yarn.lock)
yarn install

# 2. Sanity-check
yarn type-check        # should print: Done in ~4s
yarn build             # should produce 8/8 static pages, ~25–35s
```

If those two pass, you're good.

> **Important**: the project includes a working `.env` at the repo root with
> a Supabase URL, anon key, and an OpenAI key. These are **shared credentials
> baked into the upload** — rotate them before deploying anywhere public
> (Supabase → Settings → API; OpenAI → Platform → API Keys).

---

## 3. Running locally

```bash
yarn dev               # starts Next.js on http://localhost:3000
```

Visit **http://localhost:3000/chat-workspace** — you'll be redirected to
the sign-up screen on first run.

Other useful scripts:

| Command | Purpose |
|---|---|
| `yarn dev` | Hot-reloading dev server (port 3000) |
| `yarn build && yarn serve` | Production build + serve |
| `yarn type-check` | TypeScript only — no emit |
| `yarn lint` | Next.js / ESLint |
| `yarn format` | Prettier write |

---

## 4. Project layout (high level)

```
src/
├── app/
│   ├── api/                          # Next.js API routes (server-side)
│   │   ├── ai/chat-completion/       # OpenAI streaming proxy
│   │   └── embeddings/               # pgvector embed + search
│   ├── chat-workspace/
│   │   ├── page.tsx                  # wraps in WorkspaceErrorBoundary
│   │   └── components/
│   │       ├── ChatWorkspacePage.tsx # root workspace component
│   │       ├── ChatPanel.tsx
│   │       ├── ChatComposer.tsx      # input + AI request + patch flow
│   │       ├── FileTreeSidebar.tsx   # +button, download-zip, tree
│   │       ├── FileViewer.tsx        # read-only view + Monaco edit
│   │       ├── MatrixMonacoEditor.tsx# Matrix-themed Monaco wrapper
│   │       ├── AgentStatusBar.tsx    # agent chips + activity status
│   │       ├── WorkspaceErrorBoundary.tsx
│   │       └── ...
│   ├── sign-up-login-screen/         # Supabase auth UI
│   └── layout.tsx                    # root + AuthProvider
├── contexts/AuthContext.tsx          # auth + session state, localStorage
├── lib/
│   ├── ai/                           # OpenAI client + streaming
│   ├── embeddings/                   # OpenAI embeddings + chunker
│   ├── repo/
│   │   ├── contextBuilder.ts         # repo context engine (pinned configs)
│   │   ├── heuristics.ts             # filename / import-graph rankers
│   │   ├── extractors.ts             # SEARCH/REPLACE block parsing
│   │   ├── indexer.ts                # async embed-on-add pipeline
│   │   └── patcher.ts                # 4-strategy file patcher
│   ├── storage/persistence.ts        # localStorage helpers
│   ├── zip/
│   │   ├── zipImport.ts              # JSZip import + size caps
│   │   └── zipExport.ts              # JSZip export with download
│   ├── uuid.ts                       # crypto.randomUUID helper
│   └── supabase.tsx                  # supabase-js client + DAOs
└── styles/                           # Tailwind + matrix classes
```

---

## 5. Feature test plan

Use these in order — each builds on the previous.

### 5.1 Auth + session
1. Visit `/chat-workspace` → redirected to sign-up. Create an account.
2. Top-bar shows workspace title, agent chips, message count.
3. Click "New Workspace" → second session appears in the switcher.
4. Switch back and forth → verify each workspace has independent files.
5. **Refresh page** → app re-opens the workspace you were last viewing
   (this is Milestone B's session persistence; localStorage key is
   `codepilot:active-session-id`).

### 5.2 ZIP import (drag-and-drop or button)
1. Drag a zip of any small project (your CodePilot zip works fine for a
   self-test) onto the workspace, OR click the FolderUp icon in the
   sidebar header → file dialog.
2. Progress modal shows phases: reading → parsing → saving.
3. A new session named after the project is created automatically.
4. File tree populates; large/binary files are skipped (counter shown).
5. **Edge cases tested**:
   - Zips with > 5000 entries → toast `Import failed: Zip contains N files — limit is 5000 …` (cap from hardening pass).
   - Zips > 100 MB uncompressed → similar error.

### 5.3 File-tree operations
1. Click any file → opens in viewer (read-only line-numbered view).
2. **Active-file persistence**: refresh → same file re-opens.
   localStorage key is `codepilot:active-file-path:<sessionId>`.
3. Click the **+** button (sidebar header) → inline matrix-styled input.
4. Type `MyComponent.tsx` → file created at `src/MyComponent.tsx`.
5. **Collision protection**: click `+` again, type the same name →
   toast `A file already exists at src/MyComponent.tsx`. No duplicate
   in tree or DB.
6. Click trash icon next to any file → confirms → file deleted from
   tree + DB.

### 5.4 Download ZIP
1. Click the Download icon in the sidebar header → toast
   `Packaging N files…` → browser downloads
   `<workspace-title>-<YYYYMMDD-HHMM>.zip`.
2. Open the downloaded zip in your OS → folder structure mirrors the
   sidebar tree exactly.
3. With an empty workspace → button is disabled (40 % opacity).

### 5.5 File rename
1. Open a file in the viewer → click the pencil (Edit3) icon next to
   the path → inline input with stem pre-selected (extension stays).
2. Type a new name → Enter → tree updates, viewer keeps the same file.
3. Try renaming to an existing filename → blocked with toast.
4. Type `foo/bar.tsx` (with a slash) → blocked: "Slashes are not
   allowed — rename is same-folder only".

### 5.6 Monaco editor
1. Open a `.ts`/`.tsx` file → click the **FileCode (Edit)** icon in the
   header → Monaco loads (first time: brief CDN fetch, then cached).
2. Verify Matrix theme — green-on-black, comments italic muted-green,
   strings amber, types blue.
3. Type some changes → press **Ctrl/Cmd+S** → toast "File saved" →
   exits edit mode → read-only view shows updated content.
4. Press the **X** icon (during edit) → cancels without saving.
5. While editing, Copy / Download / Fullscreen / Close all still work.

### 5.7 AI chat — successful flow
1. With a workspace that has some files, type:
   *"What does this project do? Give me a 3-bullet summary."*
2. Watch the activity status (small pill in the agent bar) cycle:
   `Building repo context…` → `Searching embeddings…` → (maybe
   `Falling back to heuristic context…`) → `Sending request to AI…`
   → `Streaming response…`.
3. Assistant message appears, streams in, then finalizes.
4. Open the browser console → look for
   `[RepoContext] N files, K chars … heuristic:X semantic:Y`.
   N should include `package.json`, `tsconfig.json` if they exist
   (pinned root configs).

### 5.8 AI chat — patch flow
1. Open a TypeScript file. Type:
   *"Add a `// hardening test` comment at the top of this file."*
2. The Coding Agent should emit an edit block. Watch for:
   - Activity status `Applying file edits…`.
   - Toast `Patched src/<file> (1 edit)`.
   - File content updates in real time.
3. Now intentionally break it: ask
   *"Replace the line `const NOPE_DOES_NOT_EXIST = 1` with
   `const FOO = 2` in `src/<your file>`."*
4. Patcher will fail. Expected:
   - Toast `Could not patch …`.
   - **System message in chat**:
     `[FAILED] \`src/<file>\` — none of the 1 SEARCH/REPLACE block matched … The file was NOT modified. Ask the agent to re-emit …`
   - File content **unchanged** (re-open viewer to confirm).

### 5.9 AI request failure recovery
1. Temporarily break `OPENAI_API_KEY` in `.env` to a bogus value:
   `OPENAI_API_KEY=sk-BOGUS-VALUE`. Restart the dev server.
2. Send any chat message.
3. Toast appears with the error.
4. The empty assistant bubble updates to
   `// AI request failed: <reason>`.
5. A new **system message** appears explaining what happened + how to
   retry.
6. The composer textarea contains your last typed text — press
   **Enter** to retry.
7. Restore `OPENAI_API_KEY` and restart.

### 5.10 ErrorBoundary
1. Temporarily add `throw new Error('test crash')` at the top of any
   component (e.g. `ChatPanel.tsx`).
2. Reload `/chat-workspace` → Matrix-styled fallback appears:
   `// workspace crashed` with the error message in a `<pre>` and a
   `Reload workspace` button.
3. Click the button → page reloads.
4. Remove the throw and confirm the app is healthy again.

### 5.11 Server-side caps (curl)

**Prompt-too-large**:

```bash
PAYLOAD=$(python3 -c "import json; print(json.dumps({'provider':'OPEN_AI','model':'gpt-4o','messages':[{'role':'user','content':'x'*500000}]}))")
curl -s -X POST "http://localhost:3000/api/ai/chat-completion" \
  -H "Content-Type: application/json" -d "$PAYLOAD" | head -c 400
```

Expected: HTTP 413 with body
`{"error":"Prompt too large: 500000 chars, limit is 400000", ...}`.

**Too many messages**:

```bash
PAYLOAD=$(python3 -c "import json; msgs=[{'role':'user','content':'hi'} for _ in range(250)]; print(json.dumps({'provider':'OPEN_AI','model':'gpt-4o','messages':msgs}))")
curl -s -X POST "http://localhost:3000/api/ai/chat-completion" \
  -H "Content-Type: application/json" -d "$PAYLOAD" | head -c 400
```

Expected: HTTP 413 with body
`{"error":"Too many messages: received 250, limit is 200", ...}`.

### 5.12 Save / delete diagnostics
1. In `.env`, temporarily set `NEXT_PUBLIC_SUPABASE_URL=https://bogus.example.com`. Restart dev server.
2. Open a file → edit → save → toast: **"Could not save \<filename> — DB unavailable"**.
3. Restore the env and restart.

---

## 6. Environment variables (`.env`)

All keys live at the repo root in `.env`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
OPENAI_API_KEY=...
```

Optional (currently placeholders, unused at runtime):

```
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
PERPLEXITY_API_KEY=
NEXT_PUBLIC_GA_MEASUREMENT_ID=
NEXT_PUBLIC_ADSENSE_ID=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

### Supabase schema

The app expects three tables in your Supabase project:

- `chat_sessions(id uuid pk, user_id uuid, title text, created_at, updated_at)`
- `chat_messages(id uuid pk, session_id uuid fk, role text, content text, agent text?, files jsonb?, thinking_steps jsonb?, token_count int?, created_at)`
- `files(id uuid pk, session_id uuid fk, file_path text, file_name text, parent_path text?, content text, language text, size int, is_new bool, created_at, updated_at, UNIQUE(session_id, file_path))`

Plus optionally (for semantic search — graceful fallback if missing):

- `file_embeddings(id uuid pk, session_id uuid fk, file_id uuid fk, file_path text, chunk_index int, chunk_content text, embedding vector(1536))`
- RPC `match_file_chunks(p_session_id uuid, p_query_embedding text, p_match_count int)`

If `pgvector` is not installed, the embeddings APIs return **503** with
`{ status: 'pgvector_unavailable' }` and the app falls back to
heuristic-only context (no UI freeze, no crash).

See `supabase/migrations/` for the full DDL.

---

## 7. Where things live (quick map)

| Concern | Look in |
|---|---|
| ErrorBoundary fallback UI | `components/WorkspaceErrorBoundary.tsx` |
| Activity-status pill | `components/AgentStatusBar.tsx` |
| Repo-context engine | `lib/repo/contextBuilder.ts` |
| Pinned root configs | `isRootConfigFile` + assembly in `contextBuilder.ts` |
| Patch failure messages | `editsByPath.forEach` in `ChatComposer.tsx` |
| Collision protection | `addFile` / `createNewFile` / `renameFile` in `ChatWorkspacePage.tsx` |
| Server-side prompt cap | `app/api/ai/chat-completion/route.ts` (top of file) |
| Server-side zip caps | `lib/zip/zipImport.ts` (`MAX_ZIP_*` constants) |
| AI retry recovery | `error` effect in `ChatComposer.tsx` |
| Save diagnostics | `updateFile` / `addFile` in `ChatWorkspacePage.tsx` |
| Matrix Monaco theme | `MatrixMonacoEditor.tsx` (`matrixTheme` object) |

---

## 8. Common gotchas

1. **Monaco "loading editor…" stays forever**: the loader needs internet
   to reach `cdn.jsdelivr.net` (where it pulls Monaco core from). If
   you're fully offline, edit mode will be unusable. Self-hosting Monaco
   is straightforward — add `monaco-editor` to deps and call
   `loader.config({ paths: { vs: '/monaco/min/vs' } })` once.

2. **"Demo session" appears even though I signed in**: means Supabase
   couldn't be reached. Check `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Auth state listener falls back to a
   demo session so the UI still works.

3. **Embeddings never populate**: pgvector probably isn't installed in
   your Supabase project. Run
   `CREATE EXTENSION IF NOT EXISTS vector;` and re-apply the migration.
   The app keeps working without it — semantic search just no-ops.

4. **`yarn dev` says port 3000 is in use**: kill the other process or
   `yarn dev -p 3001` (note: `REACT_APP_BACKEND_URL` is only used in
   non-Next setups; this app reads everything from `process.env`).

5. **`Edits` failing on AI patches**: the agent occasionally emits
   SEARCH blocks that don't quite match (line endings, whitespace).
   The patcher tries 4 strategies — if none work, you'll see the new
   `[FAILED]` system message with guidance. Ask the agent to re-emit
   with a smaller, exact SEARCH block.

---

## 9. PRD / project history

See `memory/PRD.md` for the full milestone history (A → B → C →
hardening), file map per phase, and verification matrix.
