"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteGradeButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete the empty grade “${name}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/grades/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not delete that grade.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={remove}>
        {busy ? "Deleting…" : "Delete grade"}
      </button>
      {error && (
        <div className="hint" role="alert" style={{ color: "var(--status-danger-text)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
