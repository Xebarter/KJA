export const JOB_STAGES = [
  { value: "new", label: "New", tone: "new", hint: "Not looked at yet" },
  { value: "reviewing", label: "Reviewing", tone: "review", hint: "Being read by the team" },
  { value: "shortlisted", label: "Shortlisted", tone: "short", hint: "Strong candidate" },
  { value: "interview", label: "Interview", tone: "visit", hint: "Interview booked or held" },
  { value: "offered", label: "Offered", tone: "offer", hint: "Offer made" },
  { value: "hired", label: "Hired", tone: "done", hint: "Accepted and joining" },
  { value: "rejected", label: "Not progressed", tone: "closed", hint: "Unsuccessful this time" },
  { value: "withdrawn", label: "Withdrawn", tone: "wait", hint: "Applicant pulled out" },
] as const;

export type JobStage = (typeof JOB_STAGES)[number]["value"];

/** Stages shown as columns on the hiring board. */
export const BOARD_STAGES: JobStage[] = ["new", "reviewing", "shortlisted", "interview", "offered", "hired"];
export const ACTIVE_STAGES: JobStage[] = ["new", "reviewing", "shortlisted", "interview", "offered"];
export const CLOSED_STAGES: JobStage[] = ["hired", "rejected", "withdrawn"];

export const QUALIFICATIONS = [
  "Grade III teaching certificate",
  "Diploma in education (Grade V)",
  "Bachelor's degree",
  "Postgraduate diploma",
  "Master's degree or higher",
  "Other certificate or diploma",
  "No formal qualification",
];

export const EXPERIENCE_LEVELS = ["Less than 1 year", "1–2 years", "3–5 years", "6–10 years", "More than 10 years"];

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SUPPORTING = 3;
export const CV_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const SUPPORTING_TYPES = [...CV_TYPES, "image/jpeg", "image/png"];
export const CV_ACCEPT = ".pdf,.doc,.docx";
export const SUPPORTING_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png";

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/** Browsers sometimes send an empty or generic type, so fall back to the extension. */
export function fileType(name: string, type: string) {
  if (type && type !== "application/octet-stream") return type;
  return EXTENSION_TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? type;
}

export type JobDocument = { path: string; name: string; size: number; type: string; kind: "cv" | "supporting" };

export type JobApplication = {
  id: string;
  vacancy_id: string | null;
  vacancy_title: string | null;
  full_name: string;
  email: string;
  phone: string;
  location: string | null;
  current_position: string | null;
  qualification: string | null;
  experience: string | null;
  campus: string | null;
  available_from: string | null;
  cover_letter: string | null;
  documents: JobDocument[];
  status: JobStage;
  rating: number | null;
  interview_at: string | null;
  assigned_to: string | null;
  read: boolean;
  created_at: string;
  updated_at: string | null;
  updated_by: string | null;
};

export type JobActionResult = { ok?: string; error?: string };

export function isJobStage(value: string): value is JobStage {
  return JOB_STAGES.some((stage) => stage.value === value);
}

export function stageInfo(value: string | null | undefined) {
  return JOB_STAGES.find((stage) => stage.value === value) ?? JOB_STAGES[0];
}

/** Short reference applicants can quote when they get in touch. */
export function jobReference(id: string) {
  return `KJA-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export function roleTitle(application: Pick<JobApplication, "vacancy_title" | "vacancy_id">) {
  return application.vacancy_title?.trim() || (application.vacancy_id ? "Untitled role" : "General application");
}

export function toDocuments(value: unknown): JobDocument[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && typeof (item as { path?: unknown }).path === "string")
    .map((item) => ({
      path: String(item.path),
      name: String(item.name || "Document"),
      size: Number(item.size) || 0,
      type: String(item.type || ""),
      kind: item.kind === "cv" ? "cv" : "supporting",
    }));
}

export function toJobApplication(row: Record<string, unknown>): JobApplication {
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
  return {
    id: String(row.id),
    vacancy_id: text(row.vacancy_id),
    vacancy_title: text(row.vacancy_title),
    full_name: String(row.full_name || "Unnamed applicant"),
    email: String(row.email || ""),
    phone: String(row.phone || ""),
    location: text(row.location),
    current_position: text(row.current_position),
    qualification: text(row.qualification),
    experience: text(row.experience),
    campus: text(row.campus),
    available_from: text(row.available_from),
    cover_letter: text(row.cover_letter),
    documents: toDocuments(row.documents),
    status: isJobStage(String(row.status)) ? (row.status as JobStage) : "new",
    rating: typeof row.rating === "number" ? row.rating : null,
    interview_at: text(row.interview_at),
    assigned_to: text(row.assigned_to),
    read: row.read === true,
    created_at: String(row.created_at || new Date(0).toISOString()),
    updated_at: text(row.updated_at),
    updated_by: text(row.updated_by),
  };
}

export function fileSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileIcon(type: string) {
  if (type === "application/pdf") return "fa-file-pdf";
  if (type.startsWith("image/")) return "fa-file-image";
  if (type.includes("word")) return "fa-file-word";
  return "fa-file-lines";
}

export function safeFileName(name: string) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "";
  return ext ? `${base}.${ext}` : base;
}

const FIRST = (name: string) => name.trim().split(/\s+/)[0] || "there";

/** Ready-made replies, opened in the admin's own email app. */
export function replyTemplates(application: JobApplication, interviewLabel: string) {
  const role = roleTitle(application);
  const hello = `Dear ${FIRST(application.full_name)},`;
  const sign = "Kind regards,\nHuman Resources\nKampala Junior Academy";
  const forRole = application.vacancy_id ? `the ${role} position` : "a position";
  return [
    {
      key: "received",
      label: "Acknowledge",
      icon: "fa-envelope-circle-check",
      subject: `Your application for ${role} – Kampala Junior Academy`,
      body: `${hello}\n\nThank you for applying for ${forRole} at Kampala Junior Academy. We have received your application and our team is reviewing it.\n\nWe will contact you about the next steps.\n\n${sign}`,
    },
    {
      key: "interview",
      label: "Invite to interview",
      icon: "fa-calendar-check",
      subject: `Interview invitation: ${role} – Kampala Junior Academy`,
      body: `${hello}\n\nThank you for your interest in ${forRole} at Kampala Junior Academy. We are pleased to invite you for an interview${interviewLabel ? ` on ${interviewLabel}` : ""}.\n\nPlease bring your original academic documents and certificates. Kindly reply to confirm your attendance${interviewLabel ? "" : " and we will share the date and time"}.\n\n${sign}`,
    },
    {
      key: "offer",
      label: "Make an offer",
      icon: "fa-handshake",
      subject: `Offer: ${role} – Kampala Junior Academy`,
      body: `${hello}\n\nWe are delighted to offer you ${forRole} at Kampala Junior Academy. Our team will be in touch shortly with the formal offer letter and next steps.\n\nCongratulations, and welcome to the KJA family.\n\n${sign}`,
    },
    {
      key: "regret",
      label: "Regret",
      icon: "fa-envelope",
      subject: `Your application for ${role} – Kampala Junior Academy`,
      body: `${hello}\n\nThank you for your interest in ${forRole} at Kampala Junior Academy and for the time you put into your application.\n\nAfter careful consideration, we will not be taking your application further on this occasion. We will keep your details on file and encourage you to apply for future openings on our careers page.\n\nWe wish you every success.\n\n${sign}`,
    },
  ].map((template) => ({
    ...template,
    href: `mailto:${application.email}?subject=${encodeURIComponent(template.subject)}&body=${encodeURIComponent(template.body)}`,
  }));
}
