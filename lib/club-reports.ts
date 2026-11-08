/*
 * Club income at Kitante and Najjanankumbi only.
 * A receipt keeps the amount that was paid. An open consent with no receipt
 * is expected at the current catalogue fee.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { kampalaToday, methodInfo, percent, ugx, type Term } from "@/lib/accounts-format";
import { CLUB_CATEGORIES } from "@/lib/clubs";
import {
  CLUB_BRANCHES,
  clubBranch,
  clubInFundsScope,
  studentInFundsScope,
  type ClubBranch,
} from "@/lib/club-funds-scope";
import { SCHOOL_CLASSES } from "@/lib/students";

export { CLUB_BRANCHES, clubBranch, type ClubBranch };

export const CLUB_REPORT_BASIS =
  "Expected income is the current catalogue fee for each consent that was open during the term, for pupils at Kitante and Najjanankumbi (by the pupil’s campus). Makindye and Bunga do not run clubs and are not counted. When a receipt exists, that consent is counted at the amount on the receipt, even if the fee changed later. Expenditure is club spending registered on the Clubs desk for the term, attributed to each club’s catalogue campus; clubs marked All campuses stay on whole-desk totals only. Balance is collected minus expenditure.";

export type ClubFigure = {
  key: string;
  label: string;
  consents: number;
  pupils: number;
  paidCount: number;
  expected: number;
  collected: number;
  expenditure: number;
  balance: number;
  due: number;
  rate: number;
};

export type TermFigure = ClubFigure & {
  isCurrent: boolean;
  chart: string;
  byCampus: Record<ClubBranch, number>;
  /** @deprecated Prefer byCampus — kept for charts/PDF that still plot two series. */
  kitante: number;
  najja: number;
};

export type MonthFigure = {
  key: string;
  label: string;
  sub: string;
  total: number;
  byCampus: Record<ClubBranch, number>;
  kitante: number;
  najja: number;
};

export type MethodFigure = { key: string; label: string; count: number; total: number; share: number };

export type ClubReport = {
  termId: string | null;
  termLabel: string;
  isCurrent: boolean;
  generatedOn: string;
  summary: ClubFigure;
  campuses: ClubFigure[];
  clubs: ClubFigure[];
  /** Per-branch club standing (income by pupil campus, spend by club catalogue campus). */
  clubsByCampus: Record<ClubBranch, ClubFigure[]>;
  categories: ClubFigure[];
  sections: ClubFigure[];
  classes: ClubFigure[];
  methods: MethodFigure[];
  terms: TermFigure[];
  months: MonthFigure[];
  online: number;
  desk: number;
  expenditure: number;
  insights: string[];
};

type ConsentRow = { student_id: string; club_id: string; consented_at: string; withdrawn_at: string | null };
type PaymentRow = { student_id: string; club_id: string; term_id: string; amount: number; paid_on: string; method: string; source: string };
type ExpenseRow = { club_id: string; term_id: string; amount: number };
type ClubRow = { id: string; title: string; category: string | null; fee_amount: number | null; sort_order: number | null; campus?: string | null };
type PupilRow = { campus: string | null; class_code: string | null };

function emptyCampusMoney(): Record<ClubBranch, number> {
  return Object.fromEntries(CLUB_BRANCHES.map((branch) => [branch, 0])) as Record<ClubBranch, number>;
}

function collectionRate(collected: number, expected: number) {
  if (expected <= 0) return collected > 0 ? 100 : 0;
  return percent(collected, expected);
}

class Tally {
  consents = 0;
  paidCount = 0;
  expected = 0;
  collected = 0;
  expenditure = 0;
  pupils = new Set<string>();

  add(studentId: string, expected: number, collected: number) {
    if (expected <= 0 && collected <= 0) return;
    this.consents += 1;
    this.expected += expected;
    this.collected += collected;
    if (collected > 0) this.paidCount += 1;
    this.pupils.add(studentId);
  }

  addSpend(amount: number) {
    if (amount <= 0) return;
    this.expenditure += amount;
  }

  freeze(key: string, label: string): ClubFigure {
    return {
      key,
      label,
      consents: this.consents,
      pupils: this.pupils.size,
      paidCount: this.paidCount,
      expected: this.expected,
      collected: this.collected,
      expenditure: this.expenditure,
      balance: this.collected - this.expenditure,
      due: Math.max(0, this.expected - this.collected),
      rate: collectionRate(this.collected, this.expected),
    };
  }
}

function dayOf(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10) : "";
}

function overlaps(consent: ConsentRow, term: Term) {
  const start = term.starts_on;
  const end = term.ends_on;
  if (!start && !end) return Boolean(term.is_current) && !consent.withdrawn_at;
  const consented = dayOf(consent.consented_at);
  const endDay = end || "9999-12-31";
  const startDay = start || consented;
  if (consented > endDay) return false;
  if (!consent.withdrawn_at) return true;
  return dayOf(consent.withdrawn_at) >= startDay;
}

function monthKeys(count: number, today: string) {
  const [year, month] = today.split("-").map(Number);
  const keys: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    keys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

function monthParts(key: string) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return {
    label: date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    sub: String(year).slice(2),
  };
}

function pupilLevel(code: string | null) {
  const found = SCHOOL_CLASSES.find((entry) => entry.code === code);
  if (!found) return "Class not set";
  return found.section === "nursery" ? "Nursery" : "Primary";
}

function chartTerm(term: Term) {
  return `T${term.term}`;
}

/** Explicit Kitante vs Najjanankumbi differences for UI and PDF callouts. */
export function campusCompareDeltas(campuses: ClubFigure[]): string[] {
  if (campuses.length < 2) return [];
  const [a, b] = campuses;
  const lines: string[] = [];
  if (a.collected === b.collected) {
    if (a.collected > 0) lines.push(`${a.label} and ${b.label} have collected the same amount.`);
  } else {
    const lead = a.collected >= b.collected ? a : b;
    const other = lead === a ? b : a;
    lines.push(`${lead.label} has collected ${ugx(lead.collected - other.collected)} more than ${other.label}.`);
  }
  if (a.rate !== b.rate && (a.expected > 0 || b.expected > 0)) {
    const better = a.rate >= b.rate ? a : b;
    const other = better === a ? b : a;
    const gap = Math.abs(a.rate - b.rate);
    lines.push(`${better.label} collects at ${better.rate}% vs ${other.label} at ${other.rate}% (${gap} points ahead).`);
  }
  if (a.due !== b.due && (a.due > 0 || b.due > 0)) {
    const heavier = a.due >= b.due ? a : b;
    const other = heavier === a ? b : a;
    lines.push(`${heavier.label} still has ${ugx(heavier.due - other.due)} more outstanding than ${other.label}.`);
  }
  if (a.expenditure !== b.expenditure && (a.expenditure > 0 || b.expenditure > 0)) {
    const heavier = a.expenditure >= b.expenditure ? a : b;
    const other = heavier === a ? b : a;
    lines.push(`${heavier.label} has spent ${ugx(heavier.expenditure - other.expenditure)} more than ${other.label}.`);
  }
  if (a.balance !== b.balance) {
    const stronger = a.balance >= b.balance ? a : b;
    const other = stronger === a ? b : a;
    lines.push(`${stronger.label} holds a ${ugx(stronger.balance - other.balance)} stronger balance than ${other.label}.`);
  }
  return lines;
}

function insights(report: Omit<ClubReport, "insights">): string[] {
  const lines: string[] = [];
  const ranked = [...report.campuses].sort((a, b) => b.collected - a.collected);
  const [lead, second] = ranked;
  if (lead && second && lead.collected + second.collected > 0) {
    if (lead.collected === second.collected) {
      lines.push(`${lead.label} and ${second.label} have collected the same amount this term.`);
    } else {
      lines.push(`${lead.label} has collected ${ugx(lead.collected - second.collected)} more than ${second.label}.`);
    }
    if (lead.rate !== second.rate && (lead.expected > 0 || second.expected > 0)) {
      const better = lead.rate >= second.rate ? lead : second;
      lines.push(`${better.label} is collecting a higher share of what was expected, at ${better.rate}%.`);
    }
    const whole = report.campuses.reduce((sum, row) => sum + row.collected, 0);
    if (whole > 0) {
      lines.push(`${lead.label} accounts for ${percent(lead.collected, whole)}% of club income collected this term.`);
    }
  }
  const dueRanked = [...report.campuses].sort((a, b) => b.due - a.due);
  if (dueRanked[0] && dueRanked[1] && dueRanked[0].due > dueRanked[1].due && dueRanked[0].due > 0) {
    lines.push(`${dueRanked[0].label} carries ${ugx(dueRanked[0].due - dueRanked[1].due)} more still due than ${dueRanked[1].label}.`);
  }
  const spendRanked = [...report.campuses].sort((a, b) => b.expenditure - a.expenditure);
  if (spendRanked[0] && spendRanked[1] && spendRanked[0].expenditure > spendRanked[1].expenditure && spendRanked[0].expenditure > 0) {
    lines.push(`${spendRanked[0].label} has spent ${ugx(spendRanked[0].expenditure - spendRanked[1].expenditure)} more than ${spendRanked[1].label}.`);
  }
  const balanceRanked = [...report.campuses].sort((a, b) => b.balance - a.balance);
  if (balanceRanked[0] && balanceRanked[1] && balanceRanked[0].balance !== balanceRanked[1].balance) {
    lines.push(`${balanceRanked[0].label} holds the stronger campus balance at ${ugx(balanceRanked[0].balance)}.`);
  }
  for (const branch of CLUB_BRANCHES) {
    const leader = (report.clubsByCampus[branch] || []).find((club) => club.collected > 0);
    if (leader) lines.push(`At ${branch}, ${leader.label} leads with ${ugx(leader.collected)} collected.`);
  }
  const best = report.clubs.find((club) => club.collected > 0);
  if (best) lines.push(`${best.label} leads the clubs overall, with ${ugx(best.collected)} collected.`);
  const weakest = [...report.clubs].filter((club) => club.consents > 0 && club.due > 0).sort((a, b) => a.rate - b.rate || b.due - a.due)[0];
  if (weakest) lines.push(`${weakest.label} still has ${ugx(weakest.due)} to collect, the widest gap among the clubs.`);
  const index = report.terms.findIndex((term) => term.key === report.termId);
  const previous = index > 0 ? report.terms[index - 1] : null;
  if (previous) {
    const diff = report.summary.collected - previous.collected;
    if (diff === 0) lines.push(`Collections match ${previous.label}.`);
    else if (diff > 0) lines.push(`Collections are ${ugx(diff)} ahead of ${previous.label}.`);
    else lines.push(`Collections are ${ugx(-diff)} behind ${previous.label}.`);
  }
  if (report.methods[0] && report.summary.collected > 0) {
    lines.push(`${report.methods[0].label} is the leading payment method at ${report.methods[0].share}% of receipts.`);
  }
  if (report.online || report.desk) {
    const channel = report.online >= report.desk ? "online" : "at the desk";
    const amount = report.online >= report.desk ? report.online : report.desk;
    lines.push(`${ugx(amount)} was paid ${channel} this term.`);
  }
  if (report.expenditure > 0) {
    lines.push(`Clubs spent ${ugx(report.expenditure)} this term, leaving a balance of ${ugx(report.summary.balance)}.`);
    const heavy = [...report.clubs].filter((club) => club.expenditure > 0).sort((a, b) => b.expenditure - a.expenditure)[0];
    if (heavy) lines.push(`${heavy.label} leads spending at ${ugx(heavy.expenditure)}.`);
  }
  if (report.summary.consents > 0 && report.summary.due === 0) lines.push("Every consent counted for this term has been paid.");
  return lines.slice(0, 8);
}

export function assembleClubReport(input: {
  terms: Term[];
  selectedId: string | null;
  clubs: ClubRow[];
  consents: ConsentRow[];
  payments: PaymentRow[];
  expenses?: ExpenseRow[];
  students: Map<string, PupilRow>;
  today?: string;
}): ClubReport {
  const today = input.today ?? kampalaToday();
  const selected = input.terms.find((term) => term.id === input.selectedId) ?? input.terms.find((term) => term.is_current) ?? input.terms[0] ?? null;
  const chronological = [...input.terms].sort((a, b) => a.year - b.year || a.term - b.term);
  const clubById = new Map(input.clubs.map((club) => [club.id, club]));
  const payKey = (studentId: string, clubId: string, termId: string) => `${studentId}:${clubId}:${termId}`;
  const payments = new Map(input.payments.map((row) => [payKey(row.student_id, row.club_id, row.term_id), row]));

  const branchOf = (studentId: string) => clubBranch(input.students.get(studentId)?.campus);

  type TermBucket = { all: Tally; byCampus: Record<ClubBranch, Tally> };
  const termTallies = new Map<string, TermBucket>();
  for (const term of chronological) {
    termTallies.set(term.id, {
      all: new Tally(),
      byCampus: Object.fromEntries(CLUB_BRANCHES.map((branch) => [branch, new Tally()])) as Record<ClubBranch, Tally>,
    });
  }
  const selectedClubs = new Map<string, Tally>();
  const selectedClubsByCampus = new Map<ClubBranch, Map<string, Tally>>(
    CLUB_BRANCHES.map((branch) => [branch, new Map<string, Tally>()]),
  );
  const selectedCategories = new Map<string, Tally>();
  const selectedSections = new Map<string, Tally>();
  const selectedClasses = new Map<string, Tally>();
  const selectedCampuses = new Map<ClubBranch, Tally>(CLUB_BRANCHES.map((branch) => [branch, new Tally()]));
  const selectedAll = new Tally();
  const counted = new Set<string>();

  const clubTallyAt = (branch: ClubBranch, clubId: string) => {
    const map = selectedClubsByCampus.get(branch)!;
    const existing = map.get(clubId);
    if (existing) return existing;
    const next = new Tally();
    map.set(clubId, next);
    return next;
  };

  const take = (term: Term, studentId: string, clubId: string, expected: number, collected: number) => {
    const branch = branchOf(studentId);
    if (!branch) return;
    const bucket = termTallies.get(term.id);
    if (!bucket) return;
    bucket.all.add(studentId, expected, collected);
    bucket.byCampus[branch].add(studentId, expected, collected);
    if (!selected || term.id !== selected.id) return;
    selectedAll.add(studentId, expected, collected);
    selectedCampuses.get(branch)?.add(studentId, expected, collected);
    const club = clubById.get(clubId);
    const clubTally = selectedClubs.get(clubId) ?? new Tally();
    clubTally.add(studentId, expected, collected);
    selectedClubs.set(clubId, clubTally);
    clubTallyAt(branch, clubId).add(studentId, expected, collected);
    const category = club?.category && CLUB_CATEGORIES.includes(club.category as (typeof CLUB_CATEGORIES)[number]) ? club.category : "Other";
    const categoryTally = selectedCategories.get(category) ?? new Tally();
    categoryTally.add(studentId, expected, collected);
    selectedCategories.set(category, categoryTally);
    const pupil = input.students.get(studentId);
    const level = pupilLevel(pupil?.class_code ?? null);
    const sectionTally = selectedSections.get(level) ?? new Tally();
    sectionTally.add(studentId, expected, collected);
    selectedSections.set(level, sectionTally);
    const classCode = String(pupil?.class_code || "").trim() || "unset";
    const classTally = selectedClasses.get(classCode) ?? new Tally();
    classTally.add(studentId, expected, collected);
    selectedClasses.set(classCode, classTally);
  };

  for (const term of chronological) {
    for (const consent of input.consents) {
      if (!overlaps(consent, term)) continue;
      const key = payKey(consent.student_id, consent.club_id, term.id);
      const payment = payments.get(key);
      const fee = Number(clubById.get(consent.club_id)?.fee_amount) || 0;
      const collected = payment ? Number(payment.amount) || 0 : 0;
      const expected = payment ? collected : fee;
      if (!branchOf(consent.student_id)) continue;
      counted.add(key);
      take(term, consent.student_id, consent.club_id, expected, collected);
    }
  }

  for (const payment of input.payments) {
    const key = payKey(payment.student_id, payment.club_id, payment.term_id);
    if (counted.has(key)) continue;
    const term = chronological.find((entry) => entry.id === payment.term_id);
    if (!term || !branchOf(payment.student_id)) continue;
    const amount = Number(payment.amount) || 0;
    take(term, payment.student_id, payment.club_id, amount, amount);
  }

  const spend = (term: Term, clubId: string, amount: number) => {
    if (amount <= 0) return;
    const bucket = termTallies.get(term.id);
    if (!bucket) return;
    bucket.all.addSpend(amount);
    const club = clubById.get(clubId);
    // Attribute spend to the club's catalogue campus (not pupil campus). All-campus clubs stay on totals only.
    const rawCampus = String(club?.campus ?? "").trim();
    const campusBranch =
      /^all\s*campuses$/i.test(rawCampus) ? null : clubBranch(club?.campus ?? null);
    if (campusBranch) bucket.byCampus[campusBranch].addSpend(amount);
    if (!selected || term.id !== selected.id) return;
    selectedAll.addSpend(amount);
    if (campusBranch) {
      selectedCampuses.get(campusBranch)?.addSpend(amount);
      clubTallyAt(campusBranch, clubId).addSpend(amount);
    }
    const clubTally = selectedClubs.get(clubId) ?? new Tally();
    clubTally.addSpend(amount);
    selectedClubs.set(clubId, clubTally);
    const category = club?.category && CLUB_CATEGORIES.includes(club.category as (typeof CLUB_CATEGORIES)[number]) ? club.category : "Other";
    const categoryTally = selectedCategories.get(category) ?? new Tally();
    categoryTally.addSpend(amount);
    selectedCategories.set(category, categoryTally);
  };

  for (const expense of input.expenses || []) {
    const term = chronological.find((entry) => entry.id === expense.term_id);
    if (!term) continue;
    spend(term, expense.club_id, Number(expense.amount) || 0);
  }

  const summary = selectedAll.freeze("all", selected?.label ?? "This term");
  const campuses = CLUB_BRANCHES.map((branch) => selectedCampuses.get(branch)!.freeze(branch, branch));
  const sortClubFigures = (rows: ClubFigure[]) =>
    rows.sort((a, b) => a.label.localeCompare(b.label) || b.collected - a.collected || b.rate - a.rate);
  const clubs = sortClubFigures(
    [...selectedClubs.entries()].map(([id, tally]) => tally.freeze(id, clubById.get(id)?.title || "Club")),
  );
  const clubsByCampus = Object.fromEntries(
    CLUB_BRANCHES.map((branch) => [
      branch,
      sortClubFigures(
        [...(selectedClubsByCampus.get(branch)?.entries() || [])]
          .map(([id, tally]) => tally.freeze(id, clubById.get(id)?.title || "Club"))
          .filter((row) => row.expected > 0 || row.collected > 0 || row.expenditure > 0),
      ),
    ]),
  ) as Record<ClubBranch, ClubFigure[]>;
  const categories = [...CLUB_CATEGORIES, "Other"]
    .filter((category) => selectedCategories.has(category))
    .map((category) => selectedCategories.get(category)!.freeze(category, category));
  const sections = ["Nursery", "Primary", "Class not set"]
    .filter((level) => selectedSections.has(level))
    .map((level) => selectedSections.get(level)!.freeze(level, level));
  const classOrder = new Map<string, number>(SCHOOL_CLASSES.map((entry, index) => [entry.code, index]));
  const classes = [...selectedClasses.entries()]
    .map(([code, tally]) => {
      const label = SCHOOL_CLASSES.find((entry) => entry.code === code)?.name || (code === "unset" ? "Class not set" : code);
      return tally.freeze(code, label);
    })
    .sort(
      (a, b) =>
        (classOrder.get(a.key) ?? 999) - (classOrder.get(b.key) ?? 999) ||
        b.collected - a.collected ||
        a.label.localeCompare(b.label),
    );

  const methodTotals = new Map<string, { count: number; total: number }>();
  let online = 0;
  let desk = 0;
  if (selected) {
    for (const payment of input.payments) {
      if (payment.term_id !== selected.id || !branchOf(payment.student_id)) continue;
      const amount = Number(payment.amount) || 0;
      const slot = methodTotals.get(payment.method) ?? { count: 0, total: 0 };
      slot.count += 1;
      slot.total += amount;
      methodTotals.set(payment.method, slot);
      if (payment.source === "online") online += amount;
      else desk += amount;
    }
  }
  const methodWhole = [...methodTotals.values()].reduce((sum, row) => sum + row.total, 0);
  const methods = [...methodTotals.entries()]
    .map(([key, row]) => ({ key, label: methodInfo(key).label, count: row.count, total: row.total, share: percent(row.total, methodWhole) }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  const terms: TermFigure[] = chronological.map((term) => {
    const bucket = termTallies.get(term.id)!;
    const byCampus = emptyCampusMoney();
    for (const branch of CLUB_BRANCHES) byCampus[branch] = bucket.byCampus[branch].collected;
    return {
      ...bucket.all.freeze(term.id, term.label),
      isCurrent: Boolean(term.is_current),
      chart: chartTerm(term),
      byCampus,
      kitante: byCampus.Kitante,
      najja: byCampus.Najjanankumbi,
    };
  });

  const spanYears = new Set(monthKeys(12, today).map((key) => key.slice(0, 4))).size > 1;
  const monthMap = new Map(monthKeys(12, today).map((key) => [key, { total: 0, byCampus: emptyCampusMoney() }]));
  for (const payment of input.payments) {
    const branch = branchOf(payment.student_id);
    const key = dayOf(payment.paid_on).slice(0, 7);
    const slot = branch ? monthMap.get(key) : undefined;
    if (!slot || !branch) continue;
    const amount = Number(payment.amount) || 0;
    slot.total += amount;
    slot.byCampus[branch] += amount;
  }
  const months: MonthFigure[] = [...monthMap.entries()].map(([key, row]) => {
    const parts = monthParts(key);
    return {
      key,
      label: parts.label,
      sub: spanYears ? parts.sub : "",
      total: row.total,
      byCampus: row.byCampus,
      kitante: row.byCampus.Kitante,
      najja: row.byCampus.Najjanankumbi,
    };
  });

  const base = {
    termId: selected?.id ?? null,
    termLabel: selected?.label ?? "No term",
    isCurrent: Boolean(selected?.is_current),
    generatedOn: today,
    summary,
    campuses,
    clubs,
    clubsByCampus,
    categories,
    sections,
    classes,
    methods,
    terms,
    months,
    online,
    desk,
    expenditure: summary.expenditure,
  };
  return { ...base, insights: insights(base) };
}

async function paged<T>(run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  const size = 1000;
  for (let from = 0; from < 20000; from += size) {
    const { data, error } = await run(from, from + size - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < size) break;
  }
  return rows;
}

export async function loadClubReport(
  supabase: SupabaseClient,
  terms: Term[],
  selectedId: string | null,
  campuses?: readonly string[] | null,
) {
  const [clubs, consents, payments, expensesResult] = await Promise.all([
    paged<ClubRow>((from, to) => supabase.from("clubs").select("id, title, category, fee_amount, sort_order, campus").not("guide_no", "is", null).order("sort_order").range(from, to)),
    paged<ConsentRow>((from, to) => supabase.from("club_consents").select("student_id, club_id, consented_at, withdrawn_at").order("consented_at").range(from, to)),
    paged<PaymentRow>((from, to) => supabase.from("club_payments").select("student_id, club_id, term_id, amount, paid_on, method, source").is("voided_at", null).order("paid_on").range(from, to)),
    paged<ExpenseRow>((from, to) =>
      supabase.from("club_expenses").select("club_id, term_id, amount").is("voided_at", null).order("spent_on").range(from, to),
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/club_expenses|does not exist|schema cache/i.test(message)) return [] as ExpenseRow[];
      throw error;
    }),
  ]);
  const studentIds = [...new Set([...consents.map((row) => row.student_id), ...payments.map((row) => row.student_id)])];
  const students = new Map<string, PupilRow>();
  for (let index = 0; index < studentIds.length; index += 200) {
    const slice = studentIds.slice(index, index + 200);
    const { data, error } = await supabase.from("students").select("id, campus, class_code").in("id", slice);
    if (error) throw new Error(error.message);
    for (const row of data || []) students.set(row.id, { campus: row.campus, class_code: row.class_code });
  }

  const staffCampuses = campuses ?? null;
  const scopedStudents = new Map<string, PupilRow>();
  for (const [id, pupil] of students) {
    if (studentInFundsScope(pupil.campus, staffCampuses)) scopedStudents.set(id, pupil);
  }
  const scopedPayments = payments.filter((row) => scopedStudents.has(row.student_id));
  const scopedConsents = consents.filter((row) => scopedStudents.has(row.student_id));
  const clubCampus = new Map(clubs.map((club) => [club.id, club.campus]));
  const scopedExpenses = expensesResult.filter((row) =>
    clubInFundsScope(clubCampus.get(row.club_id) ?? null, staffCampuses),
  );

  return assembleClubReport({
    terms,
    selectedId,
    clubs,
    consents: scopedConsents,
    payments: scopedPayments,
    expenses: scopedExpenses,
    students: scopedStudents,
  });
}
