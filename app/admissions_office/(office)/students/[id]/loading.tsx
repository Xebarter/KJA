export default function LoadingStudent() {
  return (
    <div className="app-page ofc-page ofc-profile ofc-skeleton" aria-busy="true" aria-label="Loading the student record">
      <span className="ofc-skel ofc-skel-back" />
      <div className="ofc-profile-head">
        <span className="ofc-skel ofc-skel-avatar" />
        <div className="ofc-profile-title">
          <span className="ofc-skel is-light ofc-skel-line" style={{ width: "9rem" }} />
          <span className="ofc-skel is-light ofc-skel-title" />
          <span className="ofc-skel is-light ofc-skel-line" style={{ width: "60%" }} />
        </div>
      </div>
      <div className="ofc-tabs">
        {[7, 8, 6, 6, 7].map((width, index) => <span key={index} className="ofc-skel ofc-skel-tab" style={{ width: `${width}rem` }} />)}
      </div>
      <div className="ofc-glance">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index}>
            <span className="ofc-skel ofc-skel-icon" />
            <span className="ofc-skel ofc-skel-line" style={{ width: "4rem" }} />
            <span className="ofc-skel ofc-skel-line" style={{ width: "7rem", gridColumn: 2 }} />
          </div>
        ))}
      </div>
      <div className="app-detail-grid ofc-profile-grid">
        <div className="app-detail-main">
          {[5, 4].map((rows, card) => (
            <section key={card} className="admin-card ofc-card">
              <header className="ofc-card-head"><span className="ofc-skel ofc-skel-line" style={{ width: "10rem" }} /></header>
              <div className="ofc-card-body ofc-skel-rows">
                {Array.from({ length: rows }, (_, index) => <span key={index} className="ofc-skel ofc-skel-line" />)}
              </div>
            </section>
          ))}
        </div>
        <aside className="app-detail-side">
          {[3, 3].map((rows, card) => (
            <section key={card} className="admin-card ofc-card">
              <header className="ofc-card-head"><span className="ofc-skel ofc-skel-line" style={{ width: "8rem" }} /></header>
              <div className="ofc-card-body ofc-skel-rows">
                {Array.from({ length: rows }, (_, index) => <span key={index} className="ofc-skel ofc-skel-line" />)}
              </div>
            </section>
          ))}
        </aside>
      </div>
    </div>
  );
}
