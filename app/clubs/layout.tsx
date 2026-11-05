import type { Metadata } from "next";
import "../admin/admin.css";
import "../admin/(panel)/applications/applications.css";
import "../admissions_office/office.css";
import "../accounts/accounts.css";
import "./clubs.css";
import "./desk.css";

export const metadata: Metadata = {
  title: { default: "Clubs", template: "%s | KJA Clubs" },
  robots: { index: false, follow: false },
};

export default function ClubsRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="kja-admin kja-office kja-clubs">{children}</div>;
}
