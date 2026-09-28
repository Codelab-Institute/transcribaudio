# AGENTS.md

Instructions for AI coding assistants working in this repo. Humans: see `README.md`.

## What this is

TranscribAudio is a Next.js 16 (App Router) app on Vercel with two user-facing flows:

1. **`/` — batch transcription.** Drop or browse audio/video files; each one uploads and
   transcribes immediately (up to 3 at a time). Microphone recordings wait in a list until
   the user presses **Transcribe**. Finished transcripts can be copied or rewritten with
   "Improve with AI" (Groq), with Undo. UI is English/Spanish via `lib/i18n.ts`.
2. **`/expansion` — reflection capture (Spanish).** Record a spoken reflection → transcribe →
   Groq extracts `familyName`, `reflection`, `contact` into a form → submit writes a row to
   the Supabase `records` table. `/expansion/lista` lists submitted records.

## Architecture

```
app/page.tsx                    composition only — no fetch logic here
lib/hooks/useTranscription.ts   job list + upload → submit → poll pipeline, concurrency, retry
lib/hooks/useRecorder.ts        MediaRecorder + timer
components/                     DropZone, AddFilesButton, JobCard, Recorder, LanguageSelect, …
types/job.ts                    Job, JobStatus
app/api/*/route.ts              route handlers (see below)
lib/schemas.ts                  zod schemas for every API request body (client-safe)
lib/api.ts                      parseBody(): JSON + zod → data or a 400 response
lib/env.ts / lib/env.public.ts  typed, lazily-validated env (server / NEXT_PUBLIC_*)
lib/supabase.ts                 browser client (anon key)
lib/supabase.server.ts          service-role client — never import from "use client" code
lib/audio.ts                    shared constants: bucket, size limit, language codes, path regex
lib/groq.ts                     GROQ_MODEL — the single source of truth for the chat model
instrumentation.ts              validates server env once at boot
```

### The transcription contract

1. `POST /api/upload-url` `{ filename, size }` → `{ token, path }`. Rejects files over 50 MB.
   `path` is `<timestamp>-<random>.<ext>` with the extension sanitized to `[a-z0-9]`.
2. Browser uploads directly to Supabase Storage (`audio-files` bucket) with
   `uploadToSignedUrl(path, token, file)`.
3. `POST /api/transcribe` `{ path, languageCode }` → `{ transcriptId }`. **Takes a storage
   path, not a URL** — the server builds the public URL so AssemblyAI can only fetch from our
   bucket. `languageCode` must be one of `LANGUAGE_CODES` in `lib/audio.ts`.
4. Poll `GET /api/transcription/:id` every 3 s until `status` is `completed` or `error`.

Other routes: `POST /api/improve` and `POST /api/expansion/extract` take `{ text }` (≤100k
chars) and call Groq; `POST /api/records` inserts into `records`.

### Storage cleanup cron

`vercel.json` schedules `GET /api/cron/cleanup-audio` daily at 04:00 UTC. It deletes every
object in `audio-files` except `sample.ogg` (re-uploaded from `public/` each run). It requires
`Authorization: Bearer $CRON_SECRET` — Vercel sends this automatically when `CRON_SECRET` is
set on the project. **It fails closed:** without the env var the route always returns 401.

## Rules

- **Validate every request body** with a schema in `lib/schemas.ts` via `parseBody()`. No
  `as string` casts on request data.
- **Never read `process.env` directly.** Use `serverEnv()` (server) or `publicEnv()` (client).
  Adding a var means adding it to the schema, `.env.local.example`, and `playwright.config.ts`.
- **Create clients lazily** (`serviceSupabase()`, `browserSupabase()`, `new Groq(...)` inside
  the handler). Module-scope clients break `next build` without secrets.
- **Don't change `GROQ_MODEL` casually** — read the comment in `lib/groq.ts` first.
- Anything interactive must be a real `<button>`/`<input>`; oxlint's jsx-a11y rules enforce it.
- Keep `lib/audio.ts` and `lib/schemas.ts` free of `"use client"` and server-only imports —
  both sides import them.

## Commands

```bash
npm run dev          # local dev (needs .env.local)
npm run typecheck    # tsc --noEmit
npm run lint         # oxlint (config: .oxlintrc.json)
npm run format       # oxfmt
npm run test:e2e     # Playwright: builds + starts on :3200 with dummy env
npm run test:e2e:ui  # Playwright UI mode
```

The pre-commit hook formats staged files and lints. CI (`.github/workflows/ci.yml`) runs
typecheck, lint, format check, `npm audit`, the production build and the E2E suite.

## Testing

E2E specs live in `e2e/`. Every external call is stubbed with `page.route` in `e2e/mocks.ts`,
and `playwright.config.ts` injects dummy env that overrides `.env.local`, so tests never touch
Supabase, AssemblyAI or Groq. When you change the transcription flow, update the mocks and add
a spec. API guard specs in `e2e/api.spec.ts` hit the real route handlers with bad input.

## Known gaps

- `/expansion/lista` has no auth and renders every record (including contact details) with the
  service-role key.
- No rate limiting on the paid routes (`/api/transcribe`, `/api/improve`,
  `/api/expansion/extract`). Configure Vercel WAF rate-limit rules or add code-level limits.
- The 50 MB limit is checked by our API, not by Storage. Set the `audio-files` bucket's file
  size limit in Supabase to enforce it at upload.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
