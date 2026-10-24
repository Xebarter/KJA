import type { NextConfig } from "next";

const isDesktop = process.env.KJA_DESKTOP === "1";
/** Packaging only — do not enable during `next dev` (desktop or website). */
const isDesktopPack = process.env.KJA_DESKTOP_PACK === "1";

const nextConfig: NextConfig = {
  // Desktop and website must not share .next — two `next dev` processes corrupt it.
  ...(isDesktop ? { distDir: ".next-desktop" } : {}),
  // Electron packages the standalone server under resources/next-standalone.
  ...(isDesktopPack ? { output: "standalone" as const } : {}),
  serverExternalPackages: ["exceljs"],
  experimental: {
    // Job applications upload a CV plus up to three 5 MB supporting documents.
    serverActions: { bodySizeLimit: "21mb" },
    // Website: 30s. Desktop shell: longer so sidebar hops reuse the RSC payload.
    staleTimes: { dynamic: isDesktop ? 120 : 30 },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      { protocol: "https", hostname: "kja.ug" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async redirects() {
    return [
      { source: "/religion-faith", destination: "/religion", permanent: true },
      { source: "/religion-faith/", destination: "/religion", permanent: true },
      { source: "/calendar", destination: "/events", permanent: false },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/events/:path*", has: [{ type: "query", key: "ical" }], destination: "/events-ical/:path*" },
        { source: "/events/:path*", has: [{ type: "query", key: "outlook-ical" }], destination: "/events-ical/:path*" },
        { source: "/event/:slug", has: [{ type: "query", key: "ical" }], destination: "/event-ical/:slug" },
        { source: "/event/:slug", has: [{ type: "query", key: "outlook-ical" }], destination: "/event-ical/:slug" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
