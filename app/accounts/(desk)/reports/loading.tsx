export default function ReportsLoading() {
  return (
    <div className="app-page ofc-page acc-page acr-page acc-skel acr-loading" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading the report</span>
      <i className="acr-skel-hero" />
      <i className="acr-skel-bar" />
      <div className="acr-skel-stats">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <i className="acr-skel-tabs" />
      <div className="acr-skel-grid">
        <i />
        <i />
      </div>
    </div>
  );
}
