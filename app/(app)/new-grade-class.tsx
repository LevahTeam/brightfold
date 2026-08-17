"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewGradeClass({
  grades,
}: {
  grades: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [gradeName, setGradeName] = useState("");
  const [gradeId, setGradeId] = useState<string>(grades[0]?.id.toString() ?? "");
  const [classLabel, setClassLabel] = useState("");
  const [teacher, setTeacher] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function addGrade(e: React.FormEvent) {
    e.preventDefault();
    if (!gradeName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/grades", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: gradeName }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) return setError(data.error ?? "Could not add that grade.");
      setGradeName("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addClass(e: React.FormEvent) {
    e.preventDefault();
    if (!gradeId || !classLabel.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/grades/${gradeId}/classes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: classLabel, teacher_name: teacher }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) return setError(data.error ?? "Could not add that class.");
      setClassLabel("");
      setTeacher("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={addGrade} className="row">
        <div className="field" style={{ flex: "1 1 220px" }}>
          <label htmlFor="grade-name">New grade</label>
          <input
            id="grade-name"
            className="input"
            placeholder="e.g. 5th Grade"
            value={gradeName}
            onChange={(e) => setGradeName(e.target.value)}
          />
        </div>
        <button className="btn btn--secondary" disabled={busy || !gradeName.trim()}>
          Add grade
        </button>
      </form>

      {grades.length > 0 && (
        <form onSubmit={addClass} className="row">
          <div className="field" style={{ flex: "0 1 180px" }}>
            <label htmlFor="class-grade">Grade</label>
            <select
              id="class-grade"
              className="select"
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
            >
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: "1 1 200px" }}>
            <label htmlFor="class-label">New class</label>
            <input
              id="class-label"
              className="input"
              placeholder="e.g. A 5-2 (Korean)"
              value={classLabel}
              onChange={(e) => setClassLabel(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: "1 1 200px" }}>
            <label htmlFor="class-teacher">Teacher</label>
            <input
              id="class-teacher"
              className="input"
              placeholder="e.g. Ms. Ji Woo Park"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
            />
          </div>
          <button className="btn btn--secondary" disabled={busy || !classLabel.trim()}>
            Add class
          </button>
        </form>
      )}
    </div>
  );
}
