export const LESIONS = [
  "骨赘形成",
  "骨折疑似",
  "关节间隙异常",
  "骨密度异常",
  "其他病变",
] as const;
export type Lesion = (typeof LESIONS)[number];
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

export interface SaveRecordInput {
  studyId: string;
  horseName: string;
  bodyPart: string;
  annotator: string;
  annotations: Annotation[];
  annotatedImage: string;
}

export interface AnnotationRecord extends Omit<SaveRecordInput, "studyId"> {
  id: string;
  studyId: string;
  createdAt: string;
  updatedAt: string;
  original: StudyImage;
}

export type RecordSummary = Omit<
  AnnotationRecord,
  "annotatedImage" | "original"
> & {
  source: StudyImage["source"];
};

export interface AnalysisResult {
  mock: true;
  model: string;
  message: string;
  suggestion: Annotation;
}

export type StudyStatus = "uploaded" | "analyzed" | "annotated";
export const STATUS_LABELS = {
  uploaded: "待分析",
  analyzed: "待标注",
  annotated: "已归档",
};
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
