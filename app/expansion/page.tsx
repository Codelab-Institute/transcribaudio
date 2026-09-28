"use client";

import { FormEvent, useRef, useState } from "react";
import Image from "next/image";
import { AUDIO_BUCKET, MAX_FILE_SIZE_BYTES } from "@/lib/audio";
import { browserSupabase } from "@/lib/supabase";

export default function ExpansionPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [reflection, setReflection] = useState("");
  const [contact, setContact] = useState("");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const skipProcessOnStopRef = useRef(false);
  const processingAbortRef = useRef<AbortController | null>(null);
  const processingRunIdRef = useRef(0);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const processRecordedFile = async (file: File, runId: number) => {
    setError("");
    setIsProcessingAudio(true);
    const controller = new AbortController();
    processingAbortRef.current = controller;
    try {
      if (processingRunIdRef.current !== runId) return;
      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error("La grabacion es demasiado larga.");
      }
      const urlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, size: file.size }),
        signal: controller.signal,
      });
      if (processingRunIdRef.current !== runId) return;
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error ?? "No se pudo obtener URL de carga.");

      const { token, path } = urlData as { token: string; path: string };
      const { error: uploadError } = await browserSupabase()
        .storage.from(AUDIO_BUCKET)
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, languageCode: "auto" }),
        signal: controller.signal,
      });
      if (processingRunIdRef.current !== runId) return;
      const transcribeData = await transcribeRes.json();
      if (!transcribeRes.ok) {
        throw new Error(transcribeData.error ?? "No se pudo iniciar la transcripcion.");
      }

      const transcriptId = transcribeData.transcriptId as string;
      let transcriptText = "";

      for (let i = 0; i < 80; i++) {
        if (processingRunIdRef.current !== runId) return;
        const statusRes = await fetch(`/api/transcription/${transcriptId}`, {
          signal: controller.signal,
        });
        const statusData = await statusRes.json();
        if (statusData.status === "completed") {
          transcriptText = String(statusData.text ?? "").trim();
          break;
        }
        if (statusData.status === "error") {
          throw new Error(statusData.error ?? "Fallo la transcripcion.");
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      if (!transcriptText) {
        throw new Error("No se recibio texto de la transcripcion.");
      }

      const extractRes = await fetch("/api/expansion/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcriptText }),
        signal: controller.signal,
      });
      if (processingRunIdRef.current !== runId) return;
      const extractData = await extractRes.json();
      if (!extractRes.ok) {
        throw new Error(extractData.error ?? "No se pudo procesar el texto.");
      }

      if (processingRunIdRef.current !== runId) return;
      setFamilyName(String(extractData.familyName ?? ""));
      setReflection(String(extractData.reflection ?? ""));
      setContact(String(extractData.contact ?? ""));
      setOverlayOpen(false);
    } catch (recordError) {
      if (controller.signal.aborted || processingRunIdRef.current !== runId) {
        return;
      }
      setError(
        recordError instanceof Error
          ? recordError.message
          : "Ocurrio un error al procesar el audio.",
      );
    } finally {
      if (processingAbortRef.current === controller) {
        processingAbortRef.current = null;
      }
      if (processingRunIdRef.current === runId) {
        setIsProcessingAudio(false);
      }
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const recorded = new File([blob], `expansion-${Date.now()}.${ext}`, { type: mimeType });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (skipProcessOnStopRef.current) {
          skipProcessOnStopRef.current = false;
          return;
        }
        const runId = ++processingRunIdRef.current;
        await processRecordedFile(recorded, runId);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch {
      setError("No se pudo acceder al microfono.");
      setOverlayOpen(false);
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const cancelAudioFlow = () => {
    skipProcessOnStopRef.current = true;
    processingRunIdRef.current += 1;
    processingAbortRef.current?.abort();
    processingAbortRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setIsProcessingAudio(false);
    setRecordingTime(0);
    setOverlayOpen(false);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    const payload = {
      familyName: familyName.trim(),
      reflection: reflection.trim(),
      contact: contact.trim(),
    };

    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar el formulario.");

      setSubmitted(true);
      setFamilyName("");
      setReflection("");
      setContact("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ocurrio un error al enviar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordAudio = async () => {
    if (isRecording || isProcessingAudio) return;
    setOverlayOpen(true);
    await startRecording();
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="relative mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="relative -mx-8 -mt-8 mb-6 h-44 w-[calc(100%+4rem)] overflow-hidden rounded-t-2xl sm:h-52">
          <Image
            src="/header.png"
            alt="Decoracion de encabezado"
            fill
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-slate-900/35" />
          <h1 className="absolute inset-x-0 bottom-5 text-center text-4xl font-bold tracking-tight text-white drop-shadow-sm sm:text-5xl">
            Reflexiones
          </h1>
        </div>

        {!submitted ? (
          <button
            type="button"
            onClick={handleRecordAudio}
            disabled={isRecording || isProcessingAudio || isSubmitting}
            className="mx-auto mt-5 flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="inline-flex h-3 w-3 rounded-full bg-red-500" aria-hidden="true" />
            Grabar audio
          </button>
        ) : null}

        {submitted ? (
          <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
            Gracias por enviar tu informacion.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div>
              <label htmlFor="familyName" className="mb-2 block text-sm font-medium text-slate-800">
                Nombre de tu familia o nucleo:
              </label>
              <input
                id="familyName"
                name="familyName"
                type="text"
                required
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="Escribe tu respuesta"
              />
            </div>

            <div>
              <label htmlFor="reflection" className="mb-2 block text-sm font-medium text-slate-800">
                Reflexion sobre tu esfuerzo:
              </label>
              <textarea
                id="reflection"
                name="reflection"
                required
                rows={5}
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="Comparte tu reflexion"
              />
            </div>

            <div>
              <p className="mb-2 block text-sm font-medium text-slate-800">
                Tu metodo de contacto (opcional):
              </p>
              <input
                id="contact"
                name="contact"
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="Telefono o correo electronico"
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mx-auto flex items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 active:bg-blue-800"
            >
              {isSubmitting ? "Enviando..." : "Enviar"}
            </button>
          </form>
        )}

        {overlayOpen ? (
          <div className="absolute inset-0 z-50 flex flex-col justify-between rounded-2xl bg-slate-950/85 p-6 text-white backdrop-blur-[2px] sm:p-8">
            <div>
              <p className="text-3xl font-semibold leading-tight text-white sm:text-5xl">
                Por favor, comparte el nombre de tu familia o nucleo, una reflexion sobre tu
                esfuerzo en una fecha especifica y un metodo de contacto.
              </p>
              <p className="mt-5 text-xl font-semibold text-slate-100 sm:text-3xl">
                {isProcessingAudio
                  ? "Procesando audio, transcribiendo y completando el formulario..."
                  : isRecording
                    ? `Grabando... ${formatTime(recordingTime)}`
                    : "Preparando grabacion..."}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={stopRecording}
                disabled={!isRecording || isProcessingAudio}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-500"
              >
                Terminar
              </button>
              <button
                type="button"
                onClick={cancelAudioFlow}
                className="rounded-lg border border-white/40 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
