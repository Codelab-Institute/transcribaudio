import type { Page, Route } from "@playwright/test";

export type MockOptions = {
  // Transcript text returned for each submitted file, keyed by call order
  transcript?: (n: number) => string;
  // Status polls that return "processing" before "completed"
  pollsBeforeDone?: number;
  // Make the Nth /api/transcribe submit (1-based) fail
  failSubmit?: (n: number) => boolean;
  // Hold transcription polls open until release() is called
  holdPolls?: boolean;
};

// Stubs every network hop the upload → transcribe → poll flow makes, and
// records what was called so specs can assert on it.
export async function mockTranscription(page: Page, opts: MockOptions = {}) {
  const calls = { uploadUrl: 0, storagePut: 0, submit: 0, polls: 0, improve: 0 };
  const pollCounts = new Map<string, number>();
  const gate = Promise.withResolvers<void>();
  if (!opts.holdPolls) gate.resolve();
  const released = gate.promise;

  await page.route("**/api/upload-url", async (route) => {
    calls.uploadUrl++;
    const body = route.request().postDataJSON() as { filename: string; size: number };
    const ext = body.filename.split(".").pop();
    await route.fulfill({
      json: { token: "tok", path: `${Date.now()}-${calls.uploadUrl}.${ext}` },
    });
  });

  await page.route("**/storage/v1/object/upload/sign/**", async (route) => {
    calls.storagePut++;
    await route.fulfill({ json: { Key: "audio-files/x" } });
  });

  await page.route("**/api/transcribe", async (route) => {
    calls.submit++;
    const n = calls.submit;
    if (opts.failSubmit?.(n)) {
      await route.fulfill({ status: 502, json: { error: "Failed to submit transcription" } });
      return;
    }
    await route.fulfill({ json: { transcriptId: `t${n}` } });
  });

  await page.route("**/api/transcription/*", async (route: Route) => {
    calls.polls++;
    await released;
    const id = route.request().url().split("/").pop()!;
    const seen = (pollCounts.get(id) ?? 0) + 1;
    pollCounts.set(id, seen);
    if (seen <= (opts.pollsBeforeDone ?? 0)) {
      await route.fulfill({ json: { status: "processing" } });
      return;
    }
    const n = Number(id.slice(1));
    const text = opts.transcript?.(n) ?? `Transcript number ${n}`;
    await route.fulfill({ json: { status: "completed", text } });
  });

  await page.route("**/api/improve", async (route) => {
    calls.improve++;
    const { text } = route.request().postDataJSON() as { text: string };
    await route.fulfill({ json: { text: `Improved: ${text}` } });
  });

  return { calls, release: () => gate.resolve() };
}

export function audioFile(name: string, sizeBytes = 1024) {
  return { name, mimeType: "audio/mpeg", buffer: Buffer.alloc(sizeBytes) };
}
