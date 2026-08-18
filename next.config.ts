import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // The libSQL client has a native binding. Leaving it external keeps the
  // server compiler from trying to bundle it, which breaks on Vercel.
  serverExternalPackages: ["@libsql/client"],
  // Give end-to-end runs a separate build directory. Otherwise, a test run
  // alongside `npm run dev` replaces the dev build and its chunk requests
  // begin returning 404s.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Package the production server with its dependencies so the deployment
  // image does not need a separate node_modules tree.
  //
  // Only for the container build. Left off otherwise, because `next start`
  // prints a warning that it "does not work with output: standalone" — it does
  // serve correctly, but the warning is alarming to someone who is just trying
  // to run the app from the start file.
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  async headers() {
    return [
      {
        // Children's names and attendance must stay out of search indexes and
        // third-party embeds.
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
