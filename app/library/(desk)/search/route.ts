import { NextResponse } from "next/server";
import { type LibraryBorrowerHit, type LibraryCopyHit, type LibraryTitleHit } from "@/lib/library";
import { requireLibrary } from "@/lib/library-access";
import { everyWord, searchNeedle, searchWords } from "@/lib/students";

export type { LibraryBorrowerHit, LibraryCopyHit, LibraryTitleHit };

type SearchKind = "pupil" | "teacher" | "title" | "copy";

function kindOf(raw: string | null): SearchKind {
  if (raw === "teacher" || raw === "title" || raw === "copy") return raw;
  return "pupil";
}

export async function GET(request: Request) {
  const auth = await requireLibrary();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error, rows: [] }, { status: 401 });
  }

  const url = new URL(request.url);
  const kind = kindOf(url.searchParams.get("kind"));
  const raw = (url.searchParams.get("q") || "").trim();
  const needle = searchNeedle(raw).slice(0, 60);
  const words = searchWords(raw);
  if (needle.length < 2 || !words.length) {
    return NextResponse.json({ rows: [] });
  }

  if (kind === "title") {
    const like = `%${needle}%`;
    const filter = [everyWord(words, ["title", "authors"]), `category.ilike.${like}`].join(",");
    const { data, error } = await auth.supabase
      .from("library_titles")
      .select("id, title, authors, category")
      .or(filter)
      .order("title")
      .limit(12);
    if (error) return NextResponse.json({ error: error.message, rows: [] as LibraryTitleHit[] });
    const rows: LibraryTitleHit[] = (data || []).map((row) => {
      const bits = [row.authors, row.category].map((value) => String(value || "").trim()).filter(Boolean);
      return {
        id: String(row.id),
        title: String(row.title || "Untitled"),
        meta: bits.join(" · ") || "Book",
      };
    });
    return NextResponse.json({ rows });
  }

  if (kind === "copy") {
    const like = `%${needle}%`;
    const libraryId = auth.activeLibrary;
    // Match titles by name/author/category, and also via accession/barcode on any copy.
    const [{ data: titleHits, error: titleError }, { data: codeHits, error: codeError }] = await Promise.all([
      auth.supabase
        .from("library_titles")
        .select("id, title, authors, category")
        .or([everyWord(words, ["title", "authors"]), `category.ilike.${like}`].join(","))
        .order("title")
        .limit(24),
      auth.supabase
        .from("library_items")
        .select("id, title_id, status, library_titles(id, title, authors, category)")
        .eq("library_id", libraryId)
        .neq("status", "withdrawn")
        .or(`accession.ilike.${like},barcode.ilike.${like},location_note.ilike.${like}`)
        .limit(24),
    ]);
    if (titleError) return NextResponse.json({ error: titleError.message, rows: [] as LibraryCopyHit[] });
    if (codeError) return NextResponse.json({ error: codeError.message, rows: [] as LibraryCopyHit[] });

    type TitleInfo = { id: string; title: string; authors: string; category: string };
    const titles = new Map<string, TitleInfo>();
    for (const row of titleHits || []) {
      titles.set(String(row.id), {
        id: String(row.id),
        title: String(row.title || "Untitled"),
        authors: String(row.authors || ""),
        category: String(row.category || ""),
      });
    }
    for (const row of codeHits || []) {
      const related = row.library_titles as { id?: string; title?: string; authors?: string; category?: string } | null;
      const id = String(related?.id || row.title_id || "");
      if (!id || titles.has(id)) continue;
      titles.set(id, {
        id,
        title: String(related?.title || "Untitled"),
        authors: String(related?.authors || ""),
        category: String(related?.category || ""),
      });
    }

    const titleIds = [...titles.keys()].slice(0, 16);
    if (!titleIds.length) return NextResponse.json({ rows: [] as LibraryCopyHit[] });

    const { data: items, error: itemsError } = await auth.supabase
      .from("library_items")
      .select("id, title_id, status, accession")
      .eq("library_id", libraryId)
      .in("title_id", titleIds)
      .neq("status", "withdrawn")
      .order("accession")
      .limit(400);
    if (itemsError) return NextResponse.json({ error: itemsError.message, rows: [] as LibraryCopyHit[] });

    type Bucket = { availableIds: string[]; total: number };
    const byTitle = new Map<string, Bucket>();
    for (const item of items || []) {
      const titleId = String(item.title_id);
      const bucket = byTitle.get(titleId) || { availableIds: [], total: 0 };
      bucket.total += 1;
      if (item.status === "available") bucket.availableIds.push(String(item.id));
      byTitle.set(titleId, bucket);
    }

    // Prefer available books first, then unavailable matches, one row per title.
    const ordered = titleIds
      .map((id) => ({ id, bucket: byTitle.get(id) || { availableIds: [] as string[], total: 0 }, info: titles.get(id)! }))
      .filter((row) => row.bucket.total > 0 || titles.has(row.id))
      .sort((a, b) => {
        const aAvail = a.bucket.availableIds.length > 0 ? 0 : 1;
        const bAvail = b.bucket.availableIds.length > 0 ? 0 : 1;
        if (aAvail !== bAvail) return aAvail - bAvail;
        return a.info.title.localeCompare(b.info.title, "en", { sensitivity: "base" });
      })
      .slice(0, 12);

    const rows: LibraryCopyHit[] = ordered.map(({ id, bucket, info }) => {
      const available = bucket.availableIds.length;
      const bits = [
        available > 0 ? `${available} available` : bucket.total > 0 ? "All rented out" : "No copies here",
        info.authors,
        info.category,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      return {
        id: available > 0 ? bucket.availableIds[0] : "",
        title: info.title,
        meta: bits.join(" · ") || "Book",
        status: available > 0 ? "available" : "unavailable",
        available,
      };
    });
    return NextResponse.json({ rows });
  }

  if (kind === "teacher") {
    const like = `%${needle}%`;
    const filter = [everyWord(words, ["full_name"]), `email.ilike.${like}`].join(",");
    const { data, error } = await auth.supabase
      .from("teaching_staff")
      .select("id, full_name, email, photo_path")
      .eq("active", true)
      .or(filter)
      .order("full_name")
      .limit(12);
    if (error) return NextResponse.json({ error: error.message, rows: [] as LibraryBorrowerHit[] });
    const rows: LibraryBorrowerHit[] = (data || []).map((row) => ({
      id: String(row.id),
      kind: "teacher",
      name: String(row.full_name || "Teacher"),
      meta: String(row.email || "Teacher"),
      photo_path: (row.photo_path as string | null) || null,
    }));
    return NextResponse.json({ rows });
  }

  const like = `%${needle}%`;
  const filter = [
    everyWord(words, ["full_name", "preferred_name", "surname", "given_names"]),
    `student_number.ilike.${like}`,
  ].join(",");
  const { data, error } = await auth.supabase
    .from("students")
    .select("id, full_name, student_number, class_code, stream, photo_path, status")
    .eq("status", "active")
    .or(filter)
    .order("full_name")
    .limit(12);
  if (error) return NextResponse.json({ error: error.message, rows: [] as LibraryBorrowerHit[] });

  const rows: LibraryBorrowerHit[] = (data || []).map((row) => {
    const bits = [
      String(row.student_number || ""),
      row.class_code ? String(row.class_code) + (row.stream ? ` ${row.stream}` : "") : "",
    ].filter(Boolean);
    return {
      id: String(row.id),
      kind: "pupil",
      name: String(row.full_name || "Pupil"),
      meta: bits.join(" · ") || "Pupil",
      photo_path: (row.photo_path as string | null) || null,
    };
  });
  return NextResponse.json({ rows });
}
