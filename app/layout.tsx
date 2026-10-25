import type { Metadata } from "next";
import "./kja.css";

export const metadata: Metadata = {
  title: { default: "Kampala Junior Academy", template: "%s | Kampala Junior Academy" },
  description: "We offer a nurturing environment focused on holistic growth, early learning, and community values. Enroll your child today for a bright future!",
  icons: { icon: "/images/icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Local fonts + icons so Desktop (and hard reloads) stay intact offline. */}
        <link rel="stylesheet" href="/vendor/fontawesome/css/all.min.css" />
        <link rel="stylesheet" href="/css/fonts.css" />
        <link rel="stylesheet" href="/css/main.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
