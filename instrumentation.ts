import { serverEnv } from "@/lib/env";

// Runs once per server instance before it takes traffic: a missing or
// malformed env var fails here with its name, not deep inside a request.
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") serverEnv();
}
