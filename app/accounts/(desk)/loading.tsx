import "./overview.css";

export default function AccountsLoading() {
  return (
    <div className="app-page ofc-page acc-page aov-page acc-skel" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading the accounts office</span>
      <i className="aov-skel-head" />
      <div className="acc-skel-kpis">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="aov-skel-grid">
        <div className="aov-skel-col">
          <i className="acc-skel-card is-tall" />
          <i className="acc-skel-card is-mid" />
        </div>
        <div className="aov-skel-col">
          <i className="acc-skel-card is-mid" />
          <i className="acc-skel-card is-tall" />
        </div>
      </div>
    </div>
  );
}
