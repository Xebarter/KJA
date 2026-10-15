import { AuthDialogProvider } from "@/components/account/AuthDialog";
import { AdmissionsPopup } from "@/components/site/Popup";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { ThemeEffects } from "@/components/site/HomeMotion";
import { getContent } from "@/lib/content";

/* Pages are served from the cache and rebuilt in the background at most every five minutes; content edits
   in the admin refresh them immediately through refreshSite(). Keep in step with SITE_REVALIDATE. */
export const revalidate = 300;

const CAMPUS_ORDER = ["kitante", "najjanankumbi", "makindye", "bunga"];

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
      </div>
    </AuthDialogProvider>
  );
}
