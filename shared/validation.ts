import type { StudyImage } from "./types.ts";

export class ArchiveError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
export const text = (value: unknown, max = 40): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
export const isImage = (value: unknown): value is string =>
  typeof value === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value);

export function validateImage(image: StudyImage) {
  if (!image || !text(image.name, 200) || !isImage(image.dataUrl) ||
      !Number.isInteger(image.width) || image.width < 1 || image.width > 8000 ||
      !Number.isInteger(image.height) || image.height < 1 || image.height > 8000 ||
      !["demo", "upload"].includes(image.source))
    throw new ArchiveError("请选择有效的 PNG、JPG 或 WebP 图片。");
}
