import type { Metadata } from "next";
import "../admin/admin.css";
import "../admin/(panel)/applications/applications.css";
import "./office.css";

export const metadata: Metadata = {
  title: { default: "Admissions office", template: "%s | KJA Admissions" },
  robots: { index: false, follow: false },
};

export default function OfficeRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="kja-admin kja-office">{children}</div>;
}
