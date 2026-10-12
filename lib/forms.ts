export const ALUMNI_QUESTIONS = [
  "Tell our readers how long you studied at Kampala Junior Academy.",
  "What are your most memorable moments at Kampala Junior Academy?",
  "Which interests and passions did you pursue through the clubs at Kampala Junior Academy and do you still pursue today?",
  "Describe your experience leaving Kampala Junior Academy. How did you feel about starting your new journey?",
  "Where are you today? Have you graduated, started a new job, visited a new place, got married, expanded your family, etc.? Tell us about it here!",
  "What advice would you give future Kampala Junior Academy students?",
];

const CF7_BLOCK = /<div class="wp-block-contact-form-7-contact-form-selector">[\s\S]*<\/form>\s*<\/div>\s*<\/div>/;

/* Page bodies imported from WordPress embed the Contact Form 7 markup; the live form is rendered in its place. */
export function splitAroundForm(html?: string | null) {
  const body = html || "";
  const match = CF7_BLOCK.exec(body);
  if (!match) return { before: body, after: "" };
  return { before: body.slice(0, match.index), after: body.slice(match.index + match[0].length) };
}
