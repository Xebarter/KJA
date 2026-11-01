export default function LibraryLoading() {
  return (
    <div className="app-page ofc-page lib-page" aria-busy="true" aria-label="Loading library">
      <div className="lib-skel is-hero" />
      <div className="lib-stats">
        <div className="lib-skel is-stat" />
        <div className="lib-skel is-stat" />
        <div className="lib-skel is-stat" />
        <div className="lib-skel is-stat" />
      </div>
      <div className="lib-skel" style={{ minHeight: 220 }} />
    </div>
  );
}
