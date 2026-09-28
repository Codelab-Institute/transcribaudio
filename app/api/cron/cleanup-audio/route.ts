import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { AUDIO_BUCKET as BUCKET } from "@/lib/audio";
import { serverEnv } from "@/lib/env";
import { serviceSupabase } from "@/lib/supabase.server";

const SAMPLE_OBJECT = "sample.ogg";
const LIST_PAGE_SIZE = 1000;
const REMOVE_BATCH_SIZE = 100;

// Vercel sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations.
// Fails closed: with no secret configured, nobody can trigger the wipe.
function isAuthorized(req: NextRequest) {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function collectObjectPaths(folderPath: string): Promise<string[]> {
  const supabase = serviceSupabase();
  const paths: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(folderPath, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.length) {
      break;
    }

    for (const item of data) {
      const itemPath = folderPath ? `${folderPath}/${item.name}` : item.name;
      if (item.id) {
        paths.push(itemPath);
      } else {
        paths.push(...(await collectObjectPaths(itemPath)));
      }
    }

    if (data.length < LIST_PAGE_SIZE) {
      break;
    }
    offset += LIST_PAGE_SIZE;
  }

  return paths;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    if (!serverEnv().CRON_SECRET) console.error("[cleanup-audio] CRON_SECRET is not set");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceSupabase();
  try {
    const samplePath = join(process.cwd(), "public", SAMPLE_OBJECT);
    const sampleBytes = await readFile(samplePath);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(SAMPLE_OBJECT, sampleBytes, {
        contentType: "audio/ogg",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const paths = (await collectObjectPaths("")).filter((p) => p !== SAMPLE_OBJECT);
    let removed = 0;

    for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
      const batch = paths.slice(i, i + REMOVE_BATCH_SIZE);
      const { error } = await supabase.storage.from(BUCKET).remove(batch);
      if (error) {
        throw new Error(error.message);
      }
      removed += batch.length;
    }

    return NextResponse.json({ ok: true, removed, uploaded: SAMPLE_OBJECT });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cleanup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 60;
