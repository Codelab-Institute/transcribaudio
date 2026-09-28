"use client";

import { useRef, useState } from "react";
import { MAX_FILE_SIZE_MB } from "@/lib/audio";
import type { Translations } from "@/lib/i18n";

type Props = {
  t: Translations;
  disabled: boolean;
  onFiles: (files: File[]) => void;
};

// Intake-view drop target. Clicking (or Enter/Space) opens the file picker.
export function DropZone({ t, disabled, onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div>
      <p id="audio-files-label" className="block text-sm font-medium text-slate-700 mb-1.5">
        {t.audioFileLabel}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,video/*"
        multiple
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
        className="hidden"
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
        aria-labelledby="audio-files-label drop-hint"
        disabled={disabled}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          // Dropping mid-recording would swap the intake view out from under it
          if (!disabled) onFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
        className={[
          "block w-full border-2 border-dashed rounded-xl p-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          isDragging
            ? "border-blue-400 bg-blue-50"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        <span className="flex items-center justify-center mb-3">
          <svg
            className="w-10 h-10 text-slate-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </span>
        <span id="drop-hint" className="block text-slate-600 font-medium text-sm">
          {t.dropPrompt}
        </span>
        <span className="block text-slate-400 text-xs mt-1">{t.dropBrowse}</span>
        <span className="block text-slate-400 text-xs mt-2">{t.dropFormats}</span>
        <span className="block text-slate-400 text-xs mt-1">
          {t.upTo} {MAX_FILE_SIZE_MB} MB {t.upToEach}
        </span>
      </button>
    </div>
  );
}
