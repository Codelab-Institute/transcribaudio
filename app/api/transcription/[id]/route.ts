import { NextRequest, NextResponse } from "next/server";
import { AssemblyAI } from "assemblyai";
import { serverEnv } from "@/lib/env";
import { transcriptionId } from "@/lib/schemas";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = transcriptionId.safeParse((await params).id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid transcript id" }, { status: 400 });
  }

  const client = new AssemblyAI({ apiKey: serverEnv().ASSEMBLYAI_API_KEY });

  try {
    const transcript = await client.transcripts.get(parsed.data);
    return NextResponse.json({
      status: transcript.status,
      text: transcript.text,
      error: transcript.error,
    });
  } catch (err) {
    console.error("[transcription] Status check failed:", err);
    return NextResponse.json({ error: "Failed to check transcription" }, { status: 502 });
  }
}
