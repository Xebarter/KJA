"use client";

import { useEffect, useState } from "react";
import { ProcessStatus } from "@/components/ProcessStatus";
import { takeProcessNote } from "@/lib/process-signal";

const EXACT: Record<string, string> = {
  Revoke: "Revoking login",
  Issue: "Issuing login",
  "Issue login": "Issuing login",
  "Create student": "Creating the student",
  Replace: "Replacing the image",
  Upload: "Uploading the image",
  Update: "Saving changes",
  "Save draft": "Saving the draft",
  Publish: "Publishing",
  Schedule: "Scheduling",
  Save: "Saving",
  "Save changes": "Saving changes",
  Delete: "Deleting",
  "Delete story": "Deleting the story",
  Duplicate: "Duplicating",
  "Sign out": "Signing out",
  "Mark all as read": "Marking messages as read",
};

function phrase(raw: string) {
  const clean = raw.replace(/[….]+$/g, "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 72) return "";
  if (EXACT[clean]) return EXACT[clean];
  if (/\b(saving|working|creating|issuing|revoking|uploading|replacing|deleting|publishing|sending|adding|removing|updating)\b/i.test(clean)) return clean;
  const verb = clean.split(" ")[0] ?? "";
  const gerunds: Record<string, string> = {
    Save: "Saving",
    Update: "Saving changes",
    Publish: "Publishing",
    Schedule: "Scheduling",
    Delete: "Deleting",
    Remove: "Removing",
    Add: "Adding",
    Create: "Creating",
    Send: "Sending",
    Upload: "Uploading",
    Replace: "Replacing the image",
    Issue: "Issuing login",
    Revoke: "Revoking login",
    Duplicate: "Duplicating",
    Approve: "Approving",
    Generate: "Generating",
  };
  const gerund = gerunds[verb];
  if (!gerund) return clean;
  if (verb === "Replace" || verb === "Issue" || verb === "Revoke" || verb === "Update") return gerund;
  const rest = clean.slice(verb.length).trim();
  return rest ? `${gerund} ${rest.charAt(0).toLowerCase()}${rest.slice(1)}` : gerund;
}

function labelFrom(target: EventTarget | null) {
  const node = target instanceof Element ? target : null;
  const control = node?.closest("button, input[type=submit], input[type=image]");
  if (!(control instanceof HTMLElement)) return "";
  return phrase(control.getAttribute("aria-label") || control.innerText || control.getAttribute("value") || "");
}

function isSearchField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && target.type === "search") return true;
  return Boolean(target.closest("#admin-search, .admin-side .ofc-search, [data-admin-search]"));
}

function isServerAction(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.headers && new Headers(init.headers).has("Next-Action")) return true;
  return input instanceof Request && input.headers.has("Next-Action");
}

/** Shows the green progress ring for admin actions: saves, uploads, logins, and the rest. */
export function AdminProcess() {
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState("Working");

  useEffect(() => {
    let depth = 0;
    let command = "";
    let commandAt = 0;
    const original = window.fetch.bind(window);

    const remember = (event: Event) => {
      const submitter = event.type === "submit" && "submitter" in event ? event.submitter : null;
      const next = labelFrom(submitter instanceof Element ? submitter : event.target);
      if (!next) return;
      command = next;
      commandAt = performance.now();
    };

    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        command = "Saving";
        commandAt = performance.now();
      }
    };

    const onSearchInput = (event: Event) => {
      if (isSearchField(event.target)) command = "";
    };

    window.fetch = async (input, init) => {
      if (!isServerAction(input, init)) return original(input, init);
      const explicit = takeProcessNote();
      const recent = command && performance.now() - commandAt < 60_000 ? command : "";
      if (!explicit && (isSearchField(document.activeElement) || !recent)) return original(input, init);
      const next = explicit || recent || "Working";
      command = "";
      depth += 1;
      if (depth === 1) {
        setLabel(next);
        setActive(true);
      }
      try {
        return await original(input, init);
      } finally {
        depth = Math.max(0, depth - 1);
        if (depth === 0) setActive(false);
      }
    };

    document.addEventListener("click", remember, true);
    document.addEventListener("submit", remember, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("input", onSearchInput, true);
    return () => {
      window.fetch = original;
      document.removeEventListener("click", remember, true);
      document.removeEventListener("submit", remember, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("input", onSearchInput, true);
    };
  }, []);

  return <ProcessStatus active={active} label={label} />;
}
