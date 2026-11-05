import { PageHeader } from "@/components/admin/PageHeader";
import { OfflineNeedRefresh } from "@/components/desk/OfflineNeedRefresh";

/** Premium cut card when a desk page has no offline snapshot yet. */
export function OfflineNeed({
  title,
  kicker,
  icon,
  description,
}: {
  title: string;
  kicker: string;
  icon: string;
  description: string;
}) {
  return (
    <div className="app-page kja-offline-need">
      <PageHeader kicker={kicker} icon={icon} title={title} description={description} />
      <div className="kja-offline-slot">
        <aside className="kja-offline-cut" role="status" aria-live="polite" aria-labelledby="kja-offline-title">
          <div className="kja-offline-cut-edge" aria-hidden="true" />
          <div className="kja-offline-cut-mark" aria-hidden="true">
            <i className="fa-solid fa-wifi" />
            <span className="kja-offline-cut-slash" />
          </div>
          <p className="kja-offline-cut-kicker">No connection</p>
          <h2 id="kja-offline-title">Connect to open this page</h2>
          <p className="kja-offline-cut-body">
            This view is not on this device yet. Reconnect once, open it online, and it will stay ready when you go offline again.
          </p>
          <div className="kja-offline-cut-actions">
            <OfflineNeedRefresh />
          </div>
        </aside>
      </div>
    </div>
  );
}
