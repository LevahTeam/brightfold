"use client";

import { useState } from "react";
import type { Week } from "@/lib/types";

export default function ClassDataActions({
  classId,
  classLabel,
  weeks,
}: {
  classId: number;
  classLabel: string;
  weeks: Week[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekId, setWeekId] = useState(weeks.at(-1)?.id.toString() ?? "");

  async function clearWeek() {
    const week = weeks.find((item) => item.id.toString() === weekId);
    if (!week) return;
    if (
      !window.confirm(
        `Clear “${week.label}” from “${classLabel}”?\n\nThe roster, other dates, and every other class will stay. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/weeks/${week.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not clear that date.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not reach the server, so no data was removed.");
    } finally {
      setBusy(false);
    }
  }

  async function clearEntries() {
    if (
      !window.confirm(
        `Clear ALL attendance and QT history for “${classLabel}”?\n\nEvery saved date for this class will be erased. The student list will stay. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/classes/${classId}/entries`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not clear that class's data.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not reach the server, so no data was removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row">
      {weeks.length > 0 && (
        <>
          <div className="field">
            <label htmlFor="clear-week">Wrong upload date</label>
            <select
              id="clear-week"
              className="select"
              value={weekId}
              disabled={busy}
              onChange={(event) => setWeekId(event.target.value)}
            >
              {weeks.map((week) => (
                <option key={week.id} value={week.id}>
                  {week.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={clearWeek}>
            Clear selected date
          </button>
        </>
      )}
      <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={clearEntries}>
        {busy ? "Clearing…" : "Clear all class history"}
      </button>
      {error && (
        <div className="hint" role="alert" style={{ color: "var(--status-danger-text)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
