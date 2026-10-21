export default function AccountLoading() {
  return (
    <div className="account-loading" aria-busy="true" aria-label="Loading parent portal">
      <span className="account-loading-mark" aria-hidden="true" />
      <p>Opening your portal…</p>
    </div>
  );
}
