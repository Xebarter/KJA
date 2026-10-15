export default function LoadingDebtors() {
  return (
    <div className="app-page ofc-page acc-page acc-skel acc-debt-skel" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading debtors</span>
      <i className="acc-debt-skel-hero" />
      <div className="acc-debt-skel-tiles">
        <i /><i /><i /><i /><i />
      </div>
      <i className="acc-debt-skel-board" />
    </div>
  );
}
