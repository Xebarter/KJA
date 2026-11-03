import type { Metadata } from "next";
import "../admin/admin.css";
import "../admin/(panel)/applications/applications.css";
import "../admissions_office/office.css";
import "./store.css";

export const metadata: Metadata = {
  title: { default: "Store", template: "%s | KJA Store" },
  robots: { index: false, follow: false },
};

export default function StoreRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="kja-admin kja-office kja-store">{children}</div>;
}
