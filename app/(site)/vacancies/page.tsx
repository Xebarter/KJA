import { Banner, Prose } from "@/components/site/Views";
import { findBySlug, getContent } from "@/lib/content";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Vacancies" };

export default async function VacanciesPage() {
  const content = await getContent();
  const intro = findBySlug(content.pages, "vacancies");
  return (
    <main>
      <Banner title="Staff Vacancies" />
      <div className="container py-5">
        <Prose html={intro?.body} />
        {content.vacancies.length ? content.vacancies.map((vacancy) => (
          <article className="mb-4" key={vacancy.id || vacancy.title}>
            <h3>{vacancy.title}</h3>
            {vacancy.location ? <p>{vacancy.location}</p> : null}
            {vacancy.closes_on ? <p>Closes {formatDate(vacancy.closes_on)}</p> : null}
            <Prose html={vacancy.body} />
          </article>
        )) : <p>There are no open vacancies right now. Send a speculative application through the contact page.</p>}
      </div>
    </main>
  );
}
