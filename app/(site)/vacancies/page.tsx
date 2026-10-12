import { notFound } from "next/navigation";
import { Prose } from "@/components/site/Views";
import { WpPageView } from "@/components/site/WpPageView";
import { findBySlug, getContent } from "@/lib/content";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Vacancies" };

export default async function VacanciesPage() {
  const content = await getContent();
  const page = findBySlug(content.pages, "vacancies");
  if (!page) notFound();
  return (
    <WpPageView page={page} news={content.news} events={content.events}>
      {content.vacancies.map((vacancy) => (
        <article className="mb-4" key={vacancy.id || vacancy.title}>
          <h3>{vacancy.title}</h3>
          {vacancy.location ? <p>{vacancy.location}</p> : null}
          {vacancy.closes_on ? <p>Closes {formatDate(vacancy.closes_on)}</p> : null}
          <Prose html={vacancy.body} />
        </article>
      ))}
    </WpPageView>
  );
}
