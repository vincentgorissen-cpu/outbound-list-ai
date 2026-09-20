"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImportWizard } from "./ImportWizard";

export function ImportPageClient() {
  const [resetKey, setResetKey] = useState(0);
  const router = useRouter();

  return (
    <ImportWizard
      key={resetKey}
      onImported={() => router.refresh()}
      onReset={() => setResetKey((key) => key + 1)}
    />
  );
}
