import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Job applications upload a CV plus up to three 5 MB supporting documents.
    serverActions: { bodySizeLimit: "21mb" },
    // Revisiting an admin or office page within half a minute uses the copy already loaded.
    staleTimes: { dynamic: 30 },
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
