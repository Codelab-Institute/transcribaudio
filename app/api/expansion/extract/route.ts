import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { GROQ_MODEL } from "@/lib/groq";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });

const SYSTEM_PROMPT = `You are given a raw transcript from a spoken form response.
Your job:
1) Improve grammar, punctuation, and clarity of the reflection text.
2) Extract these fields:
   - familyName: family or nucleus name
   - reflection: improved reflection text
   - contact: a phone number or email if present, otherwise empty string

Return ONLY valid JSON with this exact shape:
{
  "familyName": "string",
  "reflection": "string",
  "contact": "string"
}

Rules:
- Keep the same language as input.
- Do not invent details not present in transcript.
- If family name is unclear, return an empty string for familyName.
- If contact is missing, return an empty string for contact.
- reflection must be polished and readable, with corrected grammar.`;

type ExtractedForm = {
  familyName: string;
  reflection: string;
  contact: string;
};

function parseJsonObject(text: string): ExtractedForm | null {
  try {
    const parsed = JSON.parse(text) as Partial<ExtractedForm>;
    return {
      familyName: String(parsed.familyName ?? "").trim(),
      reflection: String(parsed.reflection ?? "").trim(),
      contact: String(parsed.contact ?? "").trim(),
    };
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
    const sliced = text.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(sliced) as Partial<ExtractedForm>;
      return {
        familyName: String(parsed.familyName ?? "").trim(),
        reflection: String(parsed.reflection ?? "").trim(),
        contact: String(parsed.contact ?? "").trim(),
      };
    } catch {
      return null;
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { text } = (await req.json()) as { text?: string };
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.2,
      // Guarantees parseable JSON; parseJsonObject stays as a fallback
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    });

    const output = completion.choices[0]?.message?.content ?? "";
    const parsed = parseJsonObject(output);

    if (!parsed) {
      return NextResponse.json({ error: "Failed to parse structured output" }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 429) {
      return NextResponse.json(
        { error: "Rate limited — please wait a moment and try again" },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: "Failed to extract form data" }, { status: 500 });
  }
}
