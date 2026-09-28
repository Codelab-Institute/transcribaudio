import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/api";
import { AUDIO_BUCKET, storageExtension } from "@/lib/audio";
import { uploadUrlRequest } from "@/lib/schemas";
import { serviceSupabase } from "@/lib/supabase.server";

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, uploadUrlRequest);
  if ("response" in parsed) return parsed.response;

  // The extension is sanitized to [a-z0-9] so callers can't steer the path
  const ext = storageExtension(parsed.data.filename);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await serviceSupabase()
    .storage.from(AUDIO_BUCKET)
    .createSignedUploadUrl(path);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ token: data.token, path });
}
