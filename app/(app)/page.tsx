import Link from "next/link";
import { queryOne } from "@/lib/db";
import { listGrades, listClasses } from "@/lib/repo";
import NewGradeClass from "./new-grade-class";
import { withRequestDb } from "@/lib/demo";

export const dynamic = "force-dynamic";

interface ClassStat {
  kids: number;
  weeks_logged: number;
  total_pages: number;
}

function classStats(classId: number): ClassStat {
  return queryOne<ClassStat>(
    `SELECT
         (SELECT COUNT(*) FROM kids WHERE class_id = ? AND archived = 0) AS kids,
         -- Weeks this class actually has data for. Records shows every week
         -- in the grade, so the two numbers differ by design; the column is
         -- labelled "Weeks logged" to say which one this is.
         (SELECT COUNT(DISTINCT e.week_id)
            FROM entries e JOIN kids k ON k.id = e.kid_id
           WHERE k.class_id = ? AND k.archived = 0) AS weeks_logged,
         (SELECT COALESCE(SUM(e.qt_pages), 0)
            FROM entries e JOIN kids k ON k.id = e.kid_id
           WHERE k.class_id = ? AND k.archived = 0) AS total_pages`,
    classId,
    classId,
    classId,
  )!;
}

export default async function DashboardPage() {
  const grades = await withRequestDb(() =>
    listGrades().map((g) => ({
      ...g,
      classes: listClasses(g.id).map((c) => ({ ...c, stats: classStats(c.id) })),
    })),
  );

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Classes</h1>
          <p>
            Every grade and class you track. Pick one to log a sheet, review its records, or
            print point cards.
          </p>
        </div>
        <Link href="/log" prefetch={false} className="btn btn--primary">
          Log a sheet
        </Link>
      </div>

      {grades.length === 0 ? (
        <div className="card">
          <div className="empty">
            <h2>Nothing here yet</h2>
            <p>
              Start by adding a grade and a class. You can also let a scanned sheet create the
              class for you from the Log a Sheet page.
            </p>
          </div>
          <NewGradeClass grades={[]} />
        </div>
      ) : (
        <div className="stack">
          {grades.map((grade) => (
            <section key={grade.id} className="card">
              <div className="page-head" style={{ marginBottom: "var(--space-4)" }}>
                <div>
                  <h2>{grade.name}</h2>
                  <p className="card-sub">
                    {grade.classes.length}{" "}
                    {grade.classes.length === 1 ? "class" : "classes"}
                  </p>
                </div>
                <div className="row">
                  <Link
                    prefetch={false}
                    href={`/records?gradeId=${grade.id}`}
                    className="btn btn--secondary btn--sm"
                  >
                    Records
                  </Link>
                  <Link
                    prefetch={false}
                    href={`/cards?gradeId=${grade.id}`}
                    className="btn btn--secondary btn--sm"
                  >
                    Cards
                  </Link>
                </div>
              </div>

              {grade.classes.length === 0 ? (
                <p className="hint">No classes in this grade yet.</p>
              ) : (
                <div className="table-wrap" style={{ maxHeight: "none" }}>
                  <table className="grid" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Class</th>
                        <th>Teacher</th>
                        <th style={{ textAlign: "right" }}>Kids</th>
                        <th style={{ textAlign: "right" }}>Weeks logged</th>
                        <th style={{ textAlign: "right" }}>Total pages</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {grade.classes.map((c) => (
                        <tr key={c.id}>
                          <td style={{ fontWeight: "var(--weight-medium)" }}>{c.label}</td>
                          <td style={{ color: "var(--text-muted)" }}>
                            {c.teacher_name ?? "—"}
                          </td>
                          <td style={{ textAlign: "right" }}>{c.stats.kids}</td>
                          <td style={{ textAlign: "right" }}>{c.stats.weeks_logged}</td>
                          <td style={{ textAlign: "right" }}>{c.stats.total_pages}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <Link
                              prefetch={false}
                              href={`/records?gradeId=${grade.id}&classId=${c.id}`}
                              className="btn btn--ghost btn--sm"
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}

          <section className="card">
            <h2 className="card-title">Add a grade or class</h2>
            <p className="card-sub" style={{ marginBottom: "var(--space-4)" }}>
              Grades and classes are also created automatically when you save a scanned sheet.
            </p>
            <NewGradeClass grades={grades.map((g) => ({ id: g.id, name: g.name }))} />
          </section>
        </div>
      )}
    </main>
  );
}
