"use client";

export function PrintCardButton() {
  return (
    <button type="button" className="sp-print" onClick={() => window.print()}>
      <i className="fa-solid fa-print" aria-hidden="true" />
      Print card
    </button>
  );
}
