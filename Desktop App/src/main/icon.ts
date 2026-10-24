import { join } from "node:path";
import { app, nativeImage, type NativeImage } from "electron";

/** App icon from `public/` favicon assets (copied into `resources/`). */
export function resolveAppIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "icon.png");
  }
  // electron-vite compiles main to `out/main/` → project `resources/`.
  return join(__dirname, "../../resources/icon.png");
}

export function loadAppIcon(): NativeImage {
  const path = resolveAppIconPath();
  const image = nativeImage.createFromPath(path);
  if (image.isEmpty()) {
    console.warn("[icon] Could not load app icon from", path);
  }
  return image;
}
