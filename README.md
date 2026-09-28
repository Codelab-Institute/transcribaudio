# TranscribAudio

Upload or record audio and get transcripts, with optional AI cleanup. Built with Next.js 16,
Supabase Storage, [AssemblyAI](https://www.assemblyai.com/) for speech-to-text, and
[Groq](https://groq.com/) for rewriting. Deployed on Vercel.

- **`/`** — drop audio/video files (up to 50 MB each) or record from the microphone; each file
  transcribes in the background. English/Spanish UI.
- **`/expansion`** — Spanish voice-to-form flow for collecting family reflections, stored in
  Supabase. Submitted records are listed at `/expansion/lista`.

## Setup

Requirements: Node 24, npm, a Supabase project, AssemblyAI and Groq API keys.

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev
```

### Environment variables

| Variable                        | Used for                                             |
| ------------------------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser uploads to Storage via signed URLs           |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server: signed upload URLs, `records` table, cleanup |
| `ASSEMBLYAI_API_KEY`            | Transcription                                        |
| `GROQ_API_KEY`                  | "Improve with AI" and `/expansion` field extraction  |
| `CRON_SECRET`                   | Authenticates the nightly cleanup cron (≥16 chars)   |

The server checks these at startup and names any that are missing or malformed. Generate a
cron secret with `openssl rand -hex 32`.

### Supabase

1. Create a **public** Storage bucket named `audio-files`. Setting its file size limit to
   50 MB is recommended.
2. Apply the migrations in `supabase/migrations/` (creates the `records` table), e.g. with
   `supabase db push`.

## Development

```bash
npm run typecheck
npm run lint
npm run format
npm run test:e2e      # Playwright, fully mocked — no real API calls or keys needed
```

First E2E run on a machine: `npx playwright install chromium`.

A husky pre-commit hook formats and lints staged files. GitHub Actions runs typecheck, lint,
format check, `npm audit`, the production build and the E2E suite on every PR. Dependabot
opens weekly dependency updates.

## Deployment

Push to `main` and Vercel deploys automatically. Set every variable above in the Vercel
project (`vercel env add <NAME>`). `vercel.json` schedules `/api/cron/cleanup-audio` daily at
04:00 UTC to empty the `audio-files` bucket. The route rejects requests unless `CRON_SECRET`
is set, and Vercel then sends it automatically.

## Contributing with AI assistants

`AGENTS.md` describes the architecture, the API contract and the rules for changing code.
`CLAUDE.md` imports it for Claude Code.
