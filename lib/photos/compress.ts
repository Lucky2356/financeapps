// Сжатие фото чека на устройстве, до того как оно попадёт в хранилище.
//
// Снимок телефона — 3–6 МБ. Чеку столько не нужно: 1280 точек по длинной
// стороне читаются целиком, а JPEG 0.72 даёт 150–250 КБ. Если вышло крупнее
// (очень пёстрый снимок) — ещё раз, погрубее.

import { fitSize, PHOTO_MAX_CHARS, PHOTO_QUALITY } from "@/lib/photos/receipt-photo";

export type CompressedPhoto = { data: string; width: number; height: number };

/** Целевой размер data-URL: примерно 330 КБ картинки. */
const TARGET_CHARS = 450_000;

async function decode(
  file: Blob
): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      // Повёрнутый телефоном снимок встаёт как снят, а не на бок.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      /* старый движок без параметров — ниже через <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressPhoto(file: Blob): Promise<CompressedPhoto> {
  const { source, width, height } = await decode(file);
  const size = fitSize(width, height);
  if (!size.width) throw new Error("Не получилось прочитать фото.");
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не получилось прочитать фото.");
  // Прозрачный PNG иначе станет чёрным.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(source, 0, 0, size.width, size.height);
  if ("close" in source && typeof source.close === "function") source.close();

  let data = canvas.toDataURL("image/jpeg", PHOTO_QUALITY);
  for (const quality of [0.55, 0.4]) {
    if (data.length <= TARGET_CHARS) break;
    data = canvas.toDataURL("image/jpeg", quality);
  }
  if (data.length > PHOTO_MAX_CHARS) throw new Error("Фото слишком большое даже после сжатия.");
  return { data, width: size.width, height: size.height };
}
