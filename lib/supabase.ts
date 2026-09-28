import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env.public";

// Browser client (anon key). Created on first use rather than at import so
// prerendering pages doesn't require env vars.
let browserClient: SupabaseClient | undefined;

export function browserSupabase() {
  if (!browserClient) {
    const env = publicEnv();
    browserClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return browserClient;
}
