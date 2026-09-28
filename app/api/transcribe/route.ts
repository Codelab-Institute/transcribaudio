import { NextRequest, NextResponse } from "next/server";
import { AssemblyAI } from "assemblyai";
import { parseBody } from "@/lib/api";
import { serverEnv } from "@/lib/env";
import { transcribeRequest } from "@/lib/schemas";
import { audioPublicUrl } from "@/lib/supabase.server";

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, transcribeRequest);
  if ("response" in parsed) return parsed.response;
  const { path, languageCode } = parsed.data;

  const client = new AssemblyAI({ apiKey: serverEnv().ASSEMBLYAI_API_KEY });
  const audioUrl = audioPublicUrl(path);
  const speechModels = ["universal-2"];

  try {
    const transcript = await client.transcripts.submit(
      languageCode === "auto"
        ? { audio_url: audioUrl, language_detection: true, speech_models: speechModels }
        : { audio_url: audioUrl, language_code: languageCode, speech_models: speechModels },
    );
    return NextResponse.json({ transcriptId: transcript.id });
  } catch (err) {
    console.error("[transcribe] Submit failed:", err);
    return NextResponse.json({ error: "Failed to submit transcription" }, { status: 502 });
  }
}
