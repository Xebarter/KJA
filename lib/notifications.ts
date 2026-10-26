import type { NoticeRow } from "@/lib/account";

export const NOTICE_KINDS = {
  fees: { label: "Fees", icon: "fa-receipt", action: "View fees" },
  reports: { label: "Reports", icon: "fa-file-lines", action: "View report" },
  admissions: { label: "Admissions", icon: "fa-clipboard-list", action: "View application" },
  clubs: { label: "Clubs", icon: "fa-puzzle-piece", action: "View clubs" },
  messages: { label: "Communications", icon: "fa-comments", action: "Open conversation" },
  homework: { label: "Homework", icon: "fa-book", action: "View homework" },
  resources: { label: "Class resources", icon: "fa-folder-open", action: "View children" },
  events: { label: "Events", icon: "fa-calendar-days", action: "View calendar" },
  school: { label: "School notices", icon: "fa-bullhorn", action: "Read more" },
  points: { label: "Points", icon: "fa-star", action: "View points" },
} as const;

export type NoticeKind = keyof typeof NOTICE_KINDS;

const BY_LINK: [RegExp, NoticeKind][] = [
  [/\/account\/fees|\/fees\b/, "fees"],
  [/\/account\/reports|\/student\/reports|\/r\//, "reports"],
  [/\/account\/applications|\/apply\b|\/admissions\b/, "admissions"],
  [/\/account\/clubs|\/(sports|music|language|adventure|religion|talent)\b/, "clubs"],
  [/\/account\/(messages|communications)|\/student\/messages/, "messages"],
  [/\/student\/homework/, "homework"],
  [/\/account\/calendar|\/student\/calendar|\/events?\b|\/event\//, "events"],
  [/\/account\/points|\/student\/points/, "points"],
];

const BY_TEXT: [RegExp, NoticeKind][] = [
  [/\bfees?\b|payment|invoice|balance|tuition|\bugx\b/i, "fees"],
  [/\bhomework|assignment due/i, "homework"],
  [/\bclass resource|learning resource|new resource\b/i, "resources"],
  [/\breports?\b|results?\b|grades?\b|exam/i, "reports"],
  [/application|admission|enrol|interview/i, "admissions"],
  [/\bclubs?\b/i, "clubs"],
  [/\bmessage|repl(y|ied)\b/i, "messages"],
  [/\bevents?\b|calendar|visiting day|sports day|holiday|term (begins|starts|opens|ends|closes)/i, "events"],
];

export function noticeKindFromStored(kind: string | null | undefined): NoticeKind | null {
  if (!kind) return null;
  return kind in NOTICE_KINDS ? (kind as NoticeKind) : null;
}

export function noticeKind(notice: Pick<NoticeRow, "title" | "body" | "href"> & { kind?: string | null }): NoticeKind {
  const stored = noticeKindFromStored(notice.kind);
  if (stored) return stored;
  const link = notice.href || "";
  const text = `${notice.title} ${notice.body || ""}`;
  return BY_LINK.find(([pattern]) => pattern.test(link))?.[1] ?? BY_TEXT.find(([pattern]) => pattern.test(text))?.[1] ?? "school";
}
