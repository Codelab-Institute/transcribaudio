import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AUDIO_BUCKET } from "@/lib/audio";
import { serverEnv } from "@/lib/env";

// Service-role client. Never import this from a "use client" module.
let serviceClient: SupabaseClient | undefined;

export function serviceSupabase() {
  if (!serviceClient) {
    const env = serverEnv();
    serviceClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return serviceClient;
}

// Public URL for an object in the audio bucket. Built server-side so callers
// can only point transcription at our own storage.
export function audioPublicUrl(path: string) {
  return serviceSupabase().storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl;
}
