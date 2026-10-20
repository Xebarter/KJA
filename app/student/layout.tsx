import type { Metadata } from "next";
import "../account/account.css";
import "./student.css";

export const metadata: Metadata = {
  title: { default: "Student portal", template: "%s | KJA Student portal" },
  robots: { index: false, follow: false },
};

export default function StudentRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="kja-account kja-student">{children}</div>;
}
