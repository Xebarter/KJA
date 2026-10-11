import Link from "next/link";
import { NewsletterForm } from "@/components/site/Forms";
import type { Social } from "@/lib/types";

export function Footer({ phone, email, address, mapUrl, footerText, socials }: {
  phone: string;
  email: string;
  address: string;
  mapUrl: string;
  footerText: string;
  socials: Social[];
}) {
  const year = new Date().getFullYear();
  return (
    <footer id="footer" className="footer-area bootscore-footer">
      <div className="footer-shape"><img src="/images/03.png" alt="" /></div>
      <div className="footer-widget">
        <div className="container">
          <div className="row footer-widget-wrapper pt-100 pb-70">
            <div className="col-md-6 col-lg-4">
              <div className="footer-widget-box about-us">
                <Link href="/" className="footer-logo"><img src="/images/kja-logo-transparent.png" alt="KJA" /></Link>
                <p className="mb-3">{footerText}</p>
                <ul className="footer-contact">
                  <li><a href={`tel:${phone.replace(/\s/g, "")}`}><i className="fa fa-phone" />{phone}</a></li>
                  <li><a href={mapUrl} target="_blank" rel="noreferrer"><i className="fa fa-location-dot" />{address}</a></li>
                  <li><a href={`mailto:${email}`}><i className="fa fa-envelope" />{email}</a></li>
                </ul>
              </div>
            </div>
            <div className="col-md-6 col-lg-2">
              <div className="footer-widget-box list">
                <h4 className="footer-widget-title">Quick Links</h4>
                <ul className="footer-list">
                  <li><Link href="/about-us"><i className="fas fa-caret-right" /> About Us</Link></li>
                  <li><Link href="/gallery"><i className="fas fa-caret-right" /> Gallery</Link></li>
                  <li><Link href="/privacy-policy"><i className="fas fa-caret-right" /> Privacy policy</Link></li>
                  <li><Link href="/news"><i className="fas fa-caret-right" /> News</Link></li>
                  <li><Link href="/admin"><i className="fas fa-caret-right" /> Admin Login</Link></li>
                </ul>
              </div>
            </div>
            <div className="col-md-6 col-lg-3">
              <div className="footer-widget-box list">
                <h4 className="footer-widget-title">Quick Links</h4>
                <ul className="footer-list">
                  <li><Link href="/alumni-photo-gallery"><i className="fas fa-caret-right" /> Alumni Photo Gallery</Link></li>
                  <li><Link href="/contact-us"><i className="fas fa-caret-right" /> Contact us</Link></li>
                  <li><Link href="/from-the-director"><i className="fas fa-caret-right" /> From the Director</Link></li>
                </ul>
              </div>
            </div>
            <div className="col-md-6 col-lg-3">
              <div className="footer-widget-box list">
                <h4 className="footer-widget-title">Newsletter</h4>
                <NewsletterForm />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="copyright">
        <div className="container">
          <div className="copyright-wrapper">
            <div className="row">
              <div className="col-md-6 align-self-center">
                <p className="copyright-text">© Copyright {year} <Link href="/"> KJA </Link> All Rights Reserved.</p>
              </div>
              <div className="col-md-6 align-self-center">
                <ul className="footer-social">
                  {socials.map((social) => (
                    <li key={social.href}><a href={social.href} target="_blank" rel="noreferrer" aria-label={social.label}><i className={`fab fa-${social.icon}`} /></a></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
