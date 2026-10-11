import Link from "next/link";
import { Banner } from "@/components/site/Views";
import { getContent } from "@/lib/content";
import type { Article } from "@/lib/types";

export const metadata = { title: "Search" };

function matches(item: Article, query: string) {
  const haystack = `${item.title} ${item.excerpt || ""} ${item.body || ""}`.toLowerCase();
  return haystack.includes(query);
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = q.trim().toLowerCase();
  const content = await getContent();
  const groups: { label: string; href: (item: Article) => string; items: Article[] }[] = [
    { label: "Pages", href: (item) => `/${item.slug}`, items: content.pages },
    { label: "Campuses", href: (item) => `/branch/${item.slug}`, items: content.campuses },
    { label: "News", href: (item) => `/news/${item.slug}`, items: content.news },
    { label: "Blog", href: (item) => `/blog/${item.slug}`, items: content.posts },
    { label: "Events", href: (item) => `/event/${item.slug}`, items: content.events },
    { label: "Teachers", href: (item) => `/teacher/${item.slug}`, items: content.teachers },
  ];
  const results = query ? groups.flatMap((group) => group.items.filter((item) => matches(item, query)).map((item) => ({ ...item, href: group.href(item), group: group.label }))) : [];
  return (
    <main>
      <Banner title="Search" />
      <div className="container py-5">
        <form action="/search" className="mb-4 d-flex gap-2">
          <input className="form-control" name="q" defaultValue={q} placeholder="Search the site" />
          <button className="kja-btn" type="submit">Search</button>
        </form>
        {query ? <p>{results.length} result{results.length === 1 ? "" : "s"} for “{q}”.</p> : <p>Type a word to search pages, campuses, news, events, and teachers.</p>}
        <ul>
          {results.map((item) => (
            <li key={item.href} className="mb-2"><Link href={item.href}>{item.title}</Link> <small>({item.group})</small></li>
          ))}
        </ul>
      </div>
    </main>
  );
}
