import type { MessageRow } from "@/lib/account";
import { cleanSubject, threadKey } from "@/lib/messages";

export type CommMessage = MessageRow & {
  thread_id?: string | null;
  family_id?: string | null;
  audience?: "direct" | "family" | "broadcast" | null;
  created_by?: string | null;
  pending?: boolean;
};

export type CommThread = {
  key: string;
  threadId: string | null;
  subject: string;
  items: CommMessage[];
  last: CommMessage;
  unread: number;
  awaitingSchool: boolean;
  fromSchool: boolean;
};

/** Group by thread_id when present; fall back to cleaned subject (legacy rows). */
export function groupCommThreads(messages: CommMessage[], readIds?: Set<string>): CommThread[] {
  const map = new Map<string, CommMessage[]>();
  for (const message of messages) {
    const key = message.thread_id || threadKey(message.subject);
    map.set(key, [...(map.get(key) || []), message]);
  }
  return [...map.entries()]
    .map(([key, list]) => {
      const items = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const threadId = items.find((m) => m.thread_id)?.thread_id ?? null;
      return {
        key,
        threadId,
        subject: cleanSubject(items[0].subject),
        items,
        last: items[items.length - 1],
        unread: items.filter((m) => m.direction === "in" && !m.read && !readIds?.has(m.id)).length,
        awaitingSchool: items.some((m) => m.direction === "out") && !items.some((m) => m.direction === "in"),
        fromSchool: items.some((m) => m.direction === "in"),
      };
    })
    .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
}

export type AdminCommThread = {
  threadId: string;
  userId: string;
  subject: string;
  lastBody: string;
  lastAt: string;
  lastDirection: "in" | "out";
  unreadOut: number;
  messageCount: number;
  parentName: string;
  parentEmail: string | null;
  familyCode: string | null;
  familyId: string | null;
};

export function buildAdminThreads(
  rows: Array<{
    id: string;
    user_id: string;
    subject: string;
    body: string;
    direction: "in" | "out";
    read: boolean;
    created_at: string;
    thread_id: string | null;
    family_id: string | null;
  }>,
  profiles: Map<string, { full_name: string | null; email: string | null }>,
  families: Map<string, { family_code: string | null }>,
): AdminCommThread[] {
  const byThread = new Map<string, typeof rows>();
  for (const row of rows) {
    const tid = row.thread_id || `legacy:${row.user_id}:${threadKey(row.subject)}`;
    byThread.set(tid, [...(byThread.get(tid) || []), row]);
  }
  return [...byThread.entries()]
    .map(([threadId, list]) => {
      const items = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const last = items[items.length - 1];
      const profile = profiles.get(last.user_id);
      const familyId = items.find((m) => m.family_id)?.family_id ?? null;
      const family = familyId ? families.get(familyId) : null;
      return {
        threadId,
        userId: last.user_id,
        subject: cleanSubject(items[0].subject),
        lastBody: last.body,
        lastAt: last.created_at,
        lastDirection: last.direction,
        unreadOut: items.filter((m) => m.direction === "out" && !m.read).length,
        messageCount: items.length,
        parentName: profile?.full_name?.trim() || profile?.email || "Parent",
        parentEmail: profile?.email ?? null,
        familyCode: family?.family_code ?? null,
        familyId,
      };
    })
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export const COMM_TOPICS = [
  "School fees",
  "Reports & learning",
  "Clubs & activities",
  "Absence or health",
  "Admissions",
  "General enquiry",
] as const;
