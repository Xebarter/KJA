/** One-shot label for the next admin process. Read by the admin progress watcher. */

let noted = "";
let notedAt = 0;

export function noteProcess(label: string) {
  noted = label.trim();
  notedAt = performance.now();
}

export function takeProcessNote() {
  if (!noted || performance.now() - notedAt > 60_000) {
    noted = "";
    return "";
  }
  const value = noted;
  noted = "";
  return value;
}
