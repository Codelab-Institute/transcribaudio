"use client";

import { useCallback, useState } from "react";
import { AddFilesButton } from "@/components/AddFilesButton";
import { DropZone } from "@/components/DropZone";
import { JobCard } from "@/components/JobCard";
import { LanguageSelect } from "@/components/LanguageSelect";
import { PendingFiles } from "@/components/PendingFiles";
import { Recorder } from "@/components/Recorder";
import { useRecorder } from "@/lib/hooks/useRecorder";
import { useTranscription } from "@/lib/hooks/useTranscription";
import { useLocale, type Locale } from "@/lib/i18n";

export default function Home() {
  const { locale, setLocale, t } = useLocale();
  const [language, setLanguage] = useState("auto");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [globalError, setGlobalError] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);

  const transcription = useTranscription(t, setGlobalError);
  const { jobs, doneCount, activeCount } = transcription;

  const addRecording = useCallback((file: File) => setPendingFiles((prev) => [...prev, file]), []);
  const recorder = useRecorder(addRecording, setGlobalError);

  const startFiles = (files: File[]) => {
    if (!files.length) return;
    setGlobalError("");
    transcription.start(files, language);
  };

  // Recordings wait in pendingFiles for the Transcribe button
  const handleSubmit = () => {
    startFiles(pendingFiles);
    setPendingFiles([]);
  };

  // Dropped/browsed files start transcribing right away. Any recording
  // already waiting comes along, since the intake view is about to disappear.
  const startUploads = (files: File[]) => {
    if (!files.length) return;
    startFiles([...pendingFiles, ...files]);
    setPendingFiles([]);
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

  const reset = () => {
    transcription.reset();
    recorder.cancel();
    setPendingFiles([]);
    setGlobalError("");
    setCopiedAll(false);
  };

  const hasJobs = jobs.length > 0;

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
              <div>
                <label
                  htmlFor="language"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {t.languageLabel}
                </label>
                <LanguageSelect
                  id="language"
                  value={language}
                  onChange={setLanguage}
                  locale={locale}
                  t={t}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <DropZone t={t} disabled={recorder.isRecording} onFiles={startUploads} />

              <PendingFiles
                files={pendingFiles}
                t={t}
                onRemove={(index) => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
              />

              {/* Record section */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-medium">{t.orRecord}</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <Recorder
                t={t}
                isRecording={recorder.isRecording}
                seconds={recorder.recordingTime}
                onStart={recorder.start}
                onStop={recorder.stop}
              />

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!pendingFiles.length || recorder.isRecording}
                className={[
                  "w-full py-2.5 px-4 text-white font-medium rounded-lg transition-colors text-sm",
                  pendingFiles.length && !recorder.isRecording
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
                <h2 className="text-base font-semibold text-slate-800">
                  {t.transcriptLabel}
                  {jobs.length > 1 ? ` · ${doneCount}/${jobs.length}` : ""}
                </h2>
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
                  <JobCard
                    key={job.id}
                    job={job}
                    t={t}
                    compact={jobs.length > 1}
                    onRetry={() => transcription.retry(job.id, language)}
                    onImprove={() => transcription.improve(job)}
                    onUndo={() => transcription.undo(job)}
                    onCopy={() => transcription.copy(job)}
                  />
                ))}
              </div>

              {globalError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-700 text-sm font-medium">{t.errorTitle}</p>
                  <p className="text-red-600 text-sm mt-0.5">{globalError}</p>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="language-more"
                    className="text-xs font-medium text-slate-500 shrink-0"
                  >
                    {t.languageLabel}
                  </label>
                  <LanguageSelect
                    id="language-more"
                    value={language}
                    onChange={setLanguage}
                    locale={locale}
                    t={t}
                    className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <AddFilesButton t={t} onFiles={startFiles} />

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
