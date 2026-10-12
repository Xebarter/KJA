import type { Metadata } from "next";
import "./kja.css";

export const metadata: Metadata = {
  title: { default: "Kampala Junior Academy", template: "%s | Kampala Junior Academy" },
  description: "We offer a nurturing environment focused on holistic growth, early learning, and community values. Enroll your child today for a bright future!",
  icons: { icon: "/images/icon.png" },
};

// The Events Calendar sizes its views with container breakpoint classes; applying them as soon as a view
// enters the DOM avoids painting the mobile layout first.
const TEC_BREAKPOINTS = `(function(){var b={xsmall:500,medium:768,full:960},d=new WeakSet();function s(){document.querySelectorAll('[data-js="tribe-events-view"]').forEach(function(e){if(d.has(e))return;d.add(e);var w=e.offsetWidth;for(var k in b)e.classList.toggle("tribe-common--breakpoint-"+k,w>=b[k]);});}new MutationObserver(s).observe(document.documentElement,{childList:true,subtree:true});})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEC_BREAKPOINTS }} />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700&family=Roboto:wght@300;400;500;700&family=Yantramanav:wght@400;500;700&display=swap" />
        <link rel="stylesheet" href="/css/animate.min.css" />
        <link rel="stylesheet" href="/css/main.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
