"use client";

import { useCallback, useRef, useState } from "react";
import { AUDIO_BUCKET, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from "@/lib/audio";
import { browserSupabase } from "@/lib/supabase";
import { isActive, type Job, type JobStatus } from "@/types/job";

// How many files upload/transcribe at the same time
const MAX_CONCURRENT = 3;
const POLL_INTERVAL_MS = 3000;
const IMPROVE_COOLDOWN_MS = 15000;

type Messages = { fileTooLarge: string };

// Owns the job list and the upload → submit → poll pipeline for each file.
export function useTranscription(messages: Messages, onError: (message: string) => void) {
  const [jobs, setJobs] = useState<Job[]>([]);
  // Bumped on reset so in-flight polling loops abandon themselves
  const runRef = useRef(0);
  const pollTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  // Keeps the File around per job so a failed job can be retried
  const jobFilesRef = useRef<Map<string, File>>(new Map());

  const updateJob = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }, []);

  const sleep = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        pollTimeoutsRef.current.delete(timeout);
        resolve();
      }, ms);
      pollTimeoutsRef.current.add(timeout);
    });
  }, []);

  const transcribeFile = useCallback(
    async (id: string, file: File, languageCode: string, run: number) => {
      const stale = () => runRef.current !== run;

      try {
        updateJob(id, { status: "uploading", error: "" });

        // 1. Get a signed upload URL from our API (uses service role key server-side)
        const urlRes = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, size: file.size }),
        });

        if (!urlRes.ok) {
          const body = await urlRes.json();
          throw new Error(body.error ?? "Failed to get upload URL");
        }

        const { token, path } = await urlRes.json();
        if (stale()) return;

        // 2. Upload directly to Supabase using the signed URL
        const { error: uploadError } = await browserSupabase()
          .storage.from(AUDIO_BUCKET)
          .uploadToSignedUrl(path, token, file, { contentType: file.type });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
        if (stale()) return;

        // 3. Submit for transcription (the server resolves the path to a URL)
        updateJob(id, { status: "processing" });

        const transcribeRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, languageCode }),
        });

        if (!transcribeRes.ok) {
          const body = await transcribeRes.json();
          throw new Error(body.error ?? "Failed to submit transcription");
        }

        const { transcriptId } = await transcribeRes.json();

        // 4. Poll for completion
        while (!stale()) {
          const res = await fetch(`/api/transcription/${transcriptId}`);
          const data = await res.json();

          if (data.status === "completed") {
            updateJob(id, { status: "done", transcript: data.text ?? "" });
            return;
          }
          if (data.status === "error") {
            throw new Error(data.error ?? "Transcription failed");
          }
          await sleep(POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (stale()) return;
        updateJob(id, {
          status: "error",
          error: err instanceof Error ? err.message : "Something went wrong",
        });
      }
    },
    [sleep, updateJob],
  );

  // Runs the given jobs a few at a time so many large uploads don't compete
  const runJobs = useCallback(
    async (entries: { id: string; file: File }[], languageCode: string) => {
      const run = runRef.current;
      let next = 0;
      const workers = Array.from({ length: Math.min(MAX_CONCURRENT, entries.length) }, async () => {
        while (next < entries.length && runRef.current === run) {
          const entry = entries[next++];
          await transcribeFile(entry.id, entry.file, languageCode, run);
        }
      });
      await Promise.all(workers);
    },
    [transcribeFile],
  );

  const start = useCallback(
    (files: File[], languageCode: string) => {
      if (!files.length) return;

      const entries = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        tooLarge: file.size > MAX_FILE_SIZE_BYTES,
      }));
      // Oversized files get a visible failed card instead of an upload that
      // would fail deep in the flow
      const runnable = entries.filter((entry) => !entry.tooLarge);
      for (const { id, file } of runnable) jobFilesRef.current.set(id, file);

      setJobs((prev) => [
        ...prev,
        ...entries.map(({ id, file, tooLarge }) => ({
          id,
          name: file.name,
          size: file.size,
          status: (tooLarge ? "error" : "queued") as JobStatus,
          transcript: "",
          originalTranscript: "",
          isImproved: false,
          isImproving: false,
          improveCooldown: false,
          copied: false,
          error: tooLarge ? `${messages.fileTooLarge} ${MAX_FILE_SIZE_MB} MB` : "",
          retryable: !tooLarge,
        })),
      ]);

      if (runnable.length) void runJobs(runnable, languageCode);
    },
    [messages.fileTooLarge, runJobs],
  );

  const retry = useCallback(
    (id: string, languageCode: string) => {
      const file = jobFilesRef.current.get(id);
      if (file) void runJobs([{ id, file }], languageCode);
    },
    [runJobs],
  );

  const copy = useCallback(
    async (job: Job) => {
      await navigator.clipboard.writeText(job.transcript);
      updateJob(job.id, { copied: true });
      setTimeout(() => updateJob(job.id, { copied: false }), 2000);
    },
    [updateJob],
  );

  const improve = useCallback(
    async (job: Job) => {
      updateJob(job.id, { isImproving: true });
      try {
        const res = await fetch("/api/improve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: job.transcript }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to improve");
        updateJob(job.id, {
          originalTranscript: job.transcript,
          transcript: data.text,
          isImproved: true,
        });
      } catch {
        onError("Failed to improve transcript");
      } finally {
        updateJob(job.id, { isImproving: false, improveCooldown: true });
        setTimeout(() => updateJob(job.id, { improveCooldown: false }), IMPROVE_COOLDOWN_MS);
      }
    },
    [onError, updateJob],
  );

  const undo = useCallback(
    (job: Job) => {
      updateJob(job.id, {
        transcript: job.originalTranscript,
        originalTranscript: "",
        isImproved: false,
      });
    },
    [updateJob],
  );

  const reset = useCallback(() => {
    runRef.current += 1;
    pollTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    pollTimeoutsRef.current.clear();
    jobFilesRef.current.clear();
    setJobs([]);
  }, []);

  const doneCount = jobs.filter((job) => job.status === "done").length;
  const activeCount = jobs.filter(isActive).length;

  return { jobs, doneCount, activeCount, start, retry, copy, improve, undo, reset };
}
