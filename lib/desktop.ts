/** True when this Next process was started by the Electron desktop shell. */
export function isDesktopProcess() {
  return process.env.KJA_DESKTOP === "1";
}

/** Client-side: cookie set by Electron before the first desk load. */
export function isDesktopClient() {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)kja-desktop=1(?:;|$)/.test(document.cookie);
}
