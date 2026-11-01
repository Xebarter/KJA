import type { Metadata } from "next";
import "../admin/admin.css";
import "../admin/(panel)/applications/applications.css";
import "../admissions_office/office.css";
import "./library.css";

export const metadata: Metadata = {
  title: { default: "Library", template: "%s | KJA Library" },
  robots: { index: false, follow: false },
};

export default function LibraryRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="kja-admin kja-office kja-library">{children}</div>;
}
