import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "KJA Admin", template: "%s | KJA Admin" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="kja-admin">{children}</div>;
}
