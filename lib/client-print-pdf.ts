/**
 * Open a PDF blob in a hidden iframe (or popup fallback) and invoke the browser print dialog.
 * Same approach as report-card print — yields the server PDF, not a CSS reflow of the page.
 */
export async function printPdfBlob(blob: Blob, title = "Print document") {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.title = title;
  frame.setAttribute("aria-hidden", "true");
  // Full viewport so Chromium's PDF viewer lays out at real page size before print.
  frame.style.cssText =
    "position:fixed;inset:0;width:100vw;height:100vh;border:0;opacity:0;pointer-events:none;z-index:2147483646";
  frame.src = url;
  document.body.appendChild(frame);

  const cleanup = () => {
    frame.parentNode?.removeChild(frame);
    URL.revokeObjectURL(url);
  };

  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    frame.addEventListener("load", () => setTimeout(done, 500), { once: true });
    setTimeout(done, 2500);
  });

  try {
    const win = frame.contentWindow;
    if (!win) throw new Error("The PDF preview could not be opened.");
    win.focus();
    win.print();
  } catch {
    cleanup();
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) throw new Error("Allow pop-ups for this site to print the document.");
    const tryPrint = () => {
      try {
        popup.focus();
        popup.print();
      } catch {
        // Viewer may still be loading.
      }
    };
    setTimeout(tryPrint, 600);
    setTimeout(tryPrint, 1400);
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }

  // Keep the PDF frame until the print dialog is likely closed.
  setTimeout(cleanup, 120_000);
}
