export const STORE_BASE = "/store";

export type StoreBadge = "low" | "requisitions";

export type StoreNavItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
  badge?: StoreBadge;
};

export const storeNav: StoreNavItem[] = [
  { href: STORE_BASE, label: "Overview", icon: "fa-gauge-high", group: "Desk" },
  { href: `${STORE_BASE}/items`, label: "Items", icon: "fa-boxes-stacked", group: "Catalogue" },
  { href: `${STORE_BASE}/stock`, label: "Stock", icon: "fa-warehouse", group: "Stock", badge: "low" },
  { href: `${STORE_BASE}/adjustments`, label: "Adjustments", icon: "fa-sliders", group: "Stock" },
  { href: `${STORE_BASE}/issues`, label: "Issues", icon: "fa-hand-holding", group: "Issue desk" },
  { href: `${STORE_BASE}/suppliers`, label: "Suppliers", icon: "fa-truck-field", group: "Supply" },
  { href: `${STORE_BASE}/purchases`, label: "Purchases", icon: "fa-dolly", group: "Supply" },
  { href: `${STORE_BASE}/requisitions`, label: "Requisitions", icon: "fa-file-invoice", group: "Ordering", badge: "requisitions" },
  { href: `${STORE_BASE}/reports`, label: "Reports", icon: "fa-chart-column", group: "Insights" },
  { href: `${STORE_BASE}/settings`, label: "Settings", icon: "fa-gear", group: "Setup" },
];
