import type { ApplicationStatus, StageAlert, TeamMember } from "@/lib/applications";

/** One application, shaped for the list and board. Built on the server. */
export type ApplicationItem = {
  id: string;
  child: string;
  meta: string;
  campus: string;
  parent: string;
  email: string;
  phone: string;
  tel: string;
  whatsapp: string;
  status: ApplicationStatus;
  ownerId: string | null;
  ownerName: string | null;
  stageFor: string;
  alert: StageAlert | null;
  visitLabel: string | null;
  visitInput: string;
  received: string;
  receivedFull: string;
  unread: boolean;
  paid: boolean;
  fee: string | null;
  duplicateHref: string | null;
};

export type WorkspaceContext = {
  currentUserId: string;
  team: TeamMember[];
  /** Why parent emails can't be sent, or null when they can. */
  emailProblem: string | null;
};
