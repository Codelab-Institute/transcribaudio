"use client";

import { useRef, useState } from "react";
import type { Translations } from "@/lib/i18n";

// Results-view "New audio" control: click to browse or drop straight onto it.
export function AddFilesButton({
  t,
  onFiles,
}: {
  t: Translations;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <>
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
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
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
          onFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => inputRef.current?.click()}
        className={[
          "w-full py-3 px-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          isDragging
            ? "border-blue-400 bg-blue-50 text-blue-700"
            : "border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100",
        ].join(" ")}
      >
        <span className="flex items-center gap-2">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
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
      </button>
    </>
  );
}
