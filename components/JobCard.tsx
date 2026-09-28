import { Spinner } from "@/components/Spinner";
import type { Translations } from "@/lib/i18n";
import type { Job } from "@/types/job";

type Props = {
  job: Job;
  t: Translations;
  // Shorter transcript box when several cards are stacked
  compact: boolean;
  onRetry: () => void;
  onImprove: () => void;
  onUndo: () => void;
  onCopy: () => void;
};

export function JobCard({ job, t, compact, onRetry, onImprove, onUndo, onCopy }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{job.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">{(job.size / 1024 / 1024).toFixed(2)} MB</p>
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
          {(job.status === "uploading" || job.status === "processing") && (
            <Spinner className="w-3 h-3" />
          )}
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
          {job.retryable && (
            <button
              onClick={onRetry}
              className="text-red-600 text-sm font-medium mt-2 hover:underline"
            >
              {t.tryAgain}
            </button>
          )}
        </div>
      )}

      {job.status === "done" && (
        <>
          <div className="flex items-center justify-between gap-3">
            {job.isImproved ? (
              <button
                onClick={onUndo}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                onClick={onImprove}
                disabled={job.isImproving || job.improveCooldown}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-purple-300 bg-white text-purple-700 hover:bg-purple-50 active:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {job.isImproving ? (
                  <Spinner className="w-3.5 h-3.5" />
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
              onClick={onCopy}
              className={[
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                job.copied
                  ? "bg-green-100 text-green-700 border border-green-200"
                  : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white",
              ].join(" ")}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            rows={compact ? 8 : 12}
            aria-label={`${t.transcriptLabel}: ${job.name}`}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm resize-y focus:outline-none leading-relaxed"
          />
        </>
      )}
    </div>
  );
}
