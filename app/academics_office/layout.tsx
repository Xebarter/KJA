import type { Metadata } from "next";
import "../admin/admin.css";
import "../admin/(panel)/applications/applications.css";
import "../admissions_office/office.css";
import "./academics.css";
import "./(desk)/overview.css";

export const metadata: Metadata = {
  title: { default: "Academics office", template: "%s | KJA Academics" },
  robots: { index: false, follow: false },
};

export default function AcademicsRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="kja-admin kja-office acd-page">{children}</div>;
}
