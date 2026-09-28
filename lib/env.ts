import { z } from "zod";

// Server-only env. Parsed lazily so `next build` works without secrets
// (CI, preview builds); instrumentation.ts calls serverEnv() at boot so a
// missing var still fails loudly before the first request.
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ASSEMBLYAI_API_KEY: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  // Optional so a missing value doesn't take the whole app down; the cron
  // route refuses to run without it.
  CRON_SECRET: z.string().min(16).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid server environment:\n${z.prettifyError(result.error)}`);
  }
  cached = result.data;
  return cached;
}
