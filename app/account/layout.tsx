import type { Metadata } from "next";
import "./account.css";

export const metadata: Metadata = {
  title: { default: "Parent portal", template: "%s | KJA Parent portal" },
  robots: { index: false, follow: false },
};

export default function AccountRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="kja-account">{children}</div>;
}
