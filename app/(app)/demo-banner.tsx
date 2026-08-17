"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Shown on every page of the demo. Two jobs: make clear at a glance that none
 * of this is real, and let a visitor start over after they have made a mess.
 */
export default function DemoBanner() {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);

  async function reset() {
    setResetting(true);
    try {
      await fetch("/api/demo/reset", { method: "POST" });
      router.refresh();
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="demo-banner no-print" role="status">
      <span>
        <strong>Demo.</strong> Every name here is invented, and this copy is
        yours alone — edit anything you like.
      </span>
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={reset}
        disabled={resetting}
      >
        {resetting ? "Resetting…" : "Start over"}
      </button>
    </div>
  );
}
