"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RecordsKidRow, Week } from "@/lib/types";

type CellKey = `${number}:${number}`;

/**
 * Make the visible field match the value that will be saved. This remains a
 * text input to get a numeric phone keyboard without spinner controls, so
 * invalid characters must be removed immediately instead of displaying
 * "abc999" and later storing 999 without warning.
 */
function sanitisePages(e: React.FormEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  const clean = el.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 3);
  if (clean !== el.value) el.value = clean;
}

interface LocalCell {
  here: boolean;
  pages: number;
}

/**
 * Edit historical entries in place. Cells save independently, limiting a
 * failed request to one edit, while optimistic totals keep the displayed sum
 * current during the request.
 */
export default function RecordsGrid({
  weeks,
  rows,
  showClassHeaders,
  canDelete,
}: {
  weeks: Week[];
  rows: RecordsKidRow[];
  showClassHeaders: boolean;
  /** Deleting a week wipes a column from every class, so it is admin only. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<CellKey, LocalCell>>({});
  const [saving, setSaving] = useState<Set<CellKey>>(new Set());
  const [failed, setFailed] = useState<Set<CellKey>>(new Set());
  // Increment after a rollback. QT fields are uncontrolled to avoid rendering
  // the full grid on each keystroke, so restoring state alone cannot clear a
  // rejected value; remounting the field can.
  const [resetTick, setResetTick] = useState<Record<CellKey, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "week">("grid");
  const [weekIdx, setWeekIdx] = useState(Math.max(0, weeks.length - 1));

  // Stop responsive layout changes after the user chooses a view explicitly.
  const chosenByUser = useRef(false);

  /**
   * Open the single-week view on narrow screens because the full 17-week grid
   * is not usable there. Track viewport changes after mount as well; phone
   * rotation and desktop resizing can otherwise strand the wide grid inside a
   * 375 px viewport dominated by its two pinned columns.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");

    const apply = (narrow: boolean) => {
      if (chosenByUser.current) return;
      setView(narrow ? "week" : "grid");
    };

    apply(mq.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function chooseView(next: "grid" | "week") {
    chosenByUser.current = true;
    setView(next);
  }

  function cellOf(row: RecordsKidRow, weekId: number): LocalCell {
    const key: CellKey = `${row.kid_id}:${weekId}`;
    if (edits[key]) return edits[key];
    const stored = row.cells[weekId];
    return { here: stored?.attendance === "HERE", pages: stored?.qt_pages ?? 0 };
  }

  function totalOf(row: RecordsKidRow): number {
    return weeks.reduce((sum, w) => sum + cellOf(row, w.id).pages, 0);
  }

  /**
   * Restore the cell's pre-request value after a failed save. Keeping the
   * optimistic edit would make the Total disagree with both the database and
   * the number printed on the child's card.
   */
  function rollback(key: CellKey, previous: LocalCell | undefined) {
    setEdits((p) => {
      const copy = { ...p };
      if (previous) copy[key] = previous;
      else delete copy[key];
      return copy;
    });
    setResetTick((p) => ({ ...p, [key]: (p[key] ?? 0) + 1 }));
  }

  async function save(kidId: number, weekId: number, next: LocalCell) {
    const key: CellKey = `${kidId}:${weekId}`;
    const previous = edits[key];

    setEdits((p) => ({ ...p, [key]: next }));
    setSaving((p) => new Set(p).add(key));
    setFailed((p) => {
      const s = new Set(p);
      s.delete(key);
      return s;
    });
    setError(null);

    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kid_id: kidId,
          week_id: weekId,
          attendance: next.here ? "HERE" : "ABSENT",
          qt_pages: next.pages,
        }),
      });

      if (res.status === 401) {
        // A session can expire while this screen is open. Redirect immediately
        // instead of leaving the user to make edits that cannot be saved.
        router.replace("/login?next=/records");
        return;
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        rollback(key, previous);
        setFailed((p) => new Set(p).add(key));
        setError(
          `${data.error ?? "That change did not save."} The cell has been put back to its saved value.`,
        );
      }
    } catch {
      rollback(key, previous);
      setFailed((p) => new Set(p).add(key));
      setError(
        "Could not reach the server, so that change was not saved. The cell has been put back to its saved value.",
      );
    } finally {
      setSaving((p) => {
        const s = new Set(p);
        s.delete(key);
        return s;
      });
    }
  }

  /**
   * Rename a child without leaving the records grid.
   *
   * Since scans match on English names, leaving a mistake such as "Jsohua Ha"
   * causes a later scan to add a duplicate rather than update the same child.
   */
  async function renameKid(
    kidId: number,
    field: "english_name" | "korean_name",
    value: string,
  ) {
    setError(null);
    try {
      const res = await fetch(`/api/kids/${kidId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.status === 401) {
        router.replace("/login?next=/records");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "That name did not save.");
        router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server, so that name was not saved.");
      router.refresh();
    }
  }

  async function removeWeek(weekId: number, label: string) {
    const ok = window.confirm(
      `Delete the ${label} column?\n\nThis removes it from every class in this grade, ` +
        `along with everything recorded in it. This cannot be undone.`,
    );
    if (!ok) return;

    setError(null);
    try {
      const res = await fetch(`/api/weeks/${weekId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "That week could not be deleted.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server, so that week was not deleted.");
    }
  }

  let lastClassId: number | null = null;

  const activeWeek = weeks[Math.min(weekIdx, weeks.length - 1)];

  return (
    <>
      {error && (
        <div className="alert alert--error" role="alert" style={{ marginBottom: "var(--space-3)" }}>
          {error}
        </div>
      )}

      <div className="row" style={{ marginBottom: "var(--space-3)" }}>
        <div className="view-switch" role="group" aria-label="Table layout">
          <button type="button" aria-pressed={view === "grid"} onClick={() => chooseView("grid")}>
            All weeks
          </button>
          <button type="button" aria-pressed={view === "week"} onClick={() => chooseView("week")}>
            One week
          </button>
        </div>
      </div>

      {view === "week" && activeWeek ? (
        <div>
          <div className="week-nav">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={weekIdx <= 0}
              onClick={() => setWeekIdx((i) => Math.max(0, i - 1))}
            >
              ‹ Earlier
            </button>
            <strong>{activeWeek.label}</strong>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              disabled={weekIdx >= weeks.length - 1}
              onClick={() => setWeekIdx((i) => Math.min(weeks.length - 1, i + 1))}
            >
              Later ›
            </button>
          </div>

          <div className="week-rows">
            {rows.map((row) => {
              const key: CellKey = `${row.kid_id}:${activeWeek.id}`;
              const cell = cellOf(row, activeWeek.id);
              const isSaving = saving.has(key);
              return (
                <div className="week-row" key={row.kid_id}>
                  <div className="names">
                    <div className="en">{row.english_name}</div>
                    {row.korean_name && <div className="kr">{row.korean_name}</div>}
                  </div>
                  <button
                    type="button"
                    className="att-toggle"
                    data-here={cell.here ? "true" : "false"}
                    aria-pressed={cell.here}
                    disabled={isSaving}
                    aria-label={`${row.english_name}, ${activeWeek.label}: ${
                      cell.here ? "here" : "absent"
                    }`}
                    onClick={() =>
                      void save(row.kid_id, activeWeek.id, { ...cell, here: !cell.here })
                    }
                  >
                    {cell.here ? "\u2713" : "\u2013"}
                  </button>
                  <input
                    key={`${key}-${resetTick[key] ?? 0}`}
                    className="qt-input"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    disabled={isSaving}
                    onInput={sanitisePages}
                    defaultValue={cell.pages ? String(cell.pages) : ""}
                    placeholder="\u2013"
                    aria-label={`${row.english_name}, ${activeWeek.label}: QT pages`}
                    onBlur={(e) => {
                      const raw = e.target.value.replace(/\D/g, "").slice(0, 3);
                      const pages = raw ? Number(raw) : 0;
                      if (pages === cell.pages) return;
                      void save(row.kid_id, activeWeek.id, {
                        here: pages > 0 ? true : cell.here,
                        pages,
                      });
                    }}
                  />
                  {showClassHeaders && <div className="class-tag">{row.class_label}</div>}
                </div>
              );
            })}
          </div>

          <p className="hint" style={{ marginTop: "var(--space-3)" }}>
            Showing {activeWeek.label} only. Switch to All weeks for the full grid and running
            totals.
          </p>
        </div>
      ) : (
      <>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="col-name" rowSpan={2}>
                English name
              </th>
              <th className="col-korean" rowSpan={2}>
                Korean name
              </th>
              {weeks.map((w) => (
                <th key={w.id} colSpan={2} className="week-group">
                  <span className="week-head">
                    {w.label}
                    {canDelete && (
                      <button
                        type="button"
                        className="week-del"
                        title={`Delete the ${w.label} column`}
                        aria-label={`Delete the ${w.label} column`}
                        onClick={() => void removeWeek(w.id, w.label)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                </th>
              ))}
              <th className="col-total" rowSpan={2}>
                Total
              </th>
            </tr>
            <tr>
              {weeks.map((w) => (
                <Fragment key={w.id}>
                  <th className="col-att week-group" title="Attendance">
                    A
                  </th>
                  <th className="col-qt" title="QT pages">
                    Q
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const showHeader = showClassHeaders && row.class_id !== lastClassId;
              lastClassId = row.class_id;

              return (
                <Fragment key={row.kid_id}>
                  {showHeader && (
                    <tr className="class-header-row">
                      <td colSpan={weeks.length * 2 + 3}>{row.class_label}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="col-name">
                      <input
                        className="name-input"
                        defaultValue={row.english_name}
                        title={row.english_name}
                        aria-label={`English name for ${row.english_name}`}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (!v) {
                            e.target.value = row.english_name;
                            return;
                          }
                          if (v !== row.english_name) void renameKid(row.kid_id, "english_name", v);
                        }}
                      />
                    </td>
                    <td className="col-korean">
                      <input
                        className="name-input korean"
                        defaultValue={row.korean_name ?? ""}
                        placeholder="—"
                        title={row.korean_name ?? undefined}
                        aria-label={`Korean name for ${row.english_name}`}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (row.korean_name ?? "")) {
                            void renameKid(row.kid_id, "korean_name", v);
                          }
                        }}
                      />
                    </td>

                    {weeks.map((w) => {
                      const key: CellKey = `${row.kid_id}:${w.id}`;
                      const cell = cellOf(row, w.id);
                      const isSaving = saving.has(key);
                      const isFailed = failed.has(key);
                      const edited = key in edits;

                      const cls = [
                        edited && !isFailed ? "cell-edited" : "",
                        isFailed ? "cell-uncertain" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");

                      return (
                        <Fragment key={w.id}>
                          <td className={`col-att week-group ${cls}`}>
                            <button
                              type="button"
                              className="att-toggle"
                              data-here={cell.here ? "true" : "false"}
                              aria-pressed={cell.here}
                              disabled={isSaving}
                              aria-label={`${row.english_name}, ${w.label}: ${
                                cell.here ? "here" : "absent"
                              }`}
                              onClick={() =>
                                void save(row.kid_id, w.id, { ...cell, here: !cell.here })
                              }
                            >
                              {cell.here ? "✓" : "–"}
                            </button>
                          </td>
                          <td className={`col-qt ${cls}`}>
                            <input
                              key={`${key}-${resetTick[key] ?? 0}`}
                              className="qt-input"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={3}
                              disabled={isSaving}
                              onInput={sanitisePages}
                              defaultValue={cell.pages ? String(cell.pages) : ""}
                              placeholder="–"
                              aria-label={`${row.english_name}, ${w.label}: QT pages`}
                              onBlur={(e) => {
                                const raw = e.target.value.replace(/\D/g, "").slice(0, 3);
                                const pages = raw ? Number(raw) : 0;
                                if (pages === cell.pages) return;
                                void save(row.kid_id, w.id, {
                                  here: pages > 0 ? true : cell.here,
                                  pages,
                                });
                              }}
                            />
                          </td>
                        </Fragment>
                      );
                    })}

                    <td className="col-total">{totalOf(row)}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="hint" style={{ marginTop: "var(--space-3)" }}>
        Tap the A button to switch between here and absent. Type a number under Q for QT pages —
        it saves when you move to the next cell. Entering pages marks the kid present.
      </p>
      </>
      )}
    </>
  );
}
