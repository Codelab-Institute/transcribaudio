import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { recordRequest } from "@/lib/schemas";
import { serviceSupabase } from "@/lib/supabase.server";

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, recordRequest);
  if ("response" in parsed) return parsed.response;
  const { familyName, reflection, contact } = parsed.data;

  const content = { familyName, reflection, ...(contact ? { contact } : {}) };
  const { error } = await serviceSupabase().from("records").insert({ content });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
