import type { Translations } from "@/lib/i18n";

// Recordings waiting for the Transcribe button
export function PendingFiles({
  files,
  t,
  onRemove,
}: {
  files: File[];
  t: Translations;
  onRemove: (index: number) => void;
}) {
  if (!files.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
        {t.selectedFiles} · {files.length}
      </p>
      {files.map((file, i) => (
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
          <span className="text-sm text-slate-900 font-medium truncate">{file.name}</span>
          <span className="text-xs text-slate-400 ml-auto shrink-0">
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={t.remove}
            title={t.remove}
            className="text-slate-400 hover:text-red-600 transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
  );
}
