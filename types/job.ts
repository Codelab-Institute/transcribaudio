export type JobStatus = "queued" | "uploading" | "processing" | "done" | "error";

export type Job = {
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
  // False for jobs that can never succeed (e.g. over the size limit)
  retryable: boolean;
};

export function isActive(job: Job) {
  return job.status === "queued" || job.status === "uploading" || job.status === "processing";
}
