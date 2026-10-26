import { ANNOTATORS, LESIONS } from "./types.ts";
import type {
  Annotation,
  AnnotationRecord,
  ArchiveState,
  RecordMetadata,
  RecordSummary,
  RecordUpdate,
  SaveRecordInput,
  Study,
  StudyImage,
  StudySummary,
  StudyUpdate,
  AnalysisResult,
} from "./types.ts";

export class ArchiveError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const emptyArchive = (): ArchiveState => ({
  nextImageNumber: 1,
  nextRecordNumber: 1,
  studies: [],
  records: [],
});

export function migrateDemoAnnotators(state: ArchiveState): boolean {
  const previousNames = new Set(["林医生", "陈医生", "演示标注员"]);
  const replacement = (studyId: string) => {
    const index = /^IMG-\d+$/.test(studyId) ? Number(studyId.slice(4)) - 1 : 0;
    return ANNOTATORS[Math.max(0, index) % ANNOTATORS.length];
  };
  let changed = false;
  for (const study of state.studies) {
    if (previousNames.has(study.annotator)) {
      study.annotator = replacement(study.id);
      changed = true;
    }
  }
  for (const record of state.records) {
    if (previousNames.has(record.annotator)) {
      record.annotator = replacement(record.studyId);
      changed = true;
    }
  }
  return changed;
}
const text = (value: unknown, max = 40): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const isImage = (value: unknown): value is string =>
  typeof value === "string" &&
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value);
const now = () => new Date().toISOString();
const number = (prefix: string, value: number) =>
  `${prefix}-${String(value).padStart(6, "0")}`;

function validAnnotation(item: Annotation) {
  return (
    item &&
    text(item.id, 80) &&
    ["rectangle", "polygon", "line"].includes(item.type) &&
    LESIONS.includes(item.lesion) &&
    Number.isFinite(item.confidence) &&
    item.confidence >= 0 &&
    item.confidence <= 100 &&
    typeof item.note === "string" &&
    item.note.length <= 500 &&
    Array.isArray(item.points) &&
    (item.type === "polygon"
      ? item.points.length >= 3 && item.points.length <= 100
      : item.points.length === 2) &&
    item.points.every(
      (p) =>
        p &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        p.x >= 0 &&
        p.x <= 1 &&
        p.y >= 0 &&
        p.y <= 1,
    ) &&
    (item.type !== "rectangle" ||
      (Math.abs(item.points[0].x - item.points[1].x) >= 0.008 &&
        Math.abs(item.points[0].y - item.points[1].y) >= 0.008)) &&
    (item.type !== "line" ||
      Math.hypot(
        item.points[0].x - item.points[1].x,
        item.points[0].y - item.points[1].y,
      ) >= 0.008)
  );
}
function metadata(value: RecordMetadata) {
  if (
    !value ||
    !text(value.horseName) ||
    !text(value.bodyPart) ||
    !text(value.annotator)
  )
    throw new ArchiveError("请填写马匹名称、检查部位和标注人（最多 40 字）。");
  return {
    horseName: value.horseName.trim(),
    bodyPart: value.bodyPart.trim(),
    annotator: value.annotator.trim(),
  };
}
function geometry(
  value: Pick<SaveRecordInput, "annotations" | "annotatedImage">,
) {
  if (
    !Array.isArray(value.annotations) ||
    !value.annotations.length ||
    value.annotations.length > 50 ||
    !value.annotations.every(validAnnotation) ||
    new Set(value.annotations.map((a) => a.id)).size !==
      value.annotations.length ||
    !isImage(value.annotatedImage)
  )
    throw new ArchiveError("请完善至少一处有效标注和标注图片。");
}

// Shared demo rules for Express persistence and the hosted IndexedDB demo.
export class Archive {
  constructor(public state: ArchiveState = emptyArchive()) {}
  studies(): StudySummary[] {
    return this.state.studies.map(({ image, ...study }) => {
      const linked = this.state.records.filter((r) => r.studyId === study.id);
      return {
        ...study,
        name: image.name,
        source: image.source,
        width: image.width,
        height: image.height,
        annotationCount: linked.reduce((n, r) => n + r.annotations.length, 0),
        recordCount: linked.length,
        latestRecordId: linked[0]?.id || null,
      };
    });
  }
  study(id: string): Study {
    const study = this.state.studies.find((s) => s.id === id);
    if (!study) throw new ArchiveError("没有找到这张影像，请重新加载。", 404);
    return study;
  }
  upload(image: StudyImage): { id: string } {
    if (
      !image ||
      !text(image.name, 200) ||
      !isImage(image.dataUrl) ||
      !Number.isInteger(image.width) ||
      !Number.isInteger(image.height) ||
      image.width < 1 ||
      image.height < 1 ||
      image.width > 8000 ||
      image.height > 8000 ||
      !["demo", "upload"].includes(image.source)
    )
      throw new ArchiveError("请选择有效的 PNG、JPG 或 WebP 图片。");
    const id = number("IMG", this.state.nextImageNumber++);
    const time = now();
    this.state.studies.unshift({
      id,
      image: { ...image, name: image.name.trim() },
      createdAt: time,
      updatedAt: time,
      status: "uploaded",
      horseName: "追风",
      bodyPart: "左前肢 · 腕关节",
      annotator: ANNOTATORS[0],
    });
    return { id };
  }
  analyze(id: string): AnalysisResult {
    const study = this.study(id);
    if (study.status === "uploaded") study.status = "analyzed";
    study.updatedAt = now();
    return {
      mock: true,
      model: "EQUI-DEMO v1.0",
      message: "演示分析已完成。提示为固定示例，不代表实际诊断。",
      suggestion: {
        id: crypto.randomUUID(),
        type: "rectangle",
        points: [
          { x: 0.31, y: 0.27 },
          { x: 0.53, y: 0.43 },
        ],
        lesion: "关节间隙异常",
        confidence: 85,
        note: "固定演示标注，不代表实际病变或诊断。",
      },
    };
  }
  updateStudy(id: string, value: StudyUpdate) {
    const study = this.study(id);
    const fields = metadata(value);
    if (!text(value.name, 200))
      throw new ArchiveError("请输入影像名称（最多 200 字）。");
    Object.assign(study, fields, { updatedAt: now() });
    study.image.name = value.name.trim();
    return study;
  }
  deleteStudy(id: string) {
    this.study(id);
    this.state.studies = this.state.studies.filter((s) => s.id !== id);
    this.state.records = this.state.records.filter((r) => r.studyId !== id);
    return { deleted: true };
  }
  records(): RecordSummary[] {
    return this.state.records.map(
      ({ original, annotatedImage: _image, ...record }) => ({
        ...record,
        source: original.source,
      }),
    );
  }
  record(id: string) {
    const record = this.state.records.find((r) => r.id === id);
    if (!record) throw new ArchiveError("没有找到这条标注记录。", 404);
    return record;
  }
  save(value: SaveRecordInput): AnnotationRecord {
    const study = this.study(value?.studyId);
    const fields = metadata(value);
    geometry(value);
    const time = now();
    const record: AnnotationRecord = {
      id: number("EV", this.state.nextRecordNumber++),
      studyId: study.id,
      createdAt: time,
      updatedAt: time,
      original: { ...study.image },
      ...fields,
      annotations: value.annotations,
      annotatedImage: value.annotatedImage,
    };
    this.state.records.unshift(record);
    Object.assign(study, fields, { status: "annotated", updatedAt: time });
    return record;
  }
  updateRecord(id: string, value: RecordUpdate) {
    const record = this.record(id);
    const fields = metadata(value);
    if (value.annotations !== undefined || value.annotatedImage !== undefined) {
      geometry({
        annotations: value.annotations!,
        annotatedImage: value.annotatedImage!,
      });
      record.annotations = value.annotations!;
      record.annotatedImage = value.annotatedImage!;
    }
    Object.assign(record, fields, { updatedAt: now() });
    Object.assign(this.study(record.studyId), fields, {
      updatedAt: record.updatedAt,
    });
    return record;
  }
  deleteRecord(id: string) {
    const record = this.record(id);
    this.state.records = this.state.records.filter((r) => r.id !== id);
    const study = this.study(record.studyId);
    study.status = this.state.records.some((r) => r.studyId === study.id)
      ? "annotated"
      : "analyzed";
    study.updatedAt = now();
    return { deleted: true };
  }
}
