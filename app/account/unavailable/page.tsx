import Link from "next/link";

export const metadata = { title: "Parent portal" };

export default function AccountUnavailablePage() {
  return (
    <main className="account-denied">
      <div className="account-denied-card">
        <div className="account-auth-mark">
          <img src="/images/kja-logo.png" alt="" />
        </div>
        <p className="account-denied-kicker">Parent portal</p>
        <h1>No family linked</h1>
        <p>Ask the school office if you should have access.</p>
        <div className="account-denied-actions">
          <Link className="account-btn" href="/">
            Back to the website
          </Link>
        </div>
      </div>
    </main>
  );
}
