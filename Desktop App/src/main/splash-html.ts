/** Instant splash HTML - logo + green percent progress (no React). */

export function splashHtml(logoSrc: string): string {
  const logo = logoSrc
    ? `<img class="logo" src="${logoSrc}" alt="KJA" width="88" height="88" />`
    : `<div class="logo-fallback">KJA</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>KJA Staff Desktop</title>
<style>
  :root {
    color-scheme: dark;
    --ink: #f7f1e6;
    --mute: #9bb0c2;
    --gold: #fda31b;
    --navy: #0a2f5c;
    --deep: #141d24;
    --green: #22c55e;
    --green-deep: #16a34a;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    height: 100%;
    font-family: "Segoe UI", system-ui, sans-serif;
    background: radial-gradient(120% 80% at 50% -10%, #1e4d7b 0%, var(--deep) 55%, #0c1620 100%);
    color: var(--ink);
    overflow: hidden;
    user-select: none;
    -webkit-app-region: drag;
  }
  .wrap {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 36px 28px 40px;
    text-align: center;
  }
  .seal {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid rgba(253, 163, 27, 0.5);
    display: grid;
    place-items: center;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.3);
    margin-bottom: 20px;
    overflow: hidden;
  }
  .logo {
    width: 88px;
    height: 88px;
    object-fit: cover;
    border-radius: 50%;
  }
  .logo-fallback {
    font-weight: 800;
    font-size: 26px;
    letter-spacing: -0.04em;
    color: var(--navy);
  }
  .kicker {
    margin: 0;
    color: var(--gold);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  h1 {
    margin: 8px 0 6px;
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.03em;
  }
  .sub {
    margin: 0 0 26px;
    color: var(--mute);
    font-size: 14px;
    font-weight: 600;
  }
  .panel {
    width: min(100%, 320px);
    padding: 16px 16px 14px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.09);
    -webkit-app-region: no-drag;
  }
  .panel.is-error {
    background: rgba(214, 31, 50, 0.12);
    border-color: rgba(214, 31, 50, 0.28);
    text-align: left;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.18);
    flex: 0 0 auto;
    animation: pulse 1.2s ease-in-out infinite;
  }
  .panel.is-error .dot {
    background: #ef4444;
    box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.18);
    animation: none;
  }
  .label {
    flex: 1;
    text-align: left;
    font-size: 13px;
    font-weight: 650;
    line-height: 1.35;
    color: var(--ink);
  }
  .pct {
    font-size: 18px;
    font-weight: 800;
    color: var(--green);
    letter-spacing: -0.02em;
    min-width: 3.2ch;
    text-align: right;
  }
  .panel.is-error .pct { color: #ff8f9a; }
  .track {
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    width: 0%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--green-deep), var(--green));
    transition: width 0.25s ease-out;
  }
  .err {
    display: none;
    margin-top: 10px;
    color: #ffc9cf;
    font-size: 12.5px;
    font-weight: 600;
    line-height: 1.4;
    white-space: pre-wrap;
  }
  .panel.is-error .err { display: block; }
  .retry {
    display: none;
    margin-top: 12px;
    width: 100%;
    border: 0;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 13px;
    font-weight: 700;
    color: #0c1620;
    background: #fda31b;
    cursor: pointer;
    -webkit-app-region: no-drag;
  }
  .panel.is-error .retry { display: block; }
  .retry:active { transform: translateY(1px); }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(0.85); opacity: 0.75; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="seal" aria-hidden="true">${logo}</div>
    <p class="kicker">Kampala Junior Academy</p>
    <h1>Staff Desktop</h1>
    <p class="sub">Your offices, ready offline</p>
    <div class="panel" id="panel" role="status" aria-live="polite">
      <div class="row">
        <span class="dot" id="dot" aria-hidden="true"></span>
        <div class="label" id="label">Starting…</div>
        <div class="pct" id="pct">0%</div>
      </div>
      <div class="track"><div class="fill" id="fill"></div></div>
      <div class="err" id="err"></div>
      <button type="button" class="retry" id="retry">Try again</button>
    </div>
  </div>
  <script>
    const panel = document.getElementById("panel");
    const label = document.getElementById("label");
    const pctEl = document.getElementById("pct");
    const fill = document.getElementById("fill");
    const err = document.getElementById("err");
    const retry = document.getElementById("retry");
    let shown = 0;
    function paint(s) {
      const error = s && s.phase === "error";
      panel.classList.toggle("is-error", !!error);
      const next = Math.max(0, Math.min(100, Number(s && s.progress != null ? s.progress : 0)));
      shown = Math.max(shown, next);
      if (error) shown = next;
      const value = error ? next : shown;
      pctEl.textContent = value + "%";
      fill.style.width = value + "%";
      if (error) {
        label.textContent = "Could not start";
        err.textContent = (s && (s.error || s.message)) || "Unknown error";
      } else {
        label.textContent = (s && s.message) || "Starting…";
        err.textContent = "";
      }
    }
    window.__kjaSplashPaint = paint;
    const api = window.kjaDesktop;
    if (api) {
      api.getBootStatus().then(paint).catch(function () {});
      api.onBootStatus(paint);
      if (api.retryBoot) {
        retry.addEventListener("click", function () {
          label.textContent = "Starting…";
          err.textContent = "";
          panel.classList.remove("is-error");
          void api.retryBoot();
        });
      }
    }
  </script>
</body>
</html>`;
}
