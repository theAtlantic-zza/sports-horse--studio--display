interface ReadingImage {
  id: string;
  url: string;
  filename: string;
  width: number;
  height: number;
  projection: string;
  quality: string;
  measurements: { id: string; kind: string; points: {x:number; y:number}[]; value: number; unit: string; created_by: string }[];
}
export interface ReadingCase {
  id: string;
  body_part: string;
  status: string;
  archived_at: string | null;
  images: ReadingImage[];
  detections: never[];
}
export function mountViewer(host: HTMLElement, record: ReadingCase, options: {
  api: (path: string, options: {method: string; body?: string}) => Promise<ReadingCase>;
  onUpload?: () => void;
  onReport?: () => void;
}): () => void;
