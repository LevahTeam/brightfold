import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import NavBar from "./nav-bar";
import DemoBanner from "./demo-banner";
import { DEMO_MODE } from "@/lib/demo";

export const dynamic = "force-dynamic";

/**
 * Every authenticated page renders inside here, so the session check happens
 * once rather than being re-implemented per page.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      {DEMO_MODE && <DemoBanner />}
      <NavBar displayName={user.display_name} role={user.role} />
      {children}
    </>
  );
}
