import { formatTime } from "@/lib/format";
import type { Translations } from "@/lib/i18n";

type Props = {
  t: Translations;
  isRecording: boolean;
  seconds: number;
  onStart: () => void;
  onStop: () => void;
};

export function Recorder({ t, isRecording, seconds, onStart, onStop }: Props) {
  if (isRecording) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-red-700 text-sm font-medium">{t.recording}</span>
          <span className="text-red-500 text-sm font-mono ml-auto">{formatTime(seconds)}</span>
        </div>
        <button
          type="button"
          onClick={onStop}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-medium rounded-lg transition-colors text-sm shrink-0"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
          {t.stop}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onStart}
      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-medium rounded-lg transition-colors text-sm"
    >
      <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zm0 2a2 2 0 00-2 2v6a2 2 0 004 0V5a2 2 0 00-2-2zm-7 9a7 7 0 0014 0h2a9 9 0 01-8 8.94V23h-2v-2.06A9 9 0 013 12H5z" />
      </svg>
      {t.recordButton}
    </button>
  );
}
