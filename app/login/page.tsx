import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getCurrentUser()) redirect("/");

  const { next } = await searchParams;
  // Only accept same-origin paths, so a crafted ?next= cannot bounce someone
  // off-site after a successful sign-in.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="login-mark">
          <h1>
            QT <span style={{ color: "var(--color-accent-text)" }}>Passport</span>
          </h1>
          <p>Quiet Time &amp; attendance for children&apos;s ministry</p>
        </div>
        <LoginForm next={safeNext} />
      </div>
    </main>
  );
}
