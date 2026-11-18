export const ANNOTATORS = ["王一伊", "朱诗嘉", "阿里米热", "李其杭"] as const;

export const LESIONS = [
  "骨赘形成",
  "骨折疑似",
  "关节间隙异常",
  "骨密度异常",
  "其他病变",
] as const;
export type Lesion = (typeof LESIONS)[number];
export const BODY_PARTS = [
  "左前肢 · 腕关节",
  "右前肢 · 腕关节",
  "左前肢 · 球节",
  "右前肢 · 球节",
  "左后肢 · 跗关节",
  "右后肢 · 跗关节",
] as const;
export const DIAGNOSIS_DELAY_MS = 4800;

export interface DiagnosisInput {
  bodyPart: string;
  targetLesion: Lesion;
  inputMode: "annotated" | "manual";
}
export interface DiagnosisReport extends DiagnosisInput {
  mock: true;
  model: string;
  generatedAt: string;
  scores: { lesion: Lesion; percentage: number }[];
  finding: string;
  recommendation: string;
  status: "pending" | "reviewed";
  reviewer: string | null;
  reviewedAt: string | null;
  archivedAt: string | null;
  reviewConclusion: string | null;
}
export interface DiagnosisReview {
  reviewer: string;
  conclusion: string;
  findings?: string;
  revision?: number;
}
export type ShapeType = "rectangle" | "polygon" | "line";
export type Point = { x: number; y: number };

export interface Annotation {
  id: string;
  type: ShapeType;
  points: Point[];
  lesion: Lesion;
  confidence: number;
  note: string;
}

export interface StudyImage {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  source: "demo" | "upload";
}

export interface ViewerMeasurement {
  id: string;
  kind: "distance" | "angle";
  points: Point[];
  value: number;
  unit: "px" | "°";
  createdBy: string;
  createdAt: string;
}
export interface FilmMetadata {
  projection: string;
  quality: string;
  measurements: ViewerMeasurement[];
}
export interface ViewerImage extends FilmMetadata {
  id: string;
  derivedFrom?: "primary";
  filename: string;
  width: number;
  height: number;
  dataUrl: string;
}
export interface ReviewDraft {
  findings: string;
  conclusion: string;
  revision: number;
  author: string | null;
  updatedAt: string | null;
}
export interface ViewerState {
  images: ViewerImage[];
  reviewDraft: ReviewDraft;
}
export type ViewerAction =
  | {op: "attach"; image: StudyImage; projection?: string; quality?: string}
  | {op: "attachAnnotatedCopy"; image: StudyImage}
  | {op: "metadata"; imageId: string; projection: string; quality: string}
  | {op: "measure"; imageId: string; kind: "distance" | "angle"; points: Point[]; author: string}
  | {op: "removeMeasurement"; imageId: string; measurementId: string}
  | {op: "draft"; findings: string; conclusion: string; revision: number; author: string};

export interface SaveRecordInput {
  studyId: string;
  horseName: string;
  bodyPart: string;
  annotator: string;
  annotations: Annotation[];
  annotatedImage: string;
  diagnosis?: DiagnosisReport;
}

export interface AnnotationRecord extends Omit<SaveRecordInput, "studyId"> {
  id: string;
  studyId: string;
  createdAt: string;
  updatedAt: string;
  original: StudyImage;
  requiresAnalysis?: boolean;
  viewerData?: {primary: FilmMetadata; attachments: ViewerImage[]; reviewDraft: ReviewDraft};
}

export type RecordSummary = Omit<
  AnnotationRecord,
  "annotatedImage" | "original" | "viewerData"
> & {
  source: StudyImage["source"];
};

export interface AnalysisResult {
  mock: true;
  model: string;
  message: string;
  suggestion: Annotation;
}

export const STATUS_LABELS = {
  uploaded: "待分析",
  analyzed: "待标注",
  pending: "待复核",
  reviewed: "已复核待归档",
  reanalysis: "需重新分析",
  annotated: "已归档",
};
export type StudyStatus = keyof typeof STATUS_LABELS;

export function recordStatus(record: Pick<AnnotationRecord, "diagnosis" | "requiresAnalysis">) {
  if (record.requiresAnalysis) return "reanalysis";
  const report = record.diagnosis;
  return report && !report.archivedAt ? report.status : "annotated";
}
export interface Study {
  id: string;
  image: StudyImage;
  horseName: string;
  bodyPart: string;
  annotator: string;
  createdAt: string;
  updatedAt: string;
  status: StudyStatus;
}
export interface StudySummary extends Omit<Study, "image"> {
  name: string;
  source: StudyImage["source"];
  width: number;
  height: number;
  annotationCount: number;
  recordCount: number;
  latestRecordId: string | null;
}
export type RecordMetadata = Pick<
  SaveRecordInput,
  "horseName" | "bodyPart" | "annotator"
>;
export type RecordUpdate = RecordMetadata &
  Partial<Pick<SaveRecordInput, "annotations" | "annotatedImage">>;
export type StudyUpdate = RecordMetadata & { name: string };
export interface ArchiveState {
  nextImageNumber: number;
  nextRecordNumber: number;
  studies: Study[];
  records: AnnotationRecord[];
}
