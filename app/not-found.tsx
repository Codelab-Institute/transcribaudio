import { ErrorPanel } from "@/components/ErrorPanel";

// Server component, so no locale hook — show both languages
export default function NotFound() {
  return (
    <ErrorPanel
      title="Page not found · Página no encontrada"
      home={{ label: "TranscribAudio", href: "/" }}
    />
  );
}
