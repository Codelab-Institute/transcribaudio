"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ErrorPanel";
import { useLocale } from "@/lib/i18n";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { t } = useLocale();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorPanel
      title={t.errorTitle}
      message={error.digest ? `Ref: ${error.digest}` : undefined}
      action={{ label: t.tryAgain, onClick: retry }}
      home={{ label: "TranscribAudio", href: "/" }}
    />
  );
}
