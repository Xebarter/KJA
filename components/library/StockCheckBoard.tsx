"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { StockBoard, StockBook } from "@/lib/library-stock";

type Filter = "all" | "issues" | "out" | "missing";

function Meter({ available, total }: { available: number; total: number }) {
  const pct = total > 0 ? Math.round((available / total) * 100) : 0;
  return (
    <span className="lib-stock-meter" aria-hidden="true">
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

function BookRow({ book, open, onToggle }: { book: StockBook; open: boolean; onToggle: () => void }) {
  const allOut = book.total > 0 && book.available === 0;
  return (
    <article className={`lib-stock-book${open ? " is-open" : ""}${allOut ? " is-all-out" : ""}`}>
      <button type="button" className="lib-stock-book-head" onClick={onToggle} aria-expanded={open}>
        <span className="lib-stock-book-main">
          <strong>{book.title}</strong>
          <small>{[book.authors, book.category].filter(Boolean).join(" · ") || "Book"}</small>
          <Meter available={book.available} total={book.total} />
        </span>
        <span className="lib-stock-book-stats">
          <span className="lib-stock-pill is-in">{book.available} in</span>
          <span className={`lib-stock-pill ${book.unavailable ? "is-out" : "is-muted"}`}>{book.unavailable} out</span>
          <span className="lib-stock-chevron" aria-hidden="true">
            <i className={`fa-solid fa-chevron-${open ? "up" : "down"}`} />
          </span>
        </span>
      </button>

      <div className="lib-stock-book-panel" hidden={!open}>
        <div className="lib-stock-book-body">
          <div className="lib-stock-summary">
            <span>
              <strong>{book.total}</strong> copies
            </span>
            <span>
              <strong>{book.available}</strong> available
            </span>
            <span>
              <strong>{book.onLoan}</strong> on loan
            </span>
            <span>
              <strong>{book.reserved}</strong> reserved
            </span>
            <span className={book.missing ? "is-danger" : undefined}>
              <strong>{book.missing}</strong> missing
            </span>
          </div>

          <ul className="lib-stock-copies">
            {book.copies.map((copy) => (
              <li key={copy.id} className={`is-${copy.where.tone}`}>
                <span className="lib-stock-copy-id">
                  <strong>{copy.accession || copy.barcode || copy.id.slice(0, 8)}</strong>
                  <small>{String(copy.status).replace(/_/g, " ")}</small>
                </span>
                <span className="lib-stock-copy-where">
                  <strong>{copy.where.label}</strong>
                  <small>{copy.where.detail}</small>
                </span>
                {copy.where.href ? (
                  <Link className="lib-stock-action" href={copy.where.href}>
                    View
                  </Link>
                ) : (
                  <span className={`lib-stock-pill is-${copy.where.tone}`}>{copy.where.label}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

export function StockCheckBoard({ board }: { board: StockBoard }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return board.books.filter((book) => {
      if (filter === "issues" && book.unavailable === 0) return false;
      if (filter === "out" && book.available > 0) return false;
      if (filter === "missing" && book.missing === 0) return false;
      if (!needle) return true;
      const hay = `${book.title} ${book.authors} ${book.category}`.toLowerCase();
      if (hay.includes(needle)) return true;
      return book.copies.some((copy) =>
        `${copy.accession} ${copy.barcode} ${copy.where.detail} ${copy.where.label}`.toLowerCase().includes(needle),
      );
    });
  }, [board.books, filter, query]);

  const { totals } = board;

  return (
    <div className="lib-stock">
      <section className="lib-stock-hero" aria-label="Stock summary">
        <div className="lib-stock-kpis">
          <div>
            <span>Available</span>
            <strong>{totals.available.toLocaleString("en-GB")}</strong>
          </div>
          <div>
            <span>Unavailable</span>
            <strong>{totals.unavailable.toLocaleString("en-GB")}</strong>
          </div>
          <div>
            <span>On loan</span>
            <strong>{totals.onLoan.toLocaleString("en-GB")}</strong>
          </div>
          <div className={totals.missing ? "is-danger" : undefined}>
            <span>Missing</span>
            <strong>{totals.missing.toLocaleString("en-GB")}</strong>
          </div>
        </div>
        <p>
          {totals.books.toLocaleString("en-GB")} books · {totals.copies.toLocaleString("en-GB")} copies · open a row for
          copy details
        </p>
      </section>

      <div className="lib-stock-toolbar">
        <div className="lib-stock-filters" role="tablist" aria-label="Stock filter">
          {(
            [
              ["all", "All"],
              ["issues", "Has issues"],
              ["out", "All out"],
              ["missing", "Missing"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filter === id ? "is-on" : ""}
              onClick={() => {
                setFilter(id);
                setOpenId(null);
              }}
            >
              {label}
              {id === "issues" && totals.unavailable ? (
                <em>{totals.unavailable > 99 ? "99+" : totals.unavailable}</em>
              ) : null}
              {id === "missing" && totals.missing ? <em>{totals.missing}</em> : null}
            </button>
          ))}
        </div>
        <label className="lib-stock-search">
          <span className="sr-only">Search stock</span>
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpenId(null);
            }}
            placeholder="Search title, author, borrower, accession…"
            autoComplete="off"
          />
        </label>
      </div>

      {filtered.length ? (
        <div className="lib-stock-list">
          {filtered.map((book) => (
            <BookRow
              key={book.id}
              book={book}
              open={openId === book.id}
              onToggle={() => setOpenId((current) => (current === book.id ? null : book.id))}
            />
          ))}
        </div>
      ) : (
        <p className="lib-stock-empty">
          <i className="fa-solid fa-clipboard-check" aria-hidden="true" />
          {query || filter !== "all" ? "No books match this filter." : "No copies in this library yet."}
        </p>
      )}
    </div>
  );
}
