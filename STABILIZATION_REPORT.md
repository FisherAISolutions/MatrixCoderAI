# CodePilot — Bug-Fix Pass #3 (2026-01)

Real-world reproduction by the user revealed that **pass #2's fixes for
Bug #1 (silent-success patches) and Bug #3 (raw terminal codes) were
incomplete** in subtle ways. This pass closes the remaining gaps with
small, targeted edits — no architecture changes.

---

## 1. Root cause of each remaining issue

### Issue A — Terminal still rendered `[1G`, `[0K`, `[?25l`

**Root cause** in `src/app/chat-workspace/components/TerminalPanel.tsx`,
line 389-390 (pre-fix):

```jsx
{segs.length === 0 ? (
  <span className={lvl}>{line.text}</span>      // ← RAW FALLBACK!
) : (
  segs.map((s, i) => …)
)}
```

`cleanControlCodes` *was* correctly stripping `\x1B[1G` etc., and
`tokenizeAnsi` *was* returning an empty array when the entire chunk
became empty. But the render code **fell back to the RAW, unsanitised
`line.text`** in that case. Because the ESC byte (0x1B) doesn't render
in HTML, the user saw the trailing `[1G` / `[0K` / `[?25l` characters
exposed.

This is why the user kept seeing them despite pass #2: the cleaning
worked, the rendering ignored it.

**Fix** — drop the raw fallback. When `segs.length === 0`, render
`null` (no `<div>` at all). The control-only chunk simply vanishes from
the log instead of leaking its bracketed payload.

```jsx
if (segs.length === 0) return null;
```

### Issue B — AI emitted malformed edit fences → "Files written" lie

**Real reproduction** (verbatim from user's bug report): the model
emitted

```
```edit:src/app/layout.tsx

=======
import { useEffect, useState } from 'react';
…
>>>>>>> REPLACE
    <head>
```
```

— note the **missing `<<<<<<< SEARCH` marker entirely**, and trailing
content (`    <head>`) after `>>>>>>> REPLACE`. The model also still
generated a "Files written: src/app/layout.tsx, src/app/page.tsx" prose
line in its response.

**Root cause** in `src/lib/repo/extractors.ts`:

- `EDIT_FENCE_REGEX` matched the fence header `edit:src/app/layout.tsx`.
- `SEARCH_REPLACE_REGEX` requires all three markers
  (`<<<<<<< SEARCH`, `=======`, `>>>>>>> REPLACE`). With the SEARCH
  marker missing, **zero pairs matched**.
- The extractor `console.warn`-ed `"edit fence … contained no
  SEARCH/REPLACE markers — skipping"` and returned `edits: []`.
- `ChatComposer` saw zero edits, did nothing.
- The AI's "Files written" prose stayed visible in the chat verbatim →
  the user thought edits had landed, but no file was modified.

**Fix** — surface malformed fences as a hard, persistent failure:

1. `ExtractedResponse` gains a new field `malformedEdits: string[]`
   (the list of paths whose fence was syntactically wrong).
2. `extractEdits` populates it whenever `foundAny === false`,
   de-duplicating paths.
3. `ChatComposer.tsx` checks `malformedEdits.length > 0` *before* the
   normal edit-apply loop and emits a permanent system message via
   `onAddMessage` (persists in Supabase, survives refresh) naming
   every malformed file. It also raises a red toast.
4. `autoFixLoop.ts` adds each malformed path to its `[malformed]
   <path> — fence missing SEARCH/REPLACE markers; skipped` report
   and bumps `failed` so the auto-fix loop won't treat the iteration
   as productive.
5. The Coding-Agent system prompt now has a CRITICAL section showing
   three concrete WRONG examples (missing SEARCH marker, content
   after `>>>>>>> REPLACE`, missing triple-backticks) so the model
   knows exactly what to avoid.

---

## 2. Files modified

| File | Change |
| --- | --- |
| `src/app/chat-workspace/components/TerminalPanel.tsx` | Removed the raw-text fallback for empty `segs`. Now returns `null` so control-only chunks leave no trace. |
| `src/lib/repo/extractors.ts` | Added `malformedEdits: string[]` field to `ExtractedResponse`. `extractEdits` populates it (de-duplicated). `extractFromAssistantResponse` returns it. |
| `src/app/chat-workspace/components/ChatComposer.tsx` | (a) Destructures `malformedEdits` and emits a HARD persistent system message + red toast when non-empty. (b) Strengthened SEARCH/REPLACE system-prompt section with three concrete bad-format examples and CRITICAL warning. |
| `src/lib/validation/autoFixLoop.ts` | `applyAutoFixResponse` now consumes `malformedEdits` and adds `[malformed] <path>` entries to the report (counted as `failed`). |
| `tests/extractors.test.ts` | **NEW** — 9 tests covering the malformed-fence path. |
| `tests/terminalAnsi.test.ts` | +1 REGRESSION test asserting `cleanControlCodes('\x1B[1G')` → `''` (the contract the render-side fix relies on). |

No other files were touched. Matrix UI, Supabase, OpenAI orchestration,
Monaco, WebContainer, file tree, and the patcher are all unchanged.

---

## 3. Automatically verified

```text
$ yarn test
Test Files  10 passed (10)
Tests       121 passed (121)      ← was 111; +10 new regression tests
Duration    2.19s

$ yarn type-check
$ tsc --noEmit
Done in 4.91s.                    (exit 0)

$ yarn build
✓ Compiled successfully
Done in 27.11s.                   (exit 0)
```

---

## 4. What still requires manual browser testing

WebContainer + live Supabase Realtime + Monaco editor model lifecycle
remain browser-only.

### Manual test script

1. **Bug A — Terminal renders cleanly even when chunks split mid-sequence**
   - Type `npm install` in the terminal panel.
   - Observe the spinner / progress lines: you should see them ROLL
     (the spinner character changes in place) — NOT a flood of `[1G`,
     `[0K`, `[?25l` lines.
   - Trigger a build: type `npm run build` or wait for the auto-fix
     loop to fire. SGR colours (red error lines, green ticks) must
     still appear correctly.
2. **Bug B — Malformed AI edits show a hard failure**
   - Build any small Next.js app (the user's exact prompt was:
     "Build a very small complete Next.js counter app with Tailwind
     CSS. Use App Router. Create all required files. Keep it simple.").
   - Once it builds green, ask: "Add a dark/light theme toggle using
     SEARCH/REPLACE edits only. Persist theme preference in
     localStorage. Do not rewrite unnecessary files."
   - If the AI emits a malformed fence (which can still happen
     occasionally — the prompt makes it much less likely but doesn't
     guarantee), the chat MUST display:

     > **Patch failure — malformed SEARCH/REPLACE blocks** ❌
     > The AI tried to edit the file below, but the response was
     > missing the required markers …
     > - `src/app/layout.tsx`
     > - `src/app/page.tsx`

   - The file tree must show NO changes to those files. Opening them
     in Monaco must show the OLD content (not the AI's claimed
     "Files written" prose).
   - Re-send the same prompt — the strengthened system-prompt
     guidance should produce well-formed SEARCH/REPLACE this time.
3. **Bug B happy path — well-formed edits actually update**
   - Send: "Rename the `count` state variable to `counter` in
     src/app/page.tsx using SEARCH/REPLACE."
   - Expect: chat shows `Patched src/app/page.tsx (N edits)`. File
     tree row for `page.tsx` flashes / refreshes. Opening it shows
     the rename. Monaco shows the updated content immediately. The
     Supabase `files` row content matches.
4. **Refresh persistence**
   - After running either #2 or #3, hard-refresh (Ctrl+Shift+R). The
     patch report / patch-failure messages must STILL be present in
     the chat (they go through `onAddMessage` → Supabase).

---

## 5. Deliverable

`/app/codepilot-fixed.zip` — rebuilt with this pass's changes.
Excludes `node_modules/`, `.next/`, `.git/`, `tsconfig.tsbuildinfo`.
`.env` carries the Supabase + OpenAI credentials from the original
problem statement.
