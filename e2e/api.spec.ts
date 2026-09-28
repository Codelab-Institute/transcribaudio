import { expect, test } from "@playwright/test";

// Server-side guards. These hit the real route handlers; each request is
// rejected before any call to Supabase, AssemblyAI or Groq.

test("cron cleanup rejects requests without the secret", async ({ request }) => {
  expect((await request.get("/api/cron/cleanup-audio")).status()).toBe(401);
  const wrong = await request.get("/api/cron/cleanup-audio", {
    headers: { authorization: "Bearer not-the-secret-000000" },
  });
  expect(wrong.status()).toBe(401);
});

test("transcribe only accepts paths in our bucket, not URLs", async ({ request }) => {
  const url = await request.post("/api/transcribe", {
    data: { audioUrl: "https://example.com/a.mp3", languageCode: "en" },
  });
  expect(url.status()).toBe(400);

  const traversal = await request.post("/api/transcribe", {
    data: { path: "../secret.mp3", languageCode: "en" },
  });
  expect(traversal.status()).toBe(400);
});

test("upload-url rejects missing fields and oversized files", async ({ request }) => {
  expect((await request.post("/api/upload-url", { data: {} })).status()).toBe(400);
  const big = await request.post("/api/upload-url", {
    data: { filename: "a.mp3", size: 51 * 1024 * 1024 },
  });
  expect(big.status()).toBe(400);
  expect(await big.json()).toEqual({ error: "File is larger than 50 MB" });
});

test("AI routes reject empty text", async ({ request }) => {
  for (const path of ["/api/improve", "/api/expansion/extract"]) {
    expect((await request.post(path, { data: { text: "  " } })).status()).toBe(400);
  }
});
