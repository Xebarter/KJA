/**
 * Save a fetched file in the browser or Electron desk.
 * Desktop uses a native Save dialog; the web uses an object-URL download.
 */

type DesktopSaveResult =
  | { ok: true; path: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error?: string };

type DesktopDownloadApi = {
  saveDownload?: (payload: { data: ArrayBuffer; filename: string }) => Promise<DesktopSaveResult>;
};

function desktopApi(): DesktopDownloadApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { kjaDesktop?: DesktopDownloadApi }).kjaDesktop;
}

/** Read a Content-Disposition filename, preferring RFC 5987 filename*. */
export function filenameFromDisposition(header: string | null | undefined, fallback: string) {
  if (!header) return fallback;
  const encoded = header.match(/filename\*=(?:UTF-8''|utf-8'')([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim().replace(/^"+|"+$/g, "")) || fallback;
    } catch {
      return encoded.trim().replace(/^"+|"+$/g, "") || fallback;
    }
  }
  const plain = header.match(/filename="([^"]+)"/i)?.[1] || header.match(/filename=([^;]+)/i)?.[1];
  return plain?.trim().replace(/^"+|"+$/g, "") || fallback;
}

function browserSave(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Electron / Chromium need the blob URL alive until the download starts.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Persist bytes as a download. Returns `"canceled"` when the desktop Save dialog is dismissed.
 */
export async function saveClientDownload(
  data: Blob | ArrayBuffer,
  filename: string,
): Promise<"saved" | "canceled"> {
  const name = filename.trim() || "download";
  const api = desktopApi();
  if (api?.saveDownload) {
    const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
    const result = await api.saveDownload({ data: buffer, filename: name });
    if (result.ok) return "saved";
    if (result.canceled) return "canceled";
    throw new Error(result.error || "Could not save the file.");
  }
  const blob = data instanceof Blob ? data : new Blob([data]);
  browserSave(blob, name);
  return "saved";
}
