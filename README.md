# MatrixCoderAI

Multi-agent AI coding workspace — Next.js 15 + React 19 + Tailwind + Supabase + OpenAI.

## Quick start

```bash
yarn install
yarn dev                    # http://localhost:3000
```

Then open **http://localhost:3000/chat-workspace** in a browser.

## Full guide

See **[`SETUP.md`](./SETUP.md)** for:

- Prerequisites and first-time setup
- Step-by-step feature test plan (auth, zip import/export, Monaco edit,
  rename, AI patches, error boundary, server-side caps, retry, etc.)
- Environment variables + Supabase schema
- Common gotchas + self-hosting Monaco notes

## Project history

`memory/PRD.md` documents Milestones A (stability), B (export +
persistence), C (Monaco + file management) and the final hardening pass.

## Architecture

- **Next.js 15 App Router** with React 19 + TypeScript strict mode
- **Tailwind CSS** with custom Matrix theme
- **Supabase** for auth, sessions, messages, files, and (optional)
  pgvector embeddings — gracefully degrades if pgvector is unavailable
- **OpenAI** via streaming SSE through `/api/ai/chat-completion`
- **JSZip** for browser-side import and export of projects
- **Monaco** (via `@monaco-editor/react` + CDN loader) for in-place
  file editing with a custom Matrix theme

No separate backend service — all server logic lives in `/api` routes.
