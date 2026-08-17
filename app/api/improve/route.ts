import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { GROQ_MODEL } from "@/lib/groq";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });

const MAX_RETRIES = 3;
const SYSTEM_PROMPT =
  `Rewrite the following transcript into clean, polished prose. ` +
  `Fix grammar, punctuation, and spelling. ` +
  `Convert fragments, run-ons, and filler words into complete, well-structured sentences. ` +
  `Organize into logical paragraphs where appropriate. ` +
  `Keep the same language — do NOT translate. ` +
  `Preserve the original meaning, but improve clarity and flow. ` +
  `Return ONLY the improved text with no extra commentary.`;

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    console.log(`[improve] Request received — ${text.length} chars of input text`);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[improve] Attempt ${attempt + 1}/${MAX_RETRIES + 1} — calling Groq...`);
        const start = Date.now();

        const completion = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
          temperature: 0.3,
        });

        const elapsed = Date.now() - start;
        const usage = completion.usage;
        console.log(
          `[improve] Success in ${elapsed}ms — ` +
            `input: ${usage?.prompt_tokens ?? "?"} tokens, ` +
            `output: ${usage?.completion_tokens ?? "?"} tokens`,
        );

        const improved = completion.choices[0]?.message?.content ?? text;
        console.log(`[improve] Returning improved text — ${improved.length} chars`);
        return NextResponse.json({ text: improved });
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        const delay = (attempt + 1) * 10000;
        if (status === 429 && attempt < MAX_RETRIES) {
          console.warn(
            `[improve] Rate limited (429) on attempt ${attempt + 1}, retrying in ${delay / 1000}s...`,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }

    throw new Error("Max retries exceeded");
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 429) {
      console.warn("[improve] All retries exhausted — returning 429 to client");
      return NextResponse.json(
        { error: "Rate limited — please wait a moment and try again" },
        { status: 429 },
      );
    }
    console.error("[improve] Unhandled error:", err);
    return NextResponse.json({ error: "Failed to improve text" }, { status: 500 });
  }
}
