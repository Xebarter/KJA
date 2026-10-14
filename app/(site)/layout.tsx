import { Suspense } from "react";
import Script from "next/script";
import { AuthDialogProvider } from "@/components/account/AuthDialog";
import { AdmissionsPopup } from "@/components/site/Popup";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { ThemeEffects } from "@/components/site/HomeMotion";
import { getContent } from "@/lib/content";
import "@/app/account/account.css";

/* Pages are served from the cache and rebuilt in the background at most every five minutes; content edits
   in the admin refresh them immediately through refreshSite(). Keep in step with SITE_REVALIDATE. */
export const revalidate = 300;

const CAMPUS_ORDER = ["kitante", "najjanankumbi", "makindye", "bunga"];

/* WordPress's emoji loader: browsers that fail its canvas tests get Twemoji images instead of native emoji. */
const EMOJI_SETTINGS = {
  baseUrl: "https://s.w.org/images/core/emoji/17.0.2/72x72/",
  ext: ".png",
  svgUrl: "https://s.w.org/images/core/emoji/17.0.2/svg/",
  svgExt: ".svg",
  source: { concatemoji: "/js/wp-emoji-release.min.js" },
};

function rank(slug: string) {
  const index = CAMPUS_ORDER.indexOf(slug);
  return index === -1 ? CAMPUS_ORDER.length : index;
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const content = await getContent();
  const { settings } = content;
  const campuses = [...content.campuses]
    .sort((a, b) => rank(a.slug) - rank(b.slug))
    .map(({ title, slug }) => ({ title, slug }));
  return (
    <Suspense>
      <AuthDialogProvider>
        <div id="page" className="site">
          <Header
            campuses={campuses}
            socials={settings.socials}
            phone={settings.phone}
            email={settings.email}
            address={settings.address}
            mapUrl={settings.map_url}
          />
          {children}
          <Footer
            phone={settings.phone}
            email={settings.email}
            address={settings.address}
            mapUrl={settings.map_url}
            footerText={settings.footer_text}
            socials={settings.socials}
          />
          <a href="#page" id="scroll-top" aria-label="Back to top"><i className="fas fa-arrow-up" /></a>
          {settings.popup_enabled ? (
            <AdmissionsPopup title={settings.popup_title} body={settings.popup_body} label={settings.popup_cta_label} href={settings.popup_cta_href} />
          ) : null}
          <ThemeEffects />
          <script id="wp-emoji-settings" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(EMOJI_SETTINGS) }} />
          <Script src="/js/wp-emoji-loader.min.js" type="module" strategy="lazyOnload" />
        </div>
      </AuthDialogProvider>
    </Suspense>
  );
}
