import { z } from "zod";
import {
  LANGUAGE_CODES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  STORAGE_PATH_PATTERN,
} from "@/lib/audio";

// Request bodies for every API route. Shared by client and server.

export const uploadUrlRequest = z.object({
  filename: z.string().min(1).max(255),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_FILE_SIZE_BYTES, `File is larger than ${MAX_FILE_SIZE_MB} MB`),
});

export const transcribeRequest = z.object({
  // A path minted by /api/upload-url, not a URL: the server builds the public
  // URL itself so AssemblyAI only ever fetches from our bucket.
  path: z.string().regex(STORAGE_PATH_PATTERN, "Invalid storage path"),
  languageCode: z.enum(LANGUAGE_CODES),
});

export const transcriptionId = z.string().regex(/^[\w-]{1,64}$/, "Invalid transcript id");

// ~100k chars covers well over an hour of speech while bounding Groq spend
export const textRequest = z.object({
  text: z.string().trim().min(1, "Missing text").max(100_000, "Text is too long"),
});

export const recordRequest = z.object({
  familyName: z.string().trim().min(1, "familyName is required").max(200),
  reflection: z.string().trim().min(1, "reflection is required").max(10_000),
  contact: z.string().trim().max(200).optional(),
});
