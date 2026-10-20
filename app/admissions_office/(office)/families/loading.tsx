export default function LoadingFamilies() {
  return (
    <div className="app-page nav-loading" aria-busy="true" aria-label="Loading families">
      <span className="is-title" />
      <span style={{ width: "min(28rem, 90%)" }} />
      <span className="is-panel" />
    </div>
  );
}
