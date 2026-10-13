/* Server actions reject request bodies over 1 MB, so uploads must stay below it. */
export const UPLOAD_LIMIT = 950 * 1024;

export function megabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function shrinkImage(file: File) {
  if (file.size <= UPLOAD_LIMIT || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  for (const [edge, quality] of [[2400, 0.85], [1920, 0.8], [1600, 0.72]] as const) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.size <= UPLOAD_LIMIT) return new File([blob], `${file.name.replace(/\.\w+$/, "")}.webp`, { type: "image/webp" });
  }
  return file;
}
