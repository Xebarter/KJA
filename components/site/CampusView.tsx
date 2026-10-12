import Link from "next/link";
import { Hero } from "@/components/site/Hero";
import type { CampusPage, CampusSectionBlock } from "@/lib/campus-pages";

const html = (value: string) => ({ __html: value });

function Section({ section }: { section: CampusSectionBlock }) {
  switch (section.kind) {
    case "welcome":
      return (
        <div className="campus-tour pt-120 pb-10">
          <div className="container">
            <div className="row align-items-center">
              <div className="col-lg-6">
                <div className="content-info wow fadeInUp" data-wow-delay=".25s">
                  <div className="site-heading mb-3">
                    <h2 className="site-title" dangerouslySetInnerHTML={html(section.title_html)} />
                  </div>
                  <div dangerouslySetInnerHTML={html(section.body_html)} />
                </div>
              </div>
              <div className="col-lg-6">
                <div className="content-img wow fadeInRight" data-wow-delay=".25s">
                  {section.image_url ? <img src={section.image_url} alt="" /> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case "clubs":
      return (
        <div className="portfolio-area pt-120">
          <div className="container">
            <div className="row">
              <div className="col-lg-10 mx-auto">
                <div className="site-heading text-center">
                  <h2 className="site-title" dangerouslySetInnerHTML={html(section.title_html)} />
                  <div dangerouslySetInnerHTML={html(section.intro_html)} />
                </div>
              </div>
            </div>
            <div className="row g-4 gx-3">
              {section.items.map((item) => (
                <div className="col-md-4" key={item.href}>
                  <div className="portfolio-item h-100">
                    <div className="portfolio-img">
                      <img style={{ minHeight: 440, objectFit: "cover" }} src={item.image_url} alt="" />
                    </div>
                    <div className="portfolio-content">
                      <div className="portfolio-info gap-3">
                        <div className="portfolio-title-info">
                          <Link href={item.href}>
                            <h4 className="portfolio-title">{item.title}</h4>
                          </Link>
                        </div>
                        <Link href={item.href} className="portfolio-btn" aria-label={item.title}>
                          <i className="fas fa-arrow-right" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case "facilities":
      return (
        <div className="facility-area pt-120 pb-10">
          <div className="container">
            <div className="row">
              <div className="col-lg-6 mx-auto">
                <div className="site-heading text-center">
                  <h2 className="site-title" dangerouslySetInnerHTML={html(section.title_html)} />
                </div>
              </div>
            </div>
            <div className="row g-4 gx-3">
              {section.items.map((item) => (
                <div className="col-md-6 col-lg-4" key={item.href}>
                  <div className="facility-item wow fadeInUp h-100" data-wow-delay=".25s">
                    <div className="facility-img">
                      <img src={item.image_url} alt="" />
                    </div>
                    <div className="facility-content d-flex flex-column justify-content-between">
                      <div>
                        <h3 className="facility-title">
                          <Link href={item.href}>{item.title}</Link>
                        </h3>
                      </div>
                      <div className="facility-arrow">
                        <Link href={item.href} className="kja-btn">
                          Read More<i className="fas fa-arrow-right-long" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case "culture":
      return (
        <div className="campus-life pt-120 pb-80">
          <div className="container">
            <div className="row align-items-center">
              <div className="col-lg-6">
                <div className="content-img wow fadeInLeft" data-wow-delay=".25s">
                  {section.image_url ? <img src={section.image_url} alt="" /> : null}
                </div>
              </div>
              <div className="col-lg-6">
                <div className="content-info wow fadeInUp" data-wow-delay=".25s">
                  <div className="site-heading mb-3">
                    <span className="site-title-tagline">
                      <i className="fas fa-people-group" /> Campus Culture
                    </span>
                    <h2 className="site-title" dangerouslySetInnerHTML={html(section.title_html)} />
                  </div>
                  <div className="content-text">
                    {section.body_html ? <div dangerouslySetInnerHTML={html(section.body_html)} /> : null}
                    <div className="campus-life-info mt-3">
                      <span>
                        <strong>{section.ratio_label} </strong>
                      </span>{" "}
                      {section.ratio_value}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case "details":
      return (
        <div className={`campus-life-details ${section.padding}`}>
          <div className={section.title_html ? "container d-flex flex-column align-items-center" : "container"}>
            {section.title_html ? (
              <h2 className={section.title_class ?? undefined} dangerouslySetInnerHTML={html(section.title_html)} />
            ) : null}
            {section.intro ? <p className="text-center mb-5 w-100">{section.intro}</p> : null}
            <div className="details-wrapper">
              <div className="row">
                {section.image_url ? (
                  <div className="col-lg-12">
                    <div className="details-item">
                      <img src={section.image_url} alt="" />
                    </div>
                  </div>
                ) : null}
                {section.items.map((item) => (
                  <div className="col-lg-6" key={item.title}>
                    <div className="details-item h-100">
                      <h3 className="mb-3">{item.title}</h3>
                      <div dangerouslySetInnerHTML={html(item.body_html)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
  }
}

export function CampusView({ page, slideTitle }: { page: CampusPage; slideTitle: string }) {
  return (
    <>
      <Hero slides={page.hero_images.map((image_url) => ({ image_url, title: slideTitle }))} />
      <div id="content" className="site-content container pt-3 pb-5">
        <div id="primary" className="content-area">
          <div className="row mt-4">
            <div className="col-md-12">
              <main id="main">
                {page.sections.map((section, index) => (
                  <Section section={section} key={`${section.kind}-${index}`} />
                ))}
                {page.closing_html ? (
                  <div className="entry-content kja-entry-content" dangerouslySetInnerHTML={html(page.closing_html)} />
                ) : null}
              </main>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
