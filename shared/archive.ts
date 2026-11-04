import { ANNOTATORS, BODY_PARTS, LESIONS } from "./types.ts";
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
  DiagnosisInput,
  DiagnosisReport,
  DiagnosisReview,
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
  alreadyAnnotated = false,
) {
  if (
    !Array.isArray(value.annotations) ||
    (!alreadyAnnotated && !value.annotations.length) ||
    value.annotations.length > 50 ||
    !value.annotations.every(validAnnotation) ||
    new Set(value.annotations.map((a) => a.id)).size !==
      value.annotations.length ||
    !isImage(value.annotatedImage)
  )
    throw new ArchiveError("请完善至少一处有效标注和标注图片。");
}

function diagnosisInput(value: DiagnosisInput) {
  if (
    !value ||
    !BODY_PARTS.some((part) => part === value.bodyPart) ||
    !LESIONS.includes(value.targetLesion) ||
    !["annotated", "manual"].includes(value.inputMode)
  )
    throw new ArchiveError("请选择有效的检查部位、病变类型和影像来源。");
}

function diagnosis(value: DiagnosisReport, bodyPart: string) {
  diagnosisInput(value);
  if (
    value.mock !== true ||
    value.bodyPart !== bodyPart ||
    !text(value.model, 80) ||
    typeof value.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    !text(value.finding, 1000) ||
    !text(value.recommendation, 1000) ||
    value.status !== "pending" ||
    value.reviewer !== null ||
    value.reviewedAt !== null ||
    value.reviewConclusion !== null ||
    !Array.isArray(value.scores) ||
    value.scores.length < 1 ||
    value.scores.length > LESIONS.length ||
    value.scores.some(
      (score) =>
        !score ||
        !LESIONS.includes(score.lesion) ||
        !Number.isFinite(score.percentage) ||
        score.percentage < 0 ||
        score.percentage > 100,
    ) ||
    new Set(value.scores.map((score) => score.lesion)).size !==
      value.scores.length ||
    value.scores[0].lesion !== value.targetLesion ||
    Math.abs(
      value.scores.reduce((sum, score) => sum + score.percentage, 0) - 100,
    ) > 0.001
  )
    throw new ArchiveError(
      "诊疗报告数据无效。请重新分析，并通过人工复核流程确认。",
    );
}

// Shared demo rules for Express persistence and the hosted IndexedDB demo.
export class Archive {
  constructor(public state: ArchiveState = emptyArchive()) {}
  private invalidateStudyDiagnoses(
    studyId: string,
    bodyPart: string,
    time: string,
  ) {
    for (const record of this.state.records) {
      if (
        record.studyId === studyId &&
        record.diagnosis &&
        record.diagnosis.bodyPart !== bodyPart
      ) {
        delete record.diagnosis;
        record.updatedAt = time;
      }
    }
  }
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
  diagnose(id: string, input: DiagnosisInput): DiagnosisReport {
    const study = this.study(id);
    diagnosisInput(input);
    const time = now();
    if (study.status === "uploaded") study.status = "analyzed";
    study.updatedAt = time;
    const alternatives = LESIONS.filter(
      (lesion) => lesion !== input.targetLesion,
    );
    return {
      mock: true,
      model: "EQUIVISION Assist · DEMO",
      generatedAt: time,
      bodyPart: input.bodyPart,
      targetLesion: input.targetLesion,
      inputMode: input.inputMode,
      scores: [
        { lesion: input.targetLesion, percentage: 82 },
        { lesion: alternatives[0], percentage: 12 },
        { lesion: alternatives[1], percentage: 6 },
      ],
      finding: `演示分析将“${input.targetLesion}”列为主要关注项，需由人工结合影像复核。百分比为固定示例分布，并非真实患病概率。`,
      recommendation:
        "AI 仅提供参考。请结合病史与临床检查人工复核，具体诊疗方案由专业人员确认；本报告为流程演示，不用于临床诊断。",
      status: "pending",
      reviewer: null,
      reviewedAt: null,
      reviewConclusion: null,
    };
  }
  updateStudy(id: string, value: StudyUpdate) {
    const study = this.study(id);
    const fields = metadata(value);
    if (!text(value.name, 200))
      throw new ArchiveError("请输入影像名称（最多 200 字）。");
    const time = now();
    this.invalidateStudyDiagnoses(study.id, fields.bodyPart, time);
    Object.assign(study, fields, { updatedAt: time });
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
    if (value.diagnosis !== undefined)
      diagnosis(value.diagnosis, fields.bodyPart);
    geometry(value, value.diagnosis?.inputMode === "annotated");
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
      ...(value.diagnosis
        ? { diagnosis: structuredClone(value.diagnosis) }
        : {}),
    };
    this.state.records.unshift(record);
    this.invalidateStudyDiagnoses(study.id, fields.bodyPart, time);
    Object.assign(study, fields, { status: "annotated", updatedAt: time });
    return record;
  }
  updateRecord(id: string, value: RecordUpdate) {
    const record = this.record(id);
    const fields = metadata(value);
    const hasGeometry =
      value.annotations !== undefined || value.annotatedImage !== undefined;
    const diagnosisChanged =
      record.bodyPart !== fields.bodyPart ||
      (hasGeometry &&
        (JSON.stringify(value.annotations) !==
          JSON.stringify(record.annotations) ||
          value.annotatedImage !== record.annotatedImage));
    if (hasGeometry) {
      geometry({
        annotations: value.annotations!,
        annotatedImage: value.annotatedImage!,
      });
      record.annotations = value.annotations!;
      record.annotatedImage = value.annotatedImage!;
    }
    // A report and its review apply only to the exact image region and body part.
    if (diagnosisChanged) delete record.diagnosis;
    Object.assign(record, fields, { updatedAt: now() });
    this.invalidateStudyDiagnoses(
      record.studyId,
      fields.bodyPart,
      record.updatedAt,
    );
    Object.assign(this.study(record.studyId), fields, {
      updatedAt: record.updatedAt,
    });
    return record;
  }
  reviewRecord(id: string, value: DiagnosisReview): AnnotationRecord {
    const record = this.record(id);
    if (!record.diagnosis)
      throw new ArchiveError(
        "此记录没有可复核的诊疗报告，请重新进行辅助分析。",
      );
    if (!value || !text(value.reviewer) || !text(value.conclusion, 1000))
      throw new ArchiveError("请填写复核人和人工复核结论。");
    if (record.diagnosis.status === "reviewed")
      throw new ArchiveError("此报告已完成复核，无需重复提交。");
    const time = now();
    record.diagnosis = {
      ...record.diagnosis,
      status: "reviewed",
      reviewer: value.reviewer.trim(),
      reviewedAt: time,
      reviewConclusion: value.conclusion.trim(),
    };
    record.updatedAt = time;
    this.study(record.studyId).updatedAt = time;
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
