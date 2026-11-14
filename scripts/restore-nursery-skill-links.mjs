import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function env(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = value;
  }
  return out;
}

const root = resolve(import.meta.dirname, "..");
const fileEnv = env(resolve(root, ".env"));
const url = fileEnv.KJA_UPSTREAM_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const key = fileEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need Supabase URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const [
  { data: domains, error: dErr },
  { data: skills, error: sErr },
  { data: divisions, error: vErr },
] = await Promise.all([
  sb.from("developmental_domains").select("id").eq("active", true),
  sb.from("developmental_skills").select("id, domain_id").eq("active", true),
  sb.from("nursery_divisions").select("id"),
]);
if (dErr || sErr || vErr) {
  throw new Error(dErr?.message || sErr?.message || vErr?.message);
}

const domainRows = (divisions || []).flatMap((div) =>
  (domains || []).map((domain) => ({ domain_id: domain.id, division_id: div.id })),
);
const { error: domLinkErr } = await sb
  .from("domain_division_links")
  .upsert(domainRows, { onConflict: "domain_id,division_id", ignoreDuplicates: true });
if (domLinkErr) throw new Error(domLinkErr.message);

const { data: domainLinks, error: dlErr } = await sb
  .from("domain_division_links")
  .select("domain_id, division_id");
if (dlErr) throw new Error(dlErr.message);

const byDomain = new Map();
for (const row of domainLinks || []) {
  if (!byDomain.has(row.domain_id)) byDomain.set(row.domain_id, []);
  byDomain.get(row.domain_id).push(row.division_id);
}

const skillRows = [];
for (const skill of skills || []) {
  for (const divisionId of byDomain.get(skill.domain_id) || []) {
    skillRows.push({ skill_id: skill.id, division_id: divisionId });
  }
}

const chunk = 500;
for (let index = 0; index < skillRows.length; index += chunk) {
  const { error } = await sb
    .from("skill_division_links")
    .upsert(skillRows.slice(index, index + chunk), {
      onConflict: "skill_id,division_id",
      ignoreDuplicates: true,
    });
  if (error) throw new Error(error.message);
}

const counts = {};
for (const id of (divisions || []).map((row) => row.id)) {
  const { count, error } = await sb
    .from("skill_division_links")
    .select("skill_id", { count: "exact", head: true })
    .eq("division_id", id);
  if (error) throw new Error(error.message);
  counts[id] = count;
}

console.log(
  JSON.stringify(
    {
      domains: domains?.length || 0,
      skills: skills?.length || 0,
      skillLinkRows: skillRows.length,
      counts,
    },
    null,
    2,
  ),
);
