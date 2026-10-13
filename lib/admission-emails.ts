/*
 * Emails to parents when their application moves forward. Server only.
 */
import { siteUrl } from "@/lib/admin-alerts";
import { formatDate, formatDateTime, statusInfo, type ApplicationStatus } from "@/lib/applications";
import { renderAlertEmail, type AlertEmail, type EmailLink } from "@/lib/email/layout";

type School = { phone: string; email: string; address: string };

export type ParentEmailInput = {
  child: string;
  parent: string;
  grade: string | null;
  campus: string | null;
  createdAt: string;
  status: ApplicationStatus;
  visitAt: string | null;
  message: string;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

function visitParts(iso: string) {
  const date = new Date(iso);
  return {
    day: date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Kampala" }),
    time: date.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Kampala" }),
  };
}

type Copy = Pick<AlertEmail, "badge" | "title" | "intro"> & {
  subject: string;
  preheader: string;
  steps?: AlertEmail["steps"];
  primary?: EmailLink;
};

function copy(input: ParentEmailInput, school: School, site: string): Copy | null {
  const { child } = input;
  const place = [input.grade, input.campus ? `our ${input.campus} campus` : null].filter(Boolean).join(" at ");
  const where = place ? ` for ${place}` : "";
  const call = `call us on ${school.phone}`;
  switch (input.status) {
    case "reviewing":
      return {
        subject: `We're reviewing ${child}'s application`,
        preheader: `Our admissions team has started reviewing ${child}'s application.`,
        badge: { label: "In review", tone: "navy" },
        title: `We're reviewing ${child}'s application`,
        intro: `Thank you for applying to Kampala Junior Academy. Our admissions team has started reviewing ${child}'s application${where}, and we'll be in touch about the next step shortly.`,
      };
    case "visit_scheduled": {
      if (!input.visitAt) return null;
      const visit = visitParts(input.visitAt);
      return {
        subject: `School visit booked for ${child} – ${visit.day}`,
        preheader: `${visit.day} at ${visit.time}${input.campus ? `, ${input.campus} campus` : ""}.`,
        badge: { label: "School visit booked", tone: "gold" },
        title: "Your school visit is booked",
        intro: `We look forward to meeting you and ${child}. Your visit is on ${visit.day} at ${visit.time}${input.campus ? ` at our ${input.campus} campus` : ""}.`,
        steps: {
          title: "Before you come",
          items: [
            "Please arrive a few minutes early and ask for the admissions office at reception.",
            `If you need to change the time, reply to this email or ${call}.`,
          ],
        },
      };
    }
    case "offered":
      return {
        subject: `An offer of a place for ${child}`,
        preheader: `We're delighted to offer ${child} a place at Kampala Junior Academy.`,
        badge: { label: "Offer of a place", tone: "green" },
        title: `We're delighted to offer ${child} a place`,
        intro: `Thank you for taking the time to apply and visit us. We're pleased to offer ${child} a place${where}.`,
        steps: {
          title: "To accept the place",
          items: [
            `Reply to this email or ${call} to confirm that you accept.`,
            "We'll then send you the joining details, fees and requirements.",
          ],
        },
        primary: {
          label: "Accept the place",
          href: `mailto:${school.email}?subject=${encodeURIComponent(`Accepting the place for ${child}`)}`,
        },
      };
    case "enrolled":
      return {
        subject: `Welcome to Kampala Junior Academy, ${child}`,
        preheader: `${child} is now enrolled. Welcome to the KJA family.`,
        badge: { label: "Enrolled", tone: "green" },
        title: "Welcome to the KJA family",
        intro: `${child} is now enrolled${where}. We're so glad to welcome your family, and we'll be in touch with everything you need before the first day.`,
        primary: { label: "Open the parent portal", href: `${site}/account` },
      };
    case "waitlisted":
      return {
        subject: `${child} is on our waiting list`,
        preheader: `We'll contact you as soon as a place becomes available.`,
        badge: { label: "Waiting list", tone: "navy" },
        title: `${child} is on our waiting list`,
        intro: `Thank you for your patience. We aren't able to offer a place${where} just yet, so ${child} is on our waiting list. We'll contact you as soon as a place becomes available.`,
      };
    case "declined":
      return {
        subject: `An update on ${child}'s application`,
        preheader: `An update from the admissions team at Kampala Junior Academy.`,
        badge: { label: "Application update", tone: "navy" },
        title: `An update on ${child}'s application`,
        intro: `Thank you for your interest in Kampala Junior Academy. After careful consideration, we're unable to offer ${child} a place at this time. We wish ${child} every success, and you're welcome to ${call} with any questions.`,
      };
    default:
      return null;
  }
}

export function buildParentEmail(input: ParentEmailInput, school: School) {
  const site = siteUrl();
  const text = copy(input, school, site);
  if (!text) return null;
  const facts = [{ label: "Status", value: statusInfo(input.status).label }, { label: "Applied", value: formatDate(input.createdAt) }];
  if (input.status === "visit_scheduled" && input.visitAt) {
    const visit = visitParts(input.visitAt);
    facts.splice(1, 1, { label: "Visit", value: `${visit.day.replace(/ \d{4}$/, "")}, ${visit.time}` });
  }
  const email: AlertEmail = {
    kicker: "Admissions",
    preheader: text.preheader,
    badge: text.badge,
    title: text.title,
    greeting: firstName(input.parent),
    intro: text.intro,
    spotlight: {
      eyebrow: "Application",
      name: input.child,
      meta: [input.grade ?? "", input.campus ? `${input.campus} campus` : ""].filter(Boolean),
      facts,
    },
    sections: [],
    quote: input.message.trim() ? { title: "A note from our admissions team", body: input.message.trim() } : null,
    primary: text.primary ?? { label: "Contact admissions", href: `mailto:${school.email}` },
    quickLinks: [
      { label: `Call ${school.phone}`, href: `tel:${school.phone.replace(/[^\d+]/g, "")}` },
      { label: "Visit our website", href: site },
    ],
    steps: text.steps ?? null,
    sentAt: formatDateTime(new Date().toISOString()),
    footer: [
      "You're receiving this because you applied for a place at Kampala Junior Academy.",
      `Questions? Reply to this email or call ${school.phone}. ${school.address}`.trim(),
    ],
  };
  const { html, text: plain } = renderAlertEmail(email, site);
  return { subject: `${text.subject} – Kampala Junior Academy`, html, text: plain };
}
