"use client";

export function DashboardSwitch({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <a className="admin-side-link" href="/choose-dashboard">
      <i className="fa-solid fa-grip" aria-hidden="true" />
      <span>Switch dashboard</span>
    </a>
  );
}
