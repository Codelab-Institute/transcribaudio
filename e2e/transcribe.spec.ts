import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { audioFile, mockTranscription } from "./mocks";

const fileInput = 'input[type="file"]';

test("a dropped file uploads and shows its transcript without pressing Transcribe", async ({
  page,
}) => {
  const { calls } = await mockTranscription(page, {
    pollsBeforeDone: 1,
    transcript: () => "Hello from the sample file",
  });
  await page.goto("/");

  await page.locator(fileInput).first().setInputFiles(audioFile("sample.mp3"));

  await expect(page.getByText("Done")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveValue("Hello from the sample file");
  expect(calls).toMatchObject({ uploadUrl: 1, storagePut: 1, submit: 1 });
});

test("multiple files all complete, at most three at a time", async ({ page }) => {
  const { calls, release } = await mockTranscription(page, { holdPolls: true });
  await page.goto("/");

  await page
    .locator(fileInput)
    .first()
    .setInputFiles([1, 2, 3, 4, 5].map((n) => audioFile(`file-${n}.mp3`)));

  // Three jobs reach the poll stage and block there; the other two wait
  await expect.poll(() => calls.submit).toBe(3);
  await expect(page.getByText("Queued")).toHaveCount(2);
  expect(calls.uploadUrl).toBe(3);

  release();

  await expect(page.getByText("Done")).toHaveCount(5);
  await expect(page.getByText("Transcript · 5/5")).toBeVisible();
  expect(calls.uploadUrl).toBe(5);
});

test("a recording waits for the Transcribe button", async ({ page }) => {
  const { calls } = await mockTranscription(page, { transcript: () => "Recorded words" });
  await page.goto("/");

  await page.getByRole("button", { name: "Record from microphone" }).click();
  await expect(page.getByText("Recording")).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Stop" }).click();

  await expect(page.getByText(/^recording-\d+\.\w+$/)).toBeVisible();
  expect(calls.uploadUrl).toBe(0);

  await page.getByRole("button", { name: "Transcribe" }).click();
  await expect(page.getByRole("textbox")).toHaveValue("Recorded words");
});

test("a failed job shows its error and Try again recovers it", async ({ page }) => {
  await mockTranscription(page, {
    failSubmit: (n) => n === 1,
    transcript: () => "Worked on retry",
  });
  await page.goto("/");

  await page.locator(fileInput).first().setInputFiles(audioFile("flaky.mp3"));

  await expect(page.getByText("Failed to submit transcription")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByText("Done")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveValue("Worked on retry");
});

test("a file over the size limit is rejected before any upload", async ({ page }, testInfo) => {
  const { calls } = await mockTranscription(page);
  // setInputFiles caps in-memory buffers at 50 MB, so the big one goes via disk
  const huge = testInfo.outputPath("huge.mp3");
  await writeFile(huge, Buffer.alloc(51 * 1024 * 1024));
  await page.goto("/");

  await page.locator(fileInput).first().setInputFiles([huge]);
  await page.locator(fileInput).first().setInputFiles(audioFile("fine.mp3"));

  await expect(page.getByText("This file is larger than the limit of 50 MB")).toBeVisible();
  await expect(page.getByText("Done")).toHaveCount(1);
  // No retry for a file that can never succeed
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  expect(calls.uploadUrl).toBe(1);
});

test("Improve with AI rewrites the transcript and Undo restores it", async ({ page }) => {
  await mockTranscription(page, { transcript: () => "um so hello" });
  await page.goto("/");

  await page.locator(fileInput).first().setInputFiles(audioFile("talk.mp3"));
  const textbox = page.getByRole("textbox");
  await expect(textbox).toHaveValue("um so hello");

  await page.getByRole("button", { name: "Improve with AI" }).click();
  await expect(textbox).toHaveValue("Improved: um so hello");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(textbox).toHaveValue("um so hello");
});

test("the drop zone is reachable and operable from the keyboard", async ({ page }) => {
  await page.goto("/");
  const dropZone = page.getByRole("button", { name: /Audio Files/ });

  await dropZone.focus();
  await expect(dropZone).toBeFocused();

  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  expect((await chooser).isMultiple()).toBe(true);
});

test("the chosen UI language survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await expect(page.getByText("Sube archivos de audio y obtén transcripciones")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Sube archivos de audio y obtén transcripciones")).toBeVisible();

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByText("Upload audio files and get transcripts")).toBeVisible();
});
