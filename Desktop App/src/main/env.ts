import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { app } from "electron";

export type DesktopEnv = {
  upstreamSupabaseUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
  siteUrl: string;
  /** Website monorepo root (dev) or packaged standalone root. */
  repoRoot: string;
};

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Website repo root in development: Desktop App/out/main → ../../.. */
export function resolveRepoRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "next-standalone");
  }
  return resolve(__dirname, "../../..");
}

export function loadDesktopEnv(): DesktopEnv {
  const repoRoot = resolveRepoRoot();
  const websiteRoot = app.isPackaged ? repoRoot : repoRoot;
  const merged = {
    ...parseEnvFile(join(websiteRoot, ".env")),
    ...parseEnvFile(join(websiteRoot, ".env.local")),
    ...process.env,
  };

  const upstream =
    merged.KJA_UPSTREAM_SUPABASE_URL ||
    merged.NEXT_PUBLIC_SUPABASE_URL ||
    merged.SUPABASE_URL ||
    "";
  const anon =
    merged.NEXT_PUBLIC_SUPABASE_ANON_KEY || merged.SUPABASE_ANON_KEY || "";
  const service = merged.SUPABASE_SERVICE_ROLE_KEY || undefined;
  const site = merged.KJA_SITE_URL || merged.NEXT_PUBLIC_SITE_URL || "https://kja.ug";

  if (!upstream || !anon) {
    throw new Error(
      "Missing Supabase URL or anon key. Set KJA_UPSTREAM_SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and NEXT_PUBLIC_SUPABASE_ANON_KEY in the website .env / .env.local.",
    );
  }

  // Never point the proxy at itself if a previous desktop run left PROXY_URL in the env file.
  const cleanedUpstream = upstream.includes("127.0.0.1:47321")
    ? merged.KJA_UPSTREAM_SUPABASE_URL || ""
    : upstream;
  if (!cleanedUpstream || cleanedUpstream.includes("127.0.0.1:47321")) {
    throw new Error(
      "Set KJA_UPSTREAM_SUPABASE_URL to your real Supabase project URL (https://….supabase.co).",
    );
  }

  return {
    upstreamSupabaseUrl: cleanedUpstream.replace(/\/$/, ""),
    anonKey: anon,
    serviceRoleKey: service,
    siteUrl: site.replace(/\/$/, ""),
    repoRoot,
  };
}
