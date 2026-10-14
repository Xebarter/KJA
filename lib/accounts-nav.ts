export const ACCOUNTS_BASE = "/accounts";

/** Roles that may use the accounts office. Admins can use everything. */
export const ACCOUNTS_ROLES = ["admin", "accounts"] as const;

export function isAccountsRole(role: string | null | undefined) {
  return ACCOUNTS_ROLES.includes(role as (typeof ACCOUNTS_ROLES)[number]);
}

export type AccountsBadge = "expenses" | "drafts";

export type AccountsNavItem = { href: string; label: string; icon: string; group: string; badge?: AccountsBadge };

export const accountsNav: AccountsNavItem[] = [
  { href: ACCOUNTS_BASE, label: "Overview", icon: "fa-gauge-high", group: "Office" },
  { href: `${ACCOUNTS_BASE}/students`, label: "Fee accounts", icon: "fa-children", group: "Billing" },
  { href: `${ACCOUNTS_BASE}/invoices`, label: "Invoices", icon: "fa-file-invoice", group: "Billing", badge: "drafts" },
  { href: `${ACCOUNTS_BASE}/payments`, label: "Payments", icon: "fa-money-bill-wave", group: "Billing" },
  { href: `${ACCOUNTS_BASE}/debtors`, label: "Debtors", icon: "fa-hand-holding-dollar", group: "Billing" },
  { href: `${ACCOUNTS_BASE}/expenses`, label: "Expenses", icon: "fa-receipt", group: "Spending", badge: "expenses" },
  { href: `${ACCOUNTS_BASE}/reports`, label: "Reports", icon: "fa-chart-column", group: "Insights" },
  { href: `${ACCOUNTS_BASE}/settings`, label: "Fee setup", icon: "fa-sliders", group: "Setup" },
];
