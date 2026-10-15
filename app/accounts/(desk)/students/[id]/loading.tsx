export default function LoadingFeeAccount() {
  return (
    <div className="app-page ofc-page acc-page fac-page" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading the fee account</span>
      <span className="fac-account-skel is-crumb" />
      <div className="fac-account" aria-hidden="true">
        <div className="fac-account-id">
          <span className="fac-account-skel is-photo" />
          <span className="fac-account-skel is-copy" />
        </div>
        <span className="fac-account-skel is-side" />
      </div>
      <div className="fac-account-skel-row" aria-hidden="true">
        <span className="fac-account-skel is-card" />
        <span className="fac-account-skel is-card" />
        <span className="fac-account-skel is-card" />
      </div>
      <div className="fac-account-skel-grid" aria-hidden="true">
        <span className="fac-account-skel is-panel" />
        <span className="fac-account-skel is-panel" />
      </div>
    </div>
  );
}
