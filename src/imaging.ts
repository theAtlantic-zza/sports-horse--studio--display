import type { Annotation, StudyImage } from "../shared/types";

export const DEMO_SOURCE = "/demo/horse-xray-source.png";
export const SHAPE_LABELS = {
  rectangle: "矩形框",
  polygon: "多边形",
  line: "线段",
};

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("无法读取图片，请选择有效的 PNG、JPG 或 WebP 文件。"));
    image.src = src;
  });
}

export async function prepareDemo(): Promise<StudyImage> {
  const source = await loadImage(DEMO_SOURCE);
  const canvas = document.createElement("canvas");
  canvas.width = 1183;
  canvas.height = 956;
  // Extract the X-ray viewport from the user-provided Finder screenshot at display time.
  canvas
    .getContext("2d")!
    .drawImage(source, 371, 94, 1183, 956, 0, 0, 1183, 956);
  return {
    name: "追风_左前肢腕关节_LF.png",
    dataUrl: canvas.toDataURL("image/png"),
    width: 1183,
    height: 956,
    source: "demo",
  };
}

export async function prepareUpload(file: File): Promise<StudyImage> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("支持 PNG、JPG、WebP 格式，请重新选择。");
  if (file.size > 10 * 1024 * 1024) throw new Error("图片不能超过 10 MB。");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("文件读取失败，请重试。"));
    reader.readAsDataURL(file);
  });
  const image = await loadImage(dataUrl);
  if (image.naturalWidth > 8000 || image.naturalHeight > 8000)
    throw new Error("图片尺寸不能超过 8000 × 8000 像素。");
  return {
    name: file.name,
    dataUrl,
    width: image.naturalWidth,
    height: image.naturalHeight,
    source: "upload",
  };
}

export async function renderAnnotated(
  image: StudyImage,
  annotations: Annotation[],
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height + 68;
  const context = canvas.getContext("2d")!;
  context.drawImage(await loadImage(image.dataUrl), 0, 0);
  context.lineWidth = Math.max(2.5, image.width / 400);
  const fontSize = Math.max(16, Math.round(image.width / 62));
  context.font = `600 ${fontSize}px sans-serif`;
  annotations.forEach((annotation, index) => {
    const points = annotation.points.map((point) => ({
      x: point.x * image.width,
      y: point.y * image.height,
    }));
    context.strokeStyle = "#e1c86b";
    context.fillStyle = "rgba(225, 200, 107, 0.09)";
    context.beginPath();
    if (annotation.type === "rectangle") {
      context.rect(
        Math.min(points[0].x, points[1].x),
        Math.min(points[0].y, points[1].y),
        Math.abs(points[1].x - points[0].x),
        Math.abs(points[1].y - points[0].y),
      );
    } else {
      points.forEach((point, i) =>
        i === 0
          ? context.moveTo(point.x, point.y)
          : context.lineTo(point.x, point.y),
      );
      if (annotation.type === "polygon") context.closePath();
    }
    context.stroke();
    if (annotation.type !== "line") context.fill();
    const text = `${String(index + 1).padStart(2, "0")}  ${annotation.lesion} · ${annotation.confidence}%`;
    const textWidth = context.measureText(text).width + 18;
    const labelHeight = fontSize + 15;
    const x = Math.max(
      0,
      Math.min(
        Math.min(...points.map((point) => point.x)),
        image.width - textWidth,
      ),
    );
    const y =
      Math.max(labelHeight, Math.min(...points.map((point) => point.y))) -
      labelHeight;
    context.fillStyle = "#e1c86b";
    context.fillRect(x, y, textWidth, labelHeight);
    context.fillStyle = "#203d34";
    context.fillText(text, x + 9, y + fontSize + 3);
  });
  context.fillStyle = "#173f35";
  context.fillRect(0, image.height, image.width, 68);
  context.fillStyle = "#e5edcf";
  context.font = `600 ${Math.max(14, Math.round(image.width / 66))}px sans-serif`;
  context.fillText(
    "EQUIVISION  /  演示标注 · 非临床诊断",
    22,
    image.height + 40,
  );
  return canvas.toDataURL("image/png");
}
