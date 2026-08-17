"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { useLocale, buildLanguageOptions, MAX_FILE_SIZE_MB, type Locale } from "@/lib/i18n";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// How many files upload/transcribe at the same time
const MAX_CONCURRENT = 3;

type JobStatus = "queued" | "uploading" | "processing" | "done" | "error";

type Job = {
  id: string;
  name: string;
  size: number;
  status: JobStatus;
  transcript: string;
  originalTranscript: string;
  isImproved: boolean;
  isImproving: boolean;
  improveCooldown: boolean;
  copied: boolean;
  error: string;
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function Home() {
  const { locale, setLocale, t } = useLocale();
  const [language, setLanguage] = useState("auto");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [globalError, setGlobalError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingMore, setIsDraggingMore] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moreInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
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
          body: JSON.stringify({ filename: file.name }),
        });

        if (!urlRes.ok) {
          const body = await urlRes.json();
          throw new Error(body.error ?? "Failed to get upload URL");
        }

        const { token, path } = await urlRes.json();
        if (stale()) return;

        // 2. Upload directly to Supabase using the signed URL
        const { error: uploadError } = await supabase.storage
          .from("audio-files")
          .uploadToSignedUrl(path, token, file, { contentType: file.type });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
        if (stale()) return;

        // 3. Get the public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from("audio-files").getPublicUrl(path);

        // 4. Submit for transcription
        updateJob(id, { status: "processing" });

        const transcribeRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioUrl: publicUrl, languageCode }),
        });

        if (!transcribeRes.ok) {
          const body = await transcribeRes.json();
          throw new Error(body.error ?? "Failed to submit transcription");
        }

        const { transcriptId } = await transcribeRes.json();

        // 5. Poll for completion
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
          await sleep(3000);
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

  const startFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      setGlobalError("");

      const entries = files.map((file) => {
        const id = crypto.randomUUID();
        jobFilesRef.current.set(id, file);
        return { id, file };
      });

      setJobs((prev) => [
        ...prev,
        ...entries.map(({ id, file }) => ({
          id,
          name: file.name,
          size: file.size,
          status: "queued" as JobStatus,
          transcript: "",
          originalTranscript: "",
          isImproved: false,
          isImproving: false,
          improveCooldown: false,
          copied: false,
          error: "",
        })),
      ]);

      void runJobs(entries, language);
    },
    [language, runJobs],
  );

  const handleSubmit = () => {
    startFiles(pendingFiles);
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Dropped/browsed files start transcribing right away — the Transcribe button
  // is only there for recordings, which land in pendingFiles. Any recording
  // already waiting comes along, since the intake view is about to disappear.
  const startUploads = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      startFiles([...pendingFiles, ...files]);
      setPendingFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [pendingFiles, startFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      // Dropping mid-recording would swap the intake view out from under it
      if (isRecording) return;
      startUploads(Array.from(e.dataTransfer.files));
    },
    [isRecording, startUploads],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    startUploads(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  // The "New audio" control in the results view starts transcribing immediately
  const handleDropMore = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingMore(false);
      startFiles(Array.from(e.dataTransfer.files));
    },
    [startFiles],
  );

  const handleMoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    startFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const recorded = new File([blob], `recording-${Date.now()}.${ext}`, {
          type: mimeType,
        });
        setPendingFiles((prev) => [...prev, recorded]);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((s) => s + 1);
      }, 1000);
    } catch {
      setGlobalError("Microphone access denied or unavailable");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleRetry = (id: string) => {
    const file = jobFilesRef.current.get(id);
    if (!file) return;
    void runJobs([{ id, file }], language);
  };

  const handleCopy = async (job: Job) => {
    await navigator.clipboard.writeText(job.transcript);
    updateJob(job.id, { copied: true });
    setTimeout(() => updateJob(job.id, { copied: false }), 2000);
  };

  const handleCopyAll = async () => {
    const text = jobs
      .filter((job) => job.status === "done" && job.transcript)
      .map((job) => job.transcript)
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleImprove = async (job: Job) => {
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
      setGlobalError("Failed to improve transcript");
    } finally {
      updateJob(job.id, { isImproving: false, improveCooldown: true });
      setTimeout(() => updateJob(job.id, { improveCooldown: false }), 15000);
    }
  };

  const handleUndo = (job: Job) => {
    updateJob(job.id, {
      transcript: job.originalTranscript,
      originalTranscript: "",
      isImproved: false,
    });
  };

  const reset = () => {
    runRef.current += 1;
    pollTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    pollTimeoutsRef.current.clear();
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    jobFilesRef.current.clear();
    setJobs([]);
    setPendingFiles([]);
    setGlobalError("");
    setCopiedAll(false);
    setIsRecording(false);
    setRecordingTime(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (moreInputRef.current) moreInputRef.current.value = "";
  };

  const hasJobs = jobs.length > 0;
  const doneCount = jobs.filter((job) => job.status === "done").length;
  const activeCount = jobs.filter(
    (job) => job.status === "queued" || job.status === "uploading" || job.status === "processing",
  ).length;

  const spinner = (className: string) => (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );

  return (
    <main className="min-h-screen bg-slate-50 flex items-start justify-center pt-16 px-4 pb-16">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">TranscribAudio</h1>
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              {(["en", "es"] as Locale[]).map((l, i) => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
                  className={[
                    "px-2.5 py-1 transition-colors",
                    i === 0 ? "" : "border-l border-slate-200",
                    locale === l ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <p className="text-slate-500 mt-2 text-sm">{t.subtitle}</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
          {/* ── Intake view ────────────────────────────────────────── */}
          {!hasJobs && (
            <>
              {/* Language */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t.languageLabel}
                </label>
                {(() => {
                  const { autoDetect, featured, others } = buildLanguageOptions(locale, t);
                  return (
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value={autoDetect.value}>{autoDetect.label}</option>
                      {featured.map((lang) => (
                        <option key={lang.value} value={lang.value}>
                          {lang.label}
                        </option>
                      ))}
                      <option disabled>────────────────</option>
                      {others.map((lang) => (
                        <option key={lang.value} value={lang.value}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </div>

              {/* File drop zone */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t.audioFileLabel}
                </label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !isRecording && fileInputRef.current?.click()}
                  className={[
                    "border-2 border-dashed rounded-xl p-10 text-center transition-colors",
                    isDragging
                      ? "border-blue-400 bg-blue-50"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                    isRecording ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                  ].join(" ")}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,video/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={isRecording}
                  />

                  <div className="flex items-center justify-center mb-3">
                    <svg
                      className="w-10 h-10 text-slate-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                  </div>
                  <p className="text-slate-600 font-medium text-sm">{t.dropPrompt}</p>
                  <p className="text-slate-400 text-xs mt-1">{t.dropBrowse}</p>
                  <p className="text-slate-400 text-xs mt-2">{t.dropFormats}</p>
                  <p className="text-slate-400 text-xs mt-1">
                    {t.upTo} {MAX_FILE_SIZE_MB} MB {t.upToEach}
                  </p>
                </div>
              </div>

              {/* Selected files */}
              {pendingFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {t.selectedFiles} · {pendingFiles.length}
                  </p>
                  {pendingFiles.map((file, i) => (
                    <div
                      key={`${file.name}-${i}`}
                      className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2"
                    >
                      <svg
                        className="w-4 h-4 text-green-500 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                        />
                      </svg>
                      <span className="text-sm text-slate-900 font-medium truncate">
                        {file.name}
                      </span>
                      <span className="text-xs text-slate-400 ml-auto shrink-0">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                      <button
                        onClick={() => removePendingFile(i)}
                        aria-label={t.remove}
                        title={t.remove}
                        className="text-slate-400 hover:text-red-600 transition-colors shrink-0"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.75}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Record section */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-medium">{t.orRecord}</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              {isRecording ? (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 flex-1 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                    <span className="text-red-700 text-sm font-medium">{t.recording}</span>
                    <span className="text-red-500 text-sm font-mono ml-auto">
                      {formatTime(recordingTime)}
                    </span>
                  </div>
                  <button
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium rounded-lg transition-colors text-sm shrink-0"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                    {t.stop}
                  </button>
                </div>
              ) : (
                <button
                  onClick={startRecording}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-medium rounded-lg transition-colors text-sm"
                >
                  <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zm0 2a2 2 0 00-2 2v6a2 2 0 004 0V5a2 2 0 00-2-2zm-7 9a7 7 0 0014 0h2a9 9 0 01-8 8.94V23h-2v-2.06A9 9 0 013 12H5z" />
                  </svg>
                  {t.recordButton}
                </button>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!pendingFiles.length || isRecording}
                className={[
                  "w-full py-2.5 px-4 text-white font-medium rounded-lg transition-colors text-sm",
                  pendingFiles.length && !isRecording
                    ? "bg-green-600 hover:bg-green-700 active:bg-green-800"
                    : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800",
                  "disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed",
                ].join(" ")}
              >
                {t.transcribe}
                {pendingFiles.length > 1 ? ` · ${pendingFiles.length}` : ""}
              </button>
            </>
          )}

          {/* ── Results view ───────────────────────────────────────── */}
          {hasJobs && (
            <>
              <div className="flex items-center justify-between gap-3">
                <label className="text-base font-semibold text-slate-800">
                  {t.transcriptLabel}
                  {jobs.length > 1 ? ` · ${doneCount}/${jobs.length}` : ""}
                </label>
                {doneCount > 1 && (
                  <button
                    onClick={handleCopyAll}
                    className={[
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                      copiedAll
                        ? "bg-green-100 text-green-700 border-green-200"
                        : "border-slate-300 text-slate-700 hover:bg-slate-50 active:bg-slate-100",
                    ].join(" ")}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.75}
                        d={
                          copiedAll
                            ? "M5 13l4 4L19 7"
                            : "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        }
                      />
                    </svg>
                    {copiedAll ? t.copied : t.copyAll}
                  </button>
                )}
              </div>

              {/* One card per file */}
              <div className="space-y-4">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{job.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {(job.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <span
                        className={[
                          "flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 shrink-0",
                          job.status === "done"
                            ? "bg-green-100 text-green-700"
                            : job.status === "error"
                              ? "bg-red-100 text-red-700"
                              : job.status === "queued"
                                ? "bg-slate-200 text-slate-600"
                                : "bg-blue-100 text-blue-700",
                        ].join(" ")}
                      >
                        {(job.status === "uploading" || job.status === "processing") &&
                          spinner("w-3 h-3")}
                        {job.status === "queued"
                          ? t.queued
                          : job.status === "uploading"
                            ? t.uploading
                            : job.status === "processing"
                              ? t.transcribing
                              : job.status === "done"
                                ? t.done
                                : t.failed}
                      </span>
                    </div>

                    {(job.status === "uploading" || job.status === "processing") && (
                      <p className="text-sm text-slate-500">
                        {job.status === "uploading" ? t.uploadingStatus : t.processingStatus}
                      </p>
                    )}

                    {job.status === "error" && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-red-700 text-sm font-medium">{t.errorTitle}</p>
                        <p className="text-red-600 text-sm mt-0.5">{job.error}</p>
                        <button
                          onClick={() => handleRetry(job.id)}
                          className="text-red-600 text-sm font-medium mt-2 hover:underline"
                        >
                          {t.tryAgain}
                        </button>
                      </div>
                    )}

                    {job.status === "done" && (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          {job.isImproved ? (
                            <button
                              onClick={() => handleUndo(job)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100"
                            >
                              <svg
                                className="w-3.5 h-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.75}
                                  d="M3 10h10a5 5 0 010 10H9M3 10l4-4M3 10l4 4"
                                />
                              </svg>
                              {t.undo}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleImprove(job)}
                              disabled={job.isImproving || job.improveCooldown}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-purple-300 bg-white text-purple-700 hover:bg-purple-50 active:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {job.isImproving ? (
                                spinner("w-3.5 h-3.5")
                              ) : (
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.75}
                                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                                  />
                                </svg>
                              )}
                              {job.isImproving ? t.improving : t.improve}
                            </button>
                          )}
                          <button
                            onClick={() => handleCopy(job)}
                            className={[
                              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                              job.copied
                                ? "bg-green-100 text-green-700 border border-green-200"
                                : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white",
                            ].join(" ")}
                          >
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={job.copied ? 2.5 : 1.75}
                                d={
                                  job.copied
                                    ? "M5 13l4 4L19 7"
                                    : "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                }
                              />
                            </svg>
                            {job.copied ? t.copied : t.copy}
                          </button>
                        </div>
                        <textarea
                          readOnly
                          value={job.transcript}
                          rows={jobs.length > 1 ? 8 : 12}
                          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm resize-y focus:outline-none leading-relaxed"
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>

              {globalError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-700 text-sm font-medium">{t.errorTitle}</p>
                  <p className="text-red-600 text-sm mt-0.5">{globalError}</p>
                </div>
              )}

              {/* New audio — click to browse or drop straight onto the button */}
              <div className="pt-2 border-t border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-500 shrink-0">
                    {t.languageLabel}
                  </label>
                  {(() => {
                    const { autoDetect, featured, others } = buildLanguageOptions(locale, t);
                    return (
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value={autoDetect.value}>{autoDetect.label}</option>
                        {featured.map((lang) => (
                          <option key={lang.value} value={lang.value}>
                            {lang.label}
                          </option>
                        ))}
                        <option disabled>────────────────</option>
                        {others.map((lang) => (
                          <option key={lang.value} value={lang.value}>
                            {lang.label}
                          </option>
                        ))}
                      </select>
                    );
                  })()}
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingMore(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDraggingMore(false);
                  }}
                  onDrop={handleDropMore}
                  onClick={() => moreInputRef.current?.click()}
                  className={[
                    "w-full py-3 px-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-sm font-medium",
                    isDraggingMore
                      ? "border-blue-400 bg-blue-50 text-blue-700"
                      : "border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100",
                  ].join(" ")}
                >
                  <input
                    ref={moreInputRef}
                    type="file"
                    accept="audio/*,video/*"
                    multiple
                    onChange={handleMoreChange}
                    className="hidden"
                  />
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.75}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    {t.newFile}
                  </span>
                  <span className="text-xs font-normal text-slate-400">{t.orDropFiles}</span>
                </div>

                <button
                  onClick={reset}
                  disabled={activeCount > 0}
                  className="w-full text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t.clearAll}
                </button>
              </div>
            </>
          )}

          {/* Intake-view error (mic, etc.) */}
          {!hasJobs && globalError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 text-sm font-medium">{t.errorTitle}</p>
              <p className="text-red-600 text-sm mt-0.5">{globalError}</p>
              <button
                onClick={() => setGlobalError("")}
                className="text-red-600 text-sm font-medium mt-3 hover:underline"
              >
                {t.tryAgain}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
