import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
