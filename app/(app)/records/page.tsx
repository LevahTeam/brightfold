import Link from "next/link";
import { listGrades, listClasses, getRecords } from "@/lib/repo";
import RecordsGrid from "./records-grid";
import { withRequestDb } from "@/lib/demo";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ gradeId?: string; classId?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const grades = await withRequestDb(() => listGrades());

  if (grades.length === 0) {
    return (
      <main className="main">
        <div className="empty">
          <h2>No grades yet</h2>
          <p>Add a grade and a class, then log a sheet to see records here.</p>
          <Link href="/" prefetch={false} className="btn btn--primary">
            Go to Classes
          </Link>
        </div>
      </main>
    );
  }

  const gradeId = Number(sp.gradeId) || grades[0].id;
  const grade = grades.find((g) => g.id === gradeId) ?? grades[0];
  const classes = await withRequestDb(() => listClasses(grade.id));

  const classId =
    sp.classId && sp.classId !== "all" && classes.some((c) => c.id === Number(sp.classId))
      ? Number(sp.classId)
      : undefined;

  const { weeks, rows } = await withRequestDb(() => getRecords(grade.id, classId));

  return (
    <main className="main main--wide">
      <div className="page-head">
        <div>
          <h1>Records</h1>
          <p>
            Every logged week for {grade.name}
            {classId ? `, ${classes.find((c) => c.id === classId)?.label}` : " — all classes"}.
            Edit any cell directly; changes save as you go.
          </p>
        </div>
        <div className="row">
          <Link
            prefetch={false}
            href={`/cards?gradeId=${grade.id}${classId ? `&classId=${classId}` : ""}`}
            className="btn btn--secondary"
          >
            Print cards
          </Link>
          <Link href="/log" prefetch={false} className="btn btn--primary">
            Log a sheet
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "var(--space-4)" }}>
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
            <select
              id="classId"
              name="classId"
              className="select"
              defaultValue={classId ?? "all"}
            >
              <option value="all">All classes (combined)</option>
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

      {weeks.length === 0 || rows.length === 0 ? (
        <div className="card">
          <div className="empty">
            <h2>Nothing logged yet</h2>
            <p>
              Once you save a sheet for {grade.name}, every kid and week will appear here as a
              spreadsheet you can correct in place.
            </p>
            <Link href="/log" prefetch={false} className="btn btn--primary">
              Log a sheet
            </Link>
          </div>
        </div>
      ) : (
        <RecordsGrid
          weeks={weeks}
          rows={rows}
          showClassHeaders={classId === undefined}
          canDelete={user?.role === "admin"}
        />
      )}
    </main>
  );
}
