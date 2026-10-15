export default function LoadingFeeAccounts() {
  return (
    <div className="app-page ofc-page acc-page fac-page acc-skel acc-fee-skel" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading fee accounts</span>
      <i className="acc-fee-skel-hero" />
      <i className="acc-fee-skel-board" />
      <i className="acc-fee-skel-list" />
    </div>
  );
}
