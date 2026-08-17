"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExtractedSheet } from "@/lib/types";
import { prepareSheetPhoto } from "@/lib/client/image";

interface GradeOpt {
  id: number;
  name: string;
  classes: { id: number; label: string }[];
}

interface EditCell {
  here: boolean;
  pages: string;
  uncertain: boolean;
  touched: boolean;
}

interface EditRow {
  english: string;
  korean: string;
  cells: EditCell[];
  outsideGrid: boolean;
  uncertainName: boolean;
}

interface ColumnDraft {
  header: string;
  date: string;
  include: boolean;
  /** This class already has entries for this week label. */
  alreadyLogged: boolean;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Create manual-entry rows without requiring a scan. */
/** Format a local calendar date; UTC toISOString() can turn an 8/31 Sunday
 *  evening into 2025-09-01 while leaving the visible label as 8/31. */
function localIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function blankSheet(): { columns: ColumnDraft[]; rows: EditRow[] } {
  const today = new Date();
  const iso = localIso(today);
  return {
    columns: [
      {
        header: `${today.getMonth() + 1}/${today.getDate()}`,
        date: iso,
        include: true,
        alreadyLogged: false,
      },
    ],
    rows: [emptyRow(1)],
  };
}

function emptyRow(colCount: number): EditRow {
  return {
    english: "",
    korean: "",
    cells: Array.from({ length: colCount }, () => ({
      here: false,
      pages: "",
      uncertain: false,
      touched: false,
    })),
    outsideGrid: false,
    uncertainName: false,
  };
}

export default function LogSheetClient({
  grades,
  scanEnabled,
}: {
  grades: GradeOpt[];
  scanEnabled: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [gradeId, setGradeId] = useState<string>(grades[0]?.id.toString() ?? "");
  const [classId, setClassId] = useState<string>(
    grades[0]?.classes[0]?.id.toString() ?? "",
  );
  const [newClassLabel, setNewClassLabel] = useState("");
  const [newTeacher, setNewTeacher] = useState("");

  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);

  const [columns, setColumns] = useState<ColumnDraft[]>([]);
  const [rows, setRows] = useState<EditRow[]>([]);
  const started = columns.length > 0;

  const selectedGrade = useMemo(
    () => grades.find((g) => g.id.toString() === gradeId) ?? null,
    [grades, gradeId],
  );

  const includedIdx = useMemo(
    () => columns.map((c, i) => (c.include ? i : -1)).filter((i) => i >= 0),
    [columns],
  );

  const overwriteCount = useMemo(
    () => columns.filter((c) => c.include && c.alreadyLogged).length,
    [columns],
  );

  /**
   * Load week labels that already contain entries for this class.
   *
   * A term-long teacher sheet photographed in week 10 still shows weeks 1–9.
   * Selecting every extracted column would replace those earlier entries and
   * erase manual corrections, so previously recorded columns begin unticked.
   */
  const loadLoggedLabels = useCallback(async (): Promise<Set<string>> => {
    if (!classId) return new Set();
    try {
      const res = await fetch(`/api/classes/${classId}/logged-weeks`);
      if (!res.ok) return new Set();
      const data = (await res.json()) as { labels?: string[] };
      return new Set((data.labels ?? []).map((l) => l.trim().toLowerCase()));
    } catch {
      return new Set();
    }
  }, [classId]);

  // ------------------------------------------------------------- extraction

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);
      setNotes([]);
      // Revoke the old preview before showing another image; repeated phone
      // scans would otherwise retain every full-resolution photo in memory.
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });

      if (!scanEnabled) {
        setError(
          "Photo scanning is turned off, so this image was not sent anywhere. Add a vision provider in .env.local, or fill the table in by hand below.",
        );
        return;
      }

      setScanning(true);
      try {
        // Browser-side conversion produces a server-readable JPEG from iPhone
        // HEIC and reduces large photos to fit free-tier request limits.
        const prepared = await prepareSheetPhoto(file);

        const body = new FormData();
        body.append("photo", prepared.file);
        // Resolve sheet dates against an August ministry-year boundary: 8/31
        // uses the starting year, while 1/11 belongs to the following year.
        const now = new Date();
        const startYear = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
        body.append("start_year", String(startYear));
        body.append("start_month", "8");

        const res = await fetch("/api/extract", { method: "POST", body });
        const data = (await res.json()) as { sheet?: ExtractedSheet; error?: string };

        if (!res.ok || !data.sheet) {
          setError(
            data.error ??
              "The photo could not be read. Try a straighter, better-lit shot, or fill the table in by hand.",
          );
          return;
        }

        const sheet = data.sheet;
        const logged = await loadLoggedLabels();
        setColumns(
          sheet.columns.map((c) => {
            const already = logged.has(c.header.trim().toLowerCase());
            return {
              header: c.header,
              date: c.date ?? "",
              // Do not preselect stored weeks; a re-scan must not replace
              // corrected history without an explicit choice.
              include: !already,
              alreadyLogged: already,
            };
          }),
        );
        setRows(
          sheet.rows.map((r) => ({
            english: r.english_name,
            korean: r.korean_name ?? "",
            outsideGrid: r.outside_grid === true,
            uncertainName: r.uncertain_name === true,
            cells: r.cells.map((c) => ({
              here: c.attendance === "HERE",
              pages: c.qt_pages ? String(c.qt_pages) : "",
              uncertain: c.uncertain === true,
              touched: false,
            })),
          })),
        );
        setNotes(sheet.notes ?? []);

        if (sheet.class_label && !classId && !newClassLabel) {
          setNewClassLabel(sheet.class_label);
          setNewTeacher(sheet.teacher_name ?? "");
        }
      } catch {
        setError("Could not reach the server while scanning.");
      } finally {
        setScanning(false);
      }
    },
    [scanEnabled, classId, newClassLabel, loadLoggedLabels],
  );

  const headerKey = columns.map((c) => c.header.trim().toLowerCase()).join("|");

  /**
   * Recalculate stored-week flags as the editable inputs change.
   *
   * Initial flags come from the scan, but switching classes, editing a label,
   * or manually adding a date can make a new-looking column collide with
   * existing history.
   */
  useEffect(() => {
    let cancelled = false;
    if (!classId || columns.length === 0) return;

    void (async () => {
      const logged = await loadLoggedLabels();
      if (cancelled) return;
      setColumns((prev) =>
        prev.map((c) => {
          const already = logged.has(c.header.trim().toLowerCase());
          if (already === c.alreadyLogged) return c;
          // Untick a newly detected collision. If a collision disappears,
          // preserve the user's current selection.
          return { ...c, alreadyLogged: already, include: already ? false : c.include };
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
    // Depend on headerKey instead of `columns` to avoid fetching on cell edits.
  }, [classId, headerKey, columns.length, loadLoggedLabels]);

  function startManual() {
    const blank = blankSheet();
    setColumns(blank.columns);
    setRows(blank.rows);
    setError(null);
    setResult(null);
  }

  // ------------------------------------------------------------ grid edits

  function setCell(rowIdx: number, colIdx: number, patch: Partial<EditCell>) {
    setRows((prev) =>
      prev.map((r, ri) =>
        ri !== rowIdx
          ? r
          : {
              ...r,
              cells: r.cells.map((c, ci) =>
                ci !== colIdx ? c : { ...c, ...patch, touched: true, uncertain: false },
              ),
            },
      ),
    );
  }

  function setRowField(rowIdx: number, patch: Partial<EditRow>) {
    setRows((prev) => prev.map((r, ri) => (ri === rowIdx ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(columns.length)]);
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function addColumn() {
    const today = new Date();
    setColumns((prev) => [
      ...prev,
      {
        header: `${today.getMonth() + 1}/${today.getDate()}`,
        date: localIso(today),
        include: true,
        alreadyLogged: false,
      },
    ]);
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        cells: [...r.cells, { here: false, pages: "", uncertain: false, touched: false }],
      })),
    );
  }

  function setColumn(idx: number, patch: Partial<ColumnDraft>) {
    setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  // ------------------------------------------------------------------ save

  async function onSave() {
    setError(null);
    setResult(null);

    if (!gradeId) return setError("Pick a grade first.");
    if (!classId && !newClassLabel.trim()) {
      return setError("Pick an existing class, or type a name for a new one.");
    }
    if (includedIdx.length === 0) {
      return setError("Tick at least one date column to save.");
    }

    const namedRows = rows.filter((r) => r.english.trim());
    if (namedRows.length === 0) {
      return setError("Every row needs an English name before it can be saved.");
    }
    if (namedRows.length !== rows.length) {
      return setError(
        `${rows.length - namedRows.length} row(s) have no English name. Fill them in or remove them.`,
      );
    }

    const seen = new Set<string>();
    for (const r of namedRows) {
      const key = r.english.trim().toLowerCase();
      if (seen.has(key)) {
        return setError(`"${r.english.trim()}" appears twice. Names must be unique in a class.`);
      }
      seen.add(key);
    }

    for (const i of includedIdx) {
      if (!columns[i].header.trim()) {
        return setError("Every included column needs a label.");
      }
    }

    if (overwriteCount > 0) {
      const ok = window.confirm(
        `${overwriteCount} of the ticked dates already have data for this class.\n\n` +
          `Saving will replace what is stored for those dates, including any corrections ` +
          `made by hand. This cannot be undone.\n\nGo ahead?`,
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      // 1. Resolve the class, creating it if the user typed a new name.
      let targetClassId = classId ? Number(classId) : 0;
      if (!targetClassId) {
        const res = await fetch(`/api/grades/${gradeId}/classes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ label: newClassLabel, teacher_name: newTeacher }),
        });
        const data = (await res.json()) as { class?: { id: number }; error?: string };
        if (!res.ok || !data.class) {
          setError(data.error ?? "Could not create that class.");
          return;
        }
        targetClassId = data.class.id;
      }

      // 2. Resolve every included column to a week in this grade.
      const weekIds: number[] = [];
      for (const i of includedIdx) {
        const res = await fetch(`/api/grades/${gradeId}/weeks`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            label: columns[i].header.trim(),
            attendance_date: columns[i].date || null,
          }),
        });
        const data = (await res.json()) as { week?: { id: number }; error?: string };
        if (!res.ok || !data.week) {
          setError(data.error ?? `Could not save the column "${columns[i].header}".`);
          return;
        }
        weekIds.push(data.week.id);
      }

      // 3. Commit the reviewed grid in one transaction.
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          class_id: targetClassId,
          week_ids: weekIds,
          rows: namedRows.map((r) => ({
            english_name: r.english.trim(),
            korean_name: r.korean.trim() || null,
            cells: includedIdx.map((i) => {
              const cell = r.cells[i];
              const pages = Number.parseInt(cell?.pages || "0", 10);
              return {
                attendance: cell?.here ? "HERE" : "ABSENT",
                qt_pages: Number.isFinite(pages) && pages > 0 ? pages : 0,
              };
            }),
          })),
        }),
      });

      const data = (await res.json()) as {
        kidsCreated?: number;
        kidsMatched?: number;
        entriesWritten?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not save the sheet.");
        return;
      }

      setResult(
        `Saved. ${data.entriesWritten} entries across ${weekIds.length} week(s) — ` +
          `${data.kidsMatched} existing kids matched, ${data.kidsCreated} added.`,
      );
      router.refresh();
    } catch {
      setError("Could not reach the server while saving.");
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------------ view

  return (
    <div className="stack">
      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div className="alert alert--success" role="status">
          {result}
        </div>
      )}

      {/* ------------------------------------------------ class selection */}
      <section className="card">
        <h2 className="card-title">1. Which class is this?</h2>
        <p className="card-sub" style={{ marginBottom: "var(--space-4)" }}>
          Weeks are shared across every class in a grade, matching the master sheet.
        </p>

        {grades.length === 0 ? (
          <div className="alert alert--warning">
            No grades exist yet. Add one from the Classes page first.
          </div>
        ) : (
          <div className="row">
            <div className="field" style={{ flex: "0 1 200px" }}>
              <label htmlFor="grade">Grade</label>
              <select
                id="grade"
                className="select"
                value={gradeId}
                onChange={(e) => {
                  setGradeId(e.target.value);
                  const g = grades.find((x) => x.id.toString() === e.target.value);
                  setClassId(g?.classes[0]?.id.toString() ?? "");
                }}
              >
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field" style={{ flex: "1 1 220px" }}>
              <label htmlFor="class">Class</label>
              <select
                id="class"
                className="select"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">— Create a new class —</option>
                {selectedGrade?.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {!classId && (
              <>
                <div className="field" style={{ flex: "1 1 200px" }}>
                  <label htmlFor="newclass">New class name</label>
                  <input
                    id="newclass"
                    className="input"
                    placeholder="e.g. A 5-2 (Korean)"
                    value={newClassLabel}
                    onChange={(e) => setNewClassLabel(e.target.value)}
                  />
                </div>
                <div className="field" style={{ flex: "1 1 200px" }}>
                  <label htmlFor="newteacher">Teacher</label>
                  <input
                    id="newteacher"
                    className="input"
                    placeholder="e.g. Ms. Ji Woo Park"
                    value={newTeacher}
                    onChange={(e) => setNewTeacher(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* --------------------------------------------------------- capture */}
      <section className="card">
        <h2 className="card-title">2. Add the sheet</h2>
        <p className="card-sub" style={{ marginBottom: "var(--space-4)" }}>
          {scanEnabled
            ? "Take or choose a photo of the whole grid. One photo covers every date column on the sheet."
            : "Photo scanning is turned off, so start a blank table and type the values in."}
        </p>

        <div className="stack">
          {scanEnabled && (
            <>
              {/* No `capture` attribute on purpose: on iOS it forces the camera
                  open and suppresses the photo library, which would stop the
                  pastor uploading a sheet photographed earlier in the day.
                  Without it the OS action sheet still offers the camera. */}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="visually-hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
              <div
                className="dropzone"
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileRef.current?.click();
                  }
                }}
              >
                {scanning ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    <p style={{ marginTop: "var(--space-3)" }}>
                      Reading the sheet — this can take up to a minute.
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontWeight: "var(--weight-semibold)" }}>
                      Take a photo or choose a file
                    </p>
                    <p className="hint" style={{ marginTop: "var(--space-2)" }}>
                      Photos are shrunk in your browser before upload, so iPhone HEIC
                      shots work too.
                    </p>
                  </>
                )}
              </div>
            </>
          )}

          {preview && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="The sheet you uploaded" className="preview-img" />
          )}

          <div className="row">
            <button type="button" className="btn btn--secondary" onClick={startManual}>
              {started ? "Reset to a blank table" : "Fill it in by hand instead"}
            </button>
          </div>

          {notes.length > 0 && (
            <div className="alert alert--info">
              <div>
                <strong>Notes from the scan</strong>
                <ul style={{ margin: "var(--space-2) 0 0 var(--space-4)" }}>
                  {notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- review */}
      {started && (
        <section className="card">
          <h2 className="card-title">3. Check every value</h2>
          <p className="card-sub" style={{ marginBottom: "var(--space-4)" }}>
            Amber cells are ones the scan was unsure about. Untick a date to leave it out of
            this save. Nothing is written until you press Save.
          </p>

          <div className="stack">
            {columns.some((c) => c.alreadyLogged) && (
              <div className="alert alert--warning">
                <div>
                  <strong>
                    This class already has data for{" "}
                    {columns.filter((c) => c.alreadyLogged).length} of these dates.
                  </strong>{" "}
                  Those are unticked below, because saving them would replace what is already
                  stored — including anything corrected by hand. Tick one only if you mean to
                  overwrite it.
                </div>
              </div>
            )}

            <div>
              <span className="label">Dates to save</span>
              <div className="week-picker" style={{ marginTop: "var(--space-2)" }}>
                {columns.map((c, i) => (
                  <label
                    key={i}
                    className="week-chip"
                    data-on={c.include}
                    data-logged={c.alreadyLogged}
                    title={
                      c.alreadyLogged
                        ? "Already logged for this class — ticking this will overwrite it"
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={c.include}
                      onChange={(e) => setColumn(i, { include: e.target.checked })}
                    />
                    <input
                      className="name-input"
                      style={{ width: 64, minWidth: 0 }}
                      value={c.header}
                      aria-label={`Label for column ${i + 1}`}
                      onChange={(e) => setColumn(i, { header: e.target.value })}
                    />
                    <input
                      type="date"
                      className="name-input"
                      style={{ width: 140, minWidth: 0 }}
                      value={c.date}
                      aria-label={`Date for column ${i + 1}`}
                      onChange={(e) => setColumn(i, { date: e.target.value })}
                    />
                    {c.alreadyLogged && (
                      <span className="chip-flag" aria-label="already logged">
                        saved
                      </span>
                    )}
                  </label>
                ))}
                <button type="button" className="btn btn--ghost btn--sm" onClick={addColumn}>
                  + Date
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th className="col-name" rowSpan={2}>
                      English name
                    </th>
                    <th className="korean-cell" rowSpan={2}>
                      Korean name
                    </th>
                    {columns.map((c, i) => (
                      <th
                        key={i}
                        colSpan={2}
                        className="week-group"
                        style={{ opacity: c.include ? 1 : 0.4 }}
                      >
                        {c.header || `Col ${i + 1}`}
                        {c.date && (
                          <div className="hint" style={{ fontWeight: 400 }}>
                            {MONTHS[Number(c.date.slice(5, 7)) - 1]} {Number(c.date.slice(8, 10))}
                          </div>
                        )}
                      </th>
                    ))}
                    <th rowSpan={2} />
                  </tr>
                  <tr>
                    {columns.map((c, i) => (
                      <Fragment key={i}>
                        <th
                          className="col-att week-group"
                          style={{ opacity: c.include ? 1 : 0.4 }}
                          title="Attendance"
                        >
                          A
                        </th>
                        <th
                          className="col-qt"
                          style={{ opacity: c.include ? 1 : 0.4 }}
                          title="QT pages"
                        >
                          Q
                        </th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri}>
                      <td className="col-name">
                        <input
                          className="name-input"
                          value={r.english}
                          placeholder="English name"
                          aria-label={`English name, row ${ri + 1}`}
                          style={
                            r.uncertainName && !r.english
                              ? { background: "var(--cell-lowconf-bg)" }
                              : undefined
                          }
                          onChange={(e) => setRowField(ri, { english: e.target.value })}
                        />
                        {r.outsideGrid && (
                          <div className="hint" style={{ color: "var(--status-warning-text)" }}>
                            written outside the grid
                          </div>
                        )}
                      </td>
                      <td className="korean-cell">
                        <input
                          className="name-input korean"
                          value={r.korean}
                          placeholder="—"
                          aria-label={`Korean name, row ${ri + 1}`}
                          onChange={(e) => setRowField(ri, { korean: e.target.value })}
                        />
                      </td>

                      {columns.map((col, ci) => {
                        const cell = r.cells[ci];
                        const cls = [
                          "col-att",
                          "week-group",
                          cell?.uncertain ? "cell-uncertain" : "",
                          cell?.touched ? "cell-edited" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <Fragment key={ci}>
                            <td
                              className={cls}
                              style={{ opacity: col.include ? 1 : 0.4 }}
                            >
                              <button
                                type="button"
                                className="att-toggle"
                                data-here={cell?.here ? "true" : "false"}
                                aria-pressed={cell?.here ?? false}
                                aria-label={`${r.english || `Row ${ri + 1}`}, ${col.header}: ${
                                  cell?.here ? "here" : "absent"
                                }`}
                                onClick={() => setCell(ri, ci, { here: !cell?.here })}
                              >
                                {cell?.here ? "✓" : "–"}
                              </button>
                            </td>
                            <td
                              className={`col-qt ${cell?.uncertain ? "cell-uncertain" : ""} ${
                                cell?.touched ? "cell-edited" : ""
                              }`}
                              style={{ opacity: col.include ? 1 : 0.4 }}
                            >
                              <input
                                className="qt-input"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={cell?.pages ?? ""}
                                placeholder="–"
                                aria-label={`${r.english || `Row ${ri + 1}`}, ${
                                  col.header
                                }: QT pages`}
                                onChange={(e) => {
                                  const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                                  setCell(ri, ci, {
                                    pages: v,
                                    here: v ? true : cell?.here ?? false,
                                  });
                                }}
                              />
                            </td>
                          </Fragment>
                        );
                      })}

                      <td>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => removeRow(ri)}
                          aria-label={`Remove row ${ri + 1}`}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="row" style={{ justifyContent: "space-between" }}>
              <button type="button" className="btn btn--secondary" onClick={addRow}>
                + Add a kid
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={onSave}
                disabled={saving}
              >
                {saving && <span className="spinner" aria-hidden="true" />}
                {saving
                  ? "Saving…"
                  : `Save ${includedIdx.length} date${includedIdx.length === 1 ? "" : "s"}` +
                    (overwriteCount > 0 ? ` (${overwriteCount} will be overwritten)` : "")}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
