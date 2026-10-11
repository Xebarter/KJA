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
    ];
  },
};

export default nextConfig;
