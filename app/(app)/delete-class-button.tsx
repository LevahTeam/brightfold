"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteClassButton({
  id,
  label,
  kids,
  entries,
}: {
  id: number;
  label: string;
  kids: number;
  entries: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const detail = `${kids} student${kids === 1 ? "" : "s"} and ${entries} attendance record${entries === 1 ? "" : "s"}`;
    if (
      !window.confirm(
        `Delete class “${label}”?\n\nThis permanently deletes ${detail}. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not delete that class.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server, so the class was not deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "inline-block" }}>
      <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={remove}>
        {busy ? "Deleting…" : "Delete class"}
      </button>
      {error && (
        <div className="hint" role="alert" style={{ color: "var(--status-danger-text)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
