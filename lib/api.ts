import { NextResponse } from "next/server";
import type { z } from "zod";

// Parses a JSON body, returning either the data or a 400 response to send back.
export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }) };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid request";
    return { response: NextResponse.json({ error: message }, { status: 400 }) };
  }
  return { data: result.data };
}
