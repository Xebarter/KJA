import { useEffect, useState } from "react";
import type { BootStatus } from "../../shared/status";
import appIcon from "./icon.png";

export function Splash() {
  const [status, setStatus] = useState<BootStatus>({
    phase: "starting",
    message: "Starting KJA Desktop…",
  });

  useEffect(() => {
    const api = window.kjaDesktop;
    if (!api) return;
    void api.getBootStatus().then(setStatus);
    return api.onBootStatus(setStatus);
  }, []);

  const error = status.phase === "error";

  return (
    <div className={`splash${error ? " is-error" : ""}`}>
      <div className="splash-stage" aria-hidden="true">
        <div className="splash-glow splash-glow-a" />
        <div className="splash-glow splash-glow-b" />
        <div className="splash-grain" />
      </div>

      <div className="splash-seal" aria-hidden="true">
        <img className="splash-seal-img" src={appIcon} alt="" width={64} height={64} />
      </div>
      <p className="splash-kicker">Kampala Junior Academy</p>
      <h1>Staff Desktop</h1>
      <p className="splash-sub">Your offices, ready offline</p>

      <div className="splash-status" role="status" aria-live="polite">
        {error ? (
          <>
            <strong>Could not start</strong>
            <span>{status.error || status.message}</span>
          </>
        ) : (
          <>
            <span className="splash-spinner" aria-hidden="true" />
            <span>{status.message}</span>
          </>
        )}
      </div>
    </div>
  );
}
