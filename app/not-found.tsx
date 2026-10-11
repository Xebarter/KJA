import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container py-5 text-center">
      <h1>Page not found</h1>
      <p>That page is not on the Kampala Junior Academy site.</p>
      <Link className="kja-btn" href="/">Back home</Link>
    </main>
  );
}
