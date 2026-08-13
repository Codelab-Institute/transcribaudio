"use client";

import { useState, useEffect, useCallback } from "react";

export type Locale = "en" | "es";

export const MAX_FILE_SIZE_MB = 50;

const STORAGE_KEY = "transcribaudio-locale";

const translations = {
  en: {
    subtitle: "Upload audio files and get transcripts",
    languageLabel: "Language",
    audioFileLabel: "Audio Files",
    dropPrompt: "Drop audio files here",
    dropBrowse: "or click to browse",
    dropFormats: "MP3, MP4, WAV, M4A, FLAC, and more",
    upTo: "Up to",
    upToEach: "each",
    orRecord: "or record audio",
    recordButton: "Record from microphone",
    recording: "Recording",
    stop: "Stop",
    uploading: "Uploading...",
    transcribing: "Transcribing...",
    transcribe: "Transcribe",
    uploadingStatus: "Uploading audio to storage...",
    processingStatus: "Processing transcription — this may take a moment for longer files...",
    errorTitle: "Something went wrong",
    tryAgain: "Try again",
    transcriptLabel: "Transcript",
    copied: "Copied!",
    copy: "Copy",
    copyAll: "Copy all",
    newFile: "New audio",
    orDropFiles: "or drop files here",
    selectedFiles: "Selected files",
    remove: "Remove",
    clearAll: "Clear all",
    queued: "Queued",
    done: "Done",
    failed: "Failed",
    improve: "Improve with AI",
    improving: "Improving...",
    undo: "Undo",
    // Transcription language names
    autoDetect: "Auto-detect",
    lang_en: "English",
    lang_en_us: "English (US)",
    lang_en_uk: "English (UK)",
    lang_en_au: "English (Australia)",
    lang_es: "Spanish",
    lang_fr: "French",
    lang_de: "German",
    lang_it: "Italian",
    lang_pt: "Portuguese",
    lang_nl: "Dutch",
    lang_hi: "Hindi",
    lang_ja: "Japanese",
    lang_zh: "Chinese",
    lang_ko: "Korean",
    lang_pl: "Polish",
    lang_ru: "Russian",
    lang_tr: "Turkish",
    lang_uk: "Ukrainian",
    lang_vi: "Vietnamese",
    lang_fi: "Finnish",
  },
  es: {
    subtitle: "Sube archivos de audio y obtén transcripciones",
    languageLabel: "Idioma",
    audioFileLabel: "Archivos de audio",
    dropPrompt: "Arrastra archivos de audio aquí",
    dropBrowse: "o haz clic para buscar",
    dropFormats: "MP3, MP4, WAV, M4A, FLAC, y más",
    upTo: "Hasta",
    upToEach: "cada uno",
    orRecord: "o graba audio",
    recordButton: "Grabar desde el micrófono",
    recording: "Grabando",
    stop: "Detener",
    uploading: "Subiendo...",
    transcribing: "Transcribiendo...",
    transcribe: "Transcribir",
    uploadingStatus: "Subiendo el audio al almacenamiento...",
    processingStatus:
      "Procesando la transcripción — esto puede tardar un momento para archivos largos...",
    errorTitle: "Algo salió mal",
    tryAgain: "Intentar de nuevo",
    transcriptLabel: "Transcripción",
    copied: "¡Copiado!",
    copy: "Copiar",
    copyAll: "Copiar todo",
    newFile: "Audio nuevo",
    orDropFiles: "o suelta archivos aquí",
    selectedFiles: "Archivos seleccionados",
    remove: "Quitar",
    clearAll: "Borrar todo",
    queued: "En cola",
    done: "Listo",
    failed: "Falló",
    improve: "Mejorar con IA",
    improving: "Mejorando...",
    undo: "Deshacer",
    // Nombres de idiomas de transcripción
    autoDetect: "Detección automática",
    lang_en: "Inglés",
    lang_en_us: "Inglés (EE. UU.)",
    lang_en_uk: "Inglés (Reino Unido)",
    lang_en_au: "Inglés (Australia)",
    lang_es: "Español",
    lang_fr: "Francés",
    lang_de: "Alemán",
    lang_it: "Italiano",
    lang_pt: "Portugués",
    lang_nl: "Neerlandés",
    lang_hi: "Hindi",
    lang_ja: "Japonés",
    lang_zh: "Chino",
    lang_ko: "Coreano",
    lang_pl: "Polaco",
    lang_ru: "Ruso",
    lang_tr: "Turco",
    lang_uk: "Ucraniano",
    lang_vi: "Vietnamita",
    lang_fi: "Finlandés",
  },
} satisfies Record<Locale, Record<string, string>>;

// Language values that are pinned to the top of the dropdown
const FEATURED_LANGS = ["en", "es"];

// All other transcription language values in order
const OTHER_LANGS = [
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
];

export function buildLanguageOptions(locale: Locale, t: Record<string, string>) {
  // Show locale's own language first, then the other featured language
  const featured = locale === "es" ? ["es", "en"] : ["en", "es"];

  return {
    autoDetect: { label: t.autoDetect, value: "auto" },
    featured: featured.map((v) => ({ label: t[`lang_${v}`], value: v })),
    others: OTHER_LANGS.map((v) => ({ label: t[`lang_${v}`], value: v })),
  };
}

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") setLocaleState(stored);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = translations[locale];

  return { locale, setLocale, t };
}

export { FEATURED_LANGS, OTHER_LANGS };
