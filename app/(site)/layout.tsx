import { AdmissionsPopup } from "@/components/site/Popup";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { getContent } from "@/lib/content";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const content = await getContent();
  const { settings } = content;
  return (
    <div id="page" className="site">
      <Header
        campuses={content.campuses}
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
      <a href="#page" id="scroll-top"><i className="far fa-arrow-up-from-arc" /></a>
      {settings.popup_enabled ? (
        <AdmissionsPopup title={settings.popup_title} body={settings.popup_body} label={settings.popup_cta_label} href={settings.popup_cta_href} />
      ) : null}
    </div>
  );
}
