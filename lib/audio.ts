// Shared by client and server, so this file must stay free of "use client"
// and of anything that reads server-only env vars.

export const AUDIO_BUCKET = "audio-files";

export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Transcription language values pinned to the top of the dropdown
export const FEATURED_LANGS = ["en", "es"] as const;

// All other transcription language values in order
export const OTHER_LANGS = [
  "en_us",
  "en_uk",
  "en_au",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "hi",
  "ja",
  "zh",
  "ko",
  "pl",
  "ru",
  "tr",
  "uk",
  "vi",
  "fi",
] as const;

export const LANGUAGE_CODES = ["auto", ...FEATURED_LANGS, ...OTHER_LANGS] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

// Object paths minted by /api/upload-url: "<timestamp>-<random>.<ext>"
export const STORAGE_PATH_PATTERN = /^\d+-[a-z0-9]+\.[a-z0-9]{1,10}$/;

export function storageExtension(filename: string) {
  const ext = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "";
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "bin";
}
