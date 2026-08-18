import { getCurrentUser } from "@/lib/auth";
import { listAuditEvents } from "@/lib/audit";
import { withRequestDb } from "@/lib/demo";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function describe(value: string | null): string {
  if (!value) return "—";
  try {
    const parsed = JSON.parse(value) as Record<string, unknown> | null;
    if (!parsed) return "—";
    return Object.entries(parsed)
      .map(([key, item]) => `${key.replaceAll("_", " ")}: ${String(item ?? "—")}`)
      .join(" · ");
  } catch {
    return "Recorded change";
  }
}

export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") redirect("/");
  const events = await withRequestDb(() => listAuditEvents());

  return (
    <main className="main main--wide">
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p>Recent corrections and removals, visible only to the pastor account.</p>
        </div>
      </div>

      <section className="card">
        {events.length === 0 ? (
          <div className="empty">
            <h2>No changes recorded yet</h2>
            <p>Corrections and removals made from now on will appear here.</p>
          </div>
        ) : (
          <div className="table-wrap" style={{ maxHeight: "none" }}>
            <table className="grid" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Account</th>
                  <th>Change</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(`${event.created_at}Z`).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "America/New_York",
                      })}
                    </td>
                    <td>{event.actor ?? "System"}</td>
                    <td>
                      {event.action} {event.entity_type} #{event.entity_id}
                    </td>
                    <td>{describe(event.before_json)}</td>
                    <td>{describe(event.after_json)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
