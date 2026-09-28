"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ErrorPanel";

export default function ExpansionError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorPanel
      title="Algo salió mal"
      message={error.digest ? `Ref: ${error.digest}` : undefined}
      action={{ label: "Intentar de nuevo", onClick: retry }}
      home={{ label: "Volver al formulario", href: "/expansion" }}
    />
  );
}
