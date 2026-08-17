import { listGrades, listClasses } from "@/lib/repo";
import { readVisionConfig, visionKeyPresent } from "@/lib/vision/providers";
import LogSheetClient from "./log-sheet-client";
import { withRequestDb } from "@/lib/demo";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const grades = await withRequestDb(async () =>
    Promise.all(
      (await listGrades()).map(async (g) => ({
        id: g.id,
        name: g.name,
        classes: (await listClasses(g.id)).map((c) => ({ id: c.id, label: c.label })),
      })),
    ),
  );

  // Only the on/off flag reaches the browser — never the key or the model id
  // beyond what is needed to explain the current state.
  const cfg = readVisionConfig();
  const scanEnabled = cfg.provider !== "none" && visionKeyPresent(cfg);

  return (
    <main className="main main--wide">
      <div className="page-head">
        <div>
          <h1>Log a sheet</h1>
          <p>
            Photograph a class&apos;s paper sheet and check the result, or fill the table in by
            hand. Nothing is saved until you press Save.
          </p>
        </div>
      </div>
      <LogSheetClient grades={grades} scanEnabled={scanEnabled} />
    </main>
  );
}
