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
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Yantramanav:wght@400;500;700&display=swap" />
        <link rel="stylesheet" href="/css/main.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
