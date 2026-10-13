import type { MessageRow } from "@/lib/account";

export type InboxMessage = MessageRow & { pending?: boolean };

export type Thread = {
  key: string;
  subject: string;
  items: InboxMessage[];
  last: InboxMessage;
  unread: number;
  replied: boolean;
};

const REPLY_PREFIX = /^\s*((re|fw|fwd)\s*:\s*)+/i;

export function cleanSubject(subject: string) {
  return subject.replace(REPLY_PREFIX, "").trim() || "No subject";
}

export function threadKey(subject: string) {
  return cleanSubject(subject).toLowerCase().replace(/\s+/g, " ");
}

export function groupThreads(messages: InboxMessage[], readIds?: Set<string>): Thread[] {
  const map = new Map<string, InboxMessage[]>();
  for (const message of messages) {
    const key = threadKey(message.subject);
    map.set(key, [...(map.get(key) || []), message]);
  }
  return [...map.entries()]
    .map(([key, list]) => {
      const items = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return {
        key,
        subject: cleanSubject(items[0].subject),
        items,
        last: items[items.length - 1],
        unread: items.filter((m) => m.direction === "in" && !m.read && !readIds?.has(m.id)).length,
        replied: items.some((m) => m.direction === "in"),
      };
    })
    .sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
}
