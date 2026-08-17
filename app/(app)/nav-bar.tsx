"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Classes" },
  { href: "/log", label: "Log a Sheet" },
  { href: "/records", label: "Records" },
  { href: "/cards", label: "Print Cards" },
];

export default function NavBar({
  displayName,
  role,
}: {
  displayName: string;
  role: "admin" | "member";
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="app-header no-print">
      <Link href="/" prefetch={false} className="brand">
        QT <span>Passport</span>
      </Link>

      <nav className="app-nav" aria-label="Main">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            prefetch={false}
            aria-current={pathname === l.href ? "page" : undefined}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="row" style={{ gap: "var(--space-2)", flexWrap: "nowrap" }}>
        <span className="hint" style={{ whiteSpace: "nowrap" }}>
          {displayName}
          {role === "admin" && <span className="role-pill">Pastor</span>}
        </span>
        <button onClick={signOut} className="btn btn--ghost btn--sm">
          Sign out
        </button>
      </div>
    </header>
  );
}
