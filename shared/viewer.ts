import type { AnnotationRecord, FilmMetadata, StudyImage, ViewerAction, ViewerImage, ViewerState } from "./types.ts";
import { ArchiveError, text, validateImage } from "./validation.ts";

const blankFilm = (): FilmMetadata => ({projection: "未确认", quality: "未确认", measurements: []});
function data(record: AnnotationRecord): NonNullable<AnnotationRecord["viewerData"]> {
  return record.viewerData ?? {
    primary: blankFilm(), attachments: [],
    reviewDraft: {findings: "", conclusion: record.diagnosis?.reviewConclusion ?? "", revision: 0,
      author: record.diagnosis?.reviewer ?? null, updatedAt: record.diagnosis?.reviewedAt ?? null},
  };
}
export function readViewer(record: AnnotationRecord): ViewerState {
  const stored = data(record);
  const {name, width, height, dataUrl} = record.original;
  const primary: ViewerImage = {...stored.primary, id: "primary", filename: name, width, height, dataUrl};
  const attachments = stored.attachments.map(image => image.derivedFrom === "primary"
    ? {...image, projection: primary.projection} : image);
  return {images: [primary, ...attachments], reviewDraft: stored.reviewDraft};
}

export function saveDraft(record: AnnotationRecord, action: Extract<ViewerAction, {op: "draft"}>) {
  const stored = data(record);
  const draft = stored.reviewDraft;
  if (!record.diagnosis || record.diagnosis.status !== "pending")
    throw new ArchiveError("请在生成分析结果后、确认复核前编辑草稿。", 409);
  if (action.revision !== draft.revision) throw new ArchiveError("草稿已更新，请重新打开报告。", 409);
  if (typeof action.findings !== "string" || action.findings.length > 2000 ||
      typeof action.conclusion !== "string" || action.conclusion.length > 1000 || !text(action.author))
    throw new ArchiveError("请核对撰写人及报告内容。");
  const findings = action.findings.trim(), conclusion = action.conclusion.trim();
  if (!findings && !conclusion) throw new ArchiveError("请填写影像所见或人工结论。");
  if (findings !== draft.findings || conclusion !== draft.conclusion) {
    record.updatedAt = new Date().toISOString();
    stored.reviewDraft = {findings, conclusion, author: action.author.trim(), revision: draft.revision + 1,
      updatedAt: record.updatedAt};
  }
  record.viewerData = stored;
}

function validateMetadata(projection: string, quality: string) {
  if (!["未确认", "正位", "侧位", "斜位", "背内侧-掌外侧斜位", "背外侧-掌内侧斜位", "其他"].includes(projection) ||
      !["未确认", "良好", "一般", "不适合"].includes(quality))
    throw new ArchiveError("请选择有效的投照方向和影像质量。");
}

function validateCopySize(image: StudyImage, original: StudyImage) {
  const header = /^data:image\/png;base64,([A-Za-z0-9+/]{32})/.exec(image.dataUrl);
  if (!header || image.width !== original.width || image.height !== original.height)
    throw new ArchiveError("标注对照图必须是与原片尺寸一致的 PNG 图片。");
  const bytes = Uint8Array.from(atob(header[1]), ch => ch.charCodeAt(0));
  const png = new DataView(bytes.buffer);
  if (png.getUint32(0) !== 0x89504e47 || png.getUint32(4) !== 0x0d0a1a0a ||
      png.getUint32(8) !== 13 || png.getUint32(12) !== 0x49484452 ||
      png.getUint32(16) !== original.width || png.getUint32(20) !== original.height)
    throw new ArchiveError("标注对照图的实际像素尺寸与原片不一致。");
}

export function updateViewer(record: AnnotationRecord, action: ViewerAction): ViewerState {
  if (!action || typeof action !== "object") throw new ArchiveError("请指定阅片操作。");
  if (record.diagnosis?.status === "reviewed") throw new ArchiveError("已复核的阅片与报告只读。", 409);
  if (action.op === "draft") {
    saveDraft(record, action);
    return readViewer(record);
  }
  const stored = data(record);
  if (action.op === "attach" || action.op === "attachAnnotatedCopy") {
    validateImage(action.image);
    const isCopy = action.op === "attachAnnotatedCopy";
    if (isCopy) {
      validateCopySize(action.image, record.original);
      if (stored.attachments.some(film => film.derivedFrom === "primary")) return readViewer(record);
    }
    const projection = isCopy ? stored.primary.projection : action.projection ?? "未确认";
    const quality = isCopy ? "未确认" : action.quality ?? "未确认";
    validateMetadata(projection, quality);
    const {name, width, height, dataUrl} = action.image;
    stored.attachments.push({id: String(stored.attachments.length + 1), filename: name.trim(),
      width, height, dataUrl, projection, quality, measurements: [],
      ...(isCopy ? {derivedFrom: "primary"} : {})});
  } else {
    const attachment = stored.attachments.find(image => image.id === action.imageId);
    const film = action.imageId === "primary" ? stored.primary : attachment;
    if (!film) throw new ArchiveError("找不到这张病例影像。", 404);
    if (action.op === "metadata") {
      validateMetadata(action.projection, action.quality);
      if (attachment?.derivedFrom === "primary" && action.projection !== stored.primary.projection)
        throw new ArchiveError("标注对照图沿用主片体位，请在主片上修改。", 409);
      Object.assign(film, {projection: action.projection, quality: action.quality});
      if (action.imageId === "primary") {
        for (const copy of stored.attachments)
          if (copy.derivedFrom === "primary") copy.projection = film.projection;
      }
    } else if (action.op === "removeMeasurement") {
      const index = film.measurements.findIndex(item => item.id === action.measurementId);
      if (index === -1) throw new ArchiveError("找不到这项测量。", 404);
      film.measurements.splice(index, 1);
    } else if (action.op === "measure") {
      const {kind, points, author} = action;
      const {width, height} = attachment ?? record.original;
      if (!text(author) || !["distance", "angle"].includes(kind) || !Array.isArray(points) ||
          points.length !== (kind === "angle" ? 3 : 2) || !points.every(p => p &&
            Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 &&
            p.x < width && p.y < height)) throw new ArchiveError("请在原图范围内标记测量点。");
      const [a,b,c] = points;
      const first = Math.hypot(a.x-b.x, a.y-b.y);
      const second = c ? Math.hypot(c.x-b.x, c.y-b.y) : 1;
      if (!first || !second) throw new ArchiveError("相邻测量点不能重合。");
      const dot = c ? ((a.x-b.x)*(c.x-b.x) + (a.y-b.y)*(c.y-b.y)) / (first * second) : 0;
      const value = c ? Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI : first;
      film.measurements.push({id: crypto.randomUUID(), kind, points: points.map(({x,y}) => ({x,y})),
        value, unit: c ? "°" : "px", createdBy: author.trim(), createdAt: new Date().toISOString()});
    } else throw new ArchiveError("未知的阅片操作。");
  }
  record.viewerData = stored;
  record.updatedAt = new Date().toISOString();
  return readViewer(record);
}
