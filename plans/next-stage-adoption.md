# Adopting next-stage practices in TranscribAudio

**Reference:** [Kazuki-tam/next-stage](https://github.com/Kazuki-tam/next-stage) — a Next.js 16 starter template built around AI-assisted development, type safety, and code quality.

**Status:** Proposal. Nothing here is implemented yet.
**Written:** 2026-08-17

---

## Context

next-stage is a _template_, not a library. Its value is the set of conventions it bakes in, not
code we can import. This plan separates:

- **Borrow** — conventions worth adopting here.
- **Skip** — conventions that would be churn for this repo.
- **Repo-specific gaps** — problems found while comparing the two codebases that next-stage
  doesn't address but that matter more than most of its conventions. These are marked
  _(not from next-stage)_.

Current state of this repo: Next.js 16 App Router, React 19, Tailwind 4, TypeScript strict,
oxlint + oxfmt, husky pre-commit. No tests, no CI, no README, no runtime validation, no
component layer — `app/page.tsx` is 920 lines.

---

## Skip these (deliberately)

Adopting these would be high-churn, low-return:

| next-stage choice                                                                     | Why skip                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bun** as runtime/package manager                                                    | We're on npm + Vercel, which builds fine. Swapping touches lockfile, husky, CI, and Vercel build config for no user-visible gain. Revisit only if install/test speed becomes a real complaint.          |
| **Biome** for lint + format                                                           | We already run **oxlint + oxfmt**, which occupy the same niche (Rust-based, unified lint+format) and are faster. Switching is lateral. Better move: _configure_ oxlint properly — see P1.4.             |
| **Hono** for API routes                                                               | Our seven route handlers are small and idiomatic Next.js. Hono buys us routing ergonomics we don't need and adds a layer between us and the App Router.                                                 |
| **shadcn/ui** wholesale                                                               | Reasonable eventually, but a full migration of hand-rolled Tailwind is a big diff. Extract our own components first (P2.1); adopt shadcn only if we start needing dialogs, toasts, and form primitives. |
| Multi-tool AI rule generation (`.cursor/`, `.windsurf/`, `.kiro/`, `.github/` copies) | We use Claude Code. One `AGENTS.md` is enough; generating four synced copies is maintenance we don't need.                                                                                              |

---

## P0 — Security and data-loss risks

These are the highest-value items in the plan and none of them come from next-stage.
Do these first regardless of what else gets picked up.

### P0.1 — Re-add auth to the cron cleanup route _(not from next-stage)_

`app/api/cron/cleanup-audio/route.ts` is an **unauthenticated public GET that deletes every
object in the `audio-files` bucket**. Anyone who knows the path can wipe storage, repeatedly.

Note: commit `8f398f6` ("Remove cron authorization and CRON_SECRET from env example")
removed this on purpose, so this is a decision to revisit rather than an oversight —
but the current state is a live destructive endpoint open to the internet.

**Fix:** verify Vercel's `CRON_SECRET` before doing any work.

```ts
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // ...existing body
}
```

Add `CRON_SECRET` to `.env.local.example` and to Vercel project env (`vercel env add`).
Vercel sends this header automatically for `vercel.json` crons.

**Effort:** ~15 min. **Files:** `app/api/cron/cleanup-audio/route.ts`, `.env.local.example`.

### P0.2 — Gate the paid-API routes _(not from next-stage)_

Four routes spend money or storage on behalf of anonymous callers:

- `/api/upload-url` — mints a signed Supabase upload URL for anyone. Free storage writes.
- `/api/transcribe` — submits **any URL the caller supplies** to AssemblyAI on our key.
  Not just a cost issue: it will fetch and transcribe arbitrary remote audio.
- `/api/improve` and `/api/expansion/extract` — burn Groq quota per call.

**Fix (staged):**

1. In `/api/transcribe`, require `audioUrl` to be inside our own Supabase storage public
   URL prefix. Cheapest, highest-value single change.
2. Add rate limiting keyed on IP. Vercel's WAF rate-limit rules need no code; Upstash Redis
   via the Marketplace is the code-level option if we want per-route budgets.
3. Consider Vercel BotID on the intake routes.

**Effort:** step 1 ~30 min; steps 2–3 half a day. **Files:** the four route handlers.

### P0.3 — Enforce the file size limit _(not from next-stage)_

`MAX_FILE_SIZE_MB = 50` in `lib/i18n.ts` is **display copy only** — it's rendered in the drop
zone text and never checked. A 2 GB file is accepted, uploaded, and fails deep in the flow
with an opaque error. Now that uploads auto-start on drop, there's no longer a moment where
the user can eyeball the file list and back out.

**Fix:** validate in `startUploads` before creating jobs; reject oversized files with a visible
per-file message rather than silently dropping them. Mirror the check server-side in
`/api/upload-url`.

**Effort:** ~1 hr. **Files:** `app/page.tsx`, `app/api/upload-url/route.ts`.

---

## P1 — Type safety and the testing safety net

This is where next-stage's conventions map most directly onto real gaps here.

### P1.1 — Zod validation at every API boundary _(from next-stage)_

next-stage validates all input with Zod (via `@hono/zod-validator`). We validate almost
nothing. Concrete failures in the current code:

- `/api/upload-url` does `filename.split(".")` on an unvalidated body — a request without
  `filename` throws a raw `TypeError` and returns an unhandled 500.
- The same route derives the storage path from the caller-supplied extension with no
  sanitizing, so `ext` can contain `/` and write to arbitrary bucket paths.
- `/api/transcribe` passes `audioUrl` and `languageCode` straight through with `as string`
  casts that assert rather than check.

**Fix:** add `zod`, define a schema per route, parse at the top of each handler, return a 400
on failure. Skip Hono — plain `schema.safeParse(await req.json())` is fine. Keep schemas in
`lib/schemas.ts` so client and server share them.

**Effort:** ~2 hrs for all seven routes. **New dep:** `zod`.

### P1.2 — Validate environment variables at startup _(from next-stage)_

Every route does `process.env.NEXT_PUBLIC_SUPABASE_URL!` — the `!` asserts a value that may
not exist. A missing var surfaces as a confusing Supabase client error at request time, in
production, rather than at boot.

**Fix:** a `lib/env.ts` that parses `process.env` through a Zod schema once and exports a typed
object. Import that instead of `process.env` everywhere. Fails the build/boot loudly with the
name of the missing var.

**Effort:** ~1 hr. **Files:** new `lib/env.ts`, all route handlers, `app/page.tsx`.

### P1.3 — Playwright E2E tests _(from next-stage)_

next-stage ships Playwright with `test:e2e`, `test:e2e:ui`, and `test:codegen`. We have zero
tests against a 920-line component containing concurrency limits, a polling loop, staleness
guards via `runRef`, and retry logic. That's exactly the code that breaks silently.

**Starting suite — five specs:**

1. Drop a file → transcript appears (the change just made: auto-start on upload).
2. Drop multiple files → all complete; concurrency capped at 3.
3. Record → the Transcribe button path still works.
4. Reset mid-transcription → polling stops and doesn't resurrect jobs.
5. A failing job shows an error and Retry recovers it.

Mock the AssemblyAI/Groq calls at the network layer (`page.route`) so the suite is fast and
free. `public/sample.ogg` already exists as a fixture.

**Effort:** ~1 day for the harness + specs. **New dep:** `@playwright/test`. **New dir:** `e2e/`.

### P1.4 — Configure oxlint properly _(adapted from next-stage's Biome setup)_

We run `oxlint .` with **no config file**, so we get defaults only — 93 rules. next-stage's
value here isn't Biome specifically, it's that linting is configured intentionally.

**Fix:** add `.oxlintrc.json` enabling the `correctness`, `suspicious`, `react`, `react-hooks`,
and `jsx-a11y` categories. The a11y set matters immediately — see P2.3.

**Effort:** ~1 hr including fixing what it surfaces.

### P1.5 — CI on pull requests _(not from next-stage — it has none)_

Our husky pre-commit runs format + lint + **a full `next build`**, which is slow enough that
it invites `--no-verify`, and it protects nothing once code is pushed.

**Fix:** a `.github/workflows/ci.yml` running `tsc --noEmit`, `oxlint`, `next build`, and
Playwright on every PR. Then **trim the pre-commit hook to format + lint only** and let CI own
the build. Faster commits, stronger guarantees.

**Effort:** ~2 hrs. **Files:** new `.github/workflows/ci.yml`, `.husky/pre-commit`.

---

## P2 — Structure and developer experience

### P2.1 — Break up `app/page.tsx` _(from next-stage's directory conventions)_

next-stage separates `app/_components/`, `components/ui/`, `config/`, `lib/`, `types/`.
Our `app/page.tsx` is 920 lines holding UI, upload orchestration, polling, recording, clipboard,
and the AI-improve flow in one component.

**Suggested split** (keep `@/` paths; adopting `src/` is optional churn):

```
app/page.tsx              → layout + composition only
components/DropZone.tsx
components/JobCard.tsx
components/Recorder.tsx
components/LanguageSelect.tsx
lib/hooks/useTranscription.ts   → jobs, runJobs, transcribeFile, polling, runRef
lib/hooks/useRecorder.ts        → MediaRecorder + timer + stream cleanup
types/job.ts                    → Job, JobStatus
```

Do this **after** P1.3 — the E2E tests are what make the refactor safe.

**Effort:** ~1 day.

### P2.2 — App Router error and loading conventions _(implied by next-stage; missing here)_

No `error.tsx`, `not-found.tsx`, or `loading.tsx` anywhere. An unhandled render error currently
shows the default Next.js error screen with no way back.

**Fix:** add `app/error.tsx` (with a reset button), `app/not-found.tsx`, and a route-level
`error.tsx` under `app/expansion/`.

**Effort:** ~1 hr.

### P2.3 — Accessibility on the intake controls _(next-stage uses Markuplint for this)_

next-stage runs Markuplint over JSX. Rather than add that tool, get the same coverage from
oxlint's `jsx-a11y` rules (P1.4) — they'll flag a real bug we have today: the drop zone is a
`<div>` with `onClick` and no `role`, `tabIndex`, or key handler, so it is **completely
unreachable by keyboard**. Same pattern on the "New audio" control.

**Fix:** make them `<button type="button">`, or add `role="button" tabIndex={0}` plus an
`onKeyDown` handler for Enter/Space.

**Effort:** ~1 hr.

### P2.4 — `AGENTS.md` + `README.md` _(from next-stage — this is its core thesis)_

next-stage's central idea is a committed, versioned instruction file for AI assistants
(`AGENTS.md`, following the agents.md standard). We have **no README and no agent instructions** —
only an untracked `.claude/settings.local.json`.

**Write `AGENTS.md` covering:** the two flows (main transcription page, `/expansion` reflection
capture), the AssemblyAI submit→poll contract, the Supabase bucket + nightly cleanup cron,
where env vars come from, and the oxlint/oxfmt/husky commands.

**Write `README.md` covering:** setup, `.env.local` from the example, `supabase/migrations`, and
the Vercel deploy path.

Highest value-per-hour item in the entire plan.

**Effort:** ~2 hrs.

### P2.5 — Editor and tooling config _(from next-stage)_

Add `.editorconfig` and `.vscode/settings.json` (format-on-save wired to oxfmt, recommended
extensions). Trivial, and it stops formatting drift between contributors.

**Effort:** ~20 min.

---

## P3 — Optional / later

- **Next.js DevTools MCP** — next-stage wires `next-devtools-mcp` into its assistants. Cheap to
  add to `.claude/` config; gives Claude Code direct access to build diagnostics and Next docs.
- **Unit tests** — next-stage uses Bun's test runner. On npm, `vitest` covers `lib/i18n.ts`,
  the Zod schemas, and the extracted hooks. Only worth it once P2.1 has produced units to test.
- **Supply-chain gating** — next-stage uses `@socketsecurity/bun-security-scanner` plus a
  1-day minimum release age. The npm-native equivalent is Dependabot/Renovate with a cooldown
  and `npm audit` in CI. Low urgency: we have seven direct dependencies.
- **Security headers** — neither repo has them. A `headers()` block in `next.config.ts` for
  CSP, `X-Frame-Options`, and `Referrer-Policy` is a contained win.
- **shadcn/ui** — revisit after P2.1 if we start needing real dialogs, toasts, or forms.
- **`src/` directory move** — next-stage nests everything under `src/`. Pure convention; do it
  only if bundled with another large refactor.

---

## Suggested sequence

1. **Week 1 — P0 entirely.** Cron auth, transcribe URL allowlist, file size enforcement.
   Small diffs, closes the live risks.
2. **Week 2 — P2.4, P1.4, P1.5, P1.2.** Docs, lint config, CI, env validation. All independent
   and quick; each one makes the next change safer.
3. **Week 3 — P1.1 and P1.3.** Zod at the boundaries, then the Playwright suite.
4. **Week 4 — P2.1 refactor**, with P2.2 and P2.3 folded in as the components get extracted.

P0 and P2.4 are worth doing even if the rest of this plan is dropped.
