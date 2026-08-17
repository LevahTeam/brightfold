import Link from "next/link";
import { listGrades, listClasses, getRecords } from "@/lib/repo";
import PrintButton from "./print-button";
import { withRequestDb } from "@/lib/demo";

export const dynamic = "force-dynamic";

function shortLabel(label: string): string {
  return label.length > 28 ? `${label.slice(0, 27)}…` : label;
}

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ gradeId?: string; classId?: string }>;
}) {
  const sp = await searchParams;
  const grades = await withRequestDb(() => listGrades());

  if (grades.length === 0) {
    return (
      <main className="main">
        <div className="empty">
          <h2>No grades yet</h2>
          <p>Add a grade and log a sheet first, then come back to print cards.</p>
          <Link href="/" prefetch={false} className="btn btn--primary">
            Go to Classes
          </Link>
        </div>
      </main>
    );
  }

  const grade = grades.find((g) => g.id === Number(sp.gradeId)) ?? grades[0];
  const classes = await withRequestDb(() => listClasses(grade.id));
  const classId =
    sp.classId && sp.classId !== "all" && classes.some((c) => c.id === Number(sp.classId))
      ? Number(sp.classId)
      : undefined;

  const { weeks, rows } = await withRequestDb(() => getRecords(grade.id, classId));
  const attended = (kidRow: (typeof rows)[number]) =>
    weeks.filter((w) => kidRow.cells[w.id]?.attendance === "HERE").length;

  return (
    <main className="main main--wide">
      <div className="page-head no-print">
        <div>
          <h1>Print cards</h1>
          <p>
            One point card per kid, ready to cut and hand out. Use your browser&apos;s print
            dialog — the app chrome is removed automatically.
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="card no-print" style={{ marginBottom: "var(--space-4)" }}>
        <form method="get" className="row">
          <div className="field" style={{ flex: "0 1 200px" }}>
            <label htmlFor="gradeId">Grade</label>
            <select id="gradeId" name="gradeId" className="select" defaultValue={grade.id}>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: "1 1 240px" }}>
            <label htmlFor="classId">Class</label>
            <select id="classId" name="classId" className="select" defaultValue={classId ?? "all"}>
              <option value="all">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn--secondary">Show</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="card no-print">
          <div className="empty">
            <h2>No kids to print</h2>
            <p>Log a sheet for {grade.name} and their cards will appear here.</p>
            <Link href="/log" prefetch={false} className="btn btn--primary">
              Log a sheet
            </Link>
          </div>
        </div>
      ) : (
        <div className="card-sheet">
          {rows.map((kid) => {
            const logged = weeks.filter((w) => kid.cells[w.id]);
            return (
              <article className="point-card" key={kid.kid_id}>
                <header>
                  <div>
                    <h3>{kid.english_name}</h3>
                    {kid.korean_name && <div className="kr">{kid.korean_name}</div>}
                    <div className="cls">{shortLabel(kid.class_label)}</div>
                  </div>
                  <div className="stamp" aria-hidden="true">
                    <div>
                      <b>{kid.total_qt}</b>
                      <small>pages</small>
                    </div>
                  </div>
                </header>

                {logged.length === 0 ? (
                  <p className="hint">No weeks logged yet.</p>
                ) : (
                  <dl className="week-list">
                    {logged.map((w) => {
                      const cell = kid.cells[w.id];
                      return (
                        <div key={w.id} style={{ display: "contents" }}>
                          <dt>{w.label}</dt>
                          <dd className="att">
                            {cell.attendance === "HERE" ? "✓ here" : "– absent"}
                          </dd>
                          <dd className="pg">{cell.qt_pages || "–"}</dd>
                        </div>
                      );
                    })}
                  </dl>
                )}

                <footer>
                  <span>
                    Here {attended(kid)} of {logged.length}
                  </span>
                  <span>Total {kid.total_qt} pages</span>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
