import type { Metadata } from "next";
import "../admin/admin.css";
import "../admin/(panel)/applications/applications.css";
import "../admissions_office/office.css";
import "./accounts.css";

export const metadata: Metadata = {
  title: { default: "Accounts office", template: "%s | KJA Accounts" },
  robots: { index: false, follow: false },
};

export default function AccountsRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="kja-admin kja-office kja-accounts">{children}</div>;
}
