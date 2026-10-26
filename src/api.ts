import type {
  AnalysisResult,
  AnnotationRecord,
  RecordSummary,
  SaveRecordInput,
  StudyImage,
  Study,
  StudySummary,
  StudyUpdate,
  RecordUpdate,
} from "../shared/types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "请求失败，请重试。");
  return value as T;
}

const serverApi = {
  studies: () => request<StudySummary[]>("/api/studies"),
  study: (id: string) => request<Study>(`/api/studies/${id}`),
  updateStudy: (id: string, value: StudyUpdate) =>
    request<Study>(`/api/studies/${id}`, {
      method: "PATCH",
      body: JSON.stringify(value),
    }),
  deleteStudy: (id: string) =>
    request<{ deleted: boolean }>(`/api/studies/${id}`, { method: "DELETE" }),
  records: () => request<RecordSummary[]>("/api/records"),
  record: (id: string) => request<AnnotationRecord>(`/api/records/${id}`),
  upload: (image: StudyImage) =>
    request<{ id: string }>("/api/studies", {
      method: "POST",
      body: JSON.stringify(image),
    }),
  analyze: (id: string) =>
    request<AnalysisResult>(`/api/studies/${id}/analyze`, { method: "POST" }),
  save: (record: SaveRecordInput) =>
    request<AnnotationRecord>("/api/records", {
      method: "POST",
      body: JSON.stringify(record),
    }),
  updateRecord: (id: string, value: RecordUpdate) =>
    request<AnnotationRecord>(`/api/records/${id}`, {
      method: "PATCH",
      body: JSON.stringify(value),
    }),
  deleteRecord: (id: string) =>
    request<{ deleted: boolean }>(`/api/records/${id}`, { method: "DELETE" }),
};

export const BROWSER_DEMO = import.meta.env.MODE === "demo";
const browserApi: typeof serverApi = {
  studies: async () =>
    (await import("./demo-store")).demoOperation((a) => a.studies()),
  study: async (id) =>
    (await import("./demo-store")).demoOperation((a) => a.study(id)),
  updateStudy: async (id, value) =>
    (await import("./demo-store")).demoOperation(
      (a) => a.updateStudy(id, value),
      true,
    ),
  deleteStudy: async (id) =>
    (await import("./demo-store")).demoOperation(
      (a) => a.deleteStudy(id),
      true,
    ),
  records: async () =>
    (await import("./demo-store")).demoOperation((a) => a.records()),
  record: async (id) =>
    (await import("./demo-store")).demoOperation((a) => a.record(id)),
  upload: async (image) =>
    (await import("./demo-store")).demoOperation((a) => a.upload(image), true),
  analyze: async (id) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return (await import("./demo-store")).demoOperation(
      (a) => a.analyze(id),
      true,
    );
  },
  save: async (record) =>
    (await import("./demo-store")).demoOperation((a) => a.save(record), true),
  updateRecord: async (id, value) =>
    (await import("./demo-store")).demoOperation(
      (a) => a.updateRecord(id, value),
      true,
    ),
  deleteRecord: async (id) =>
    (await import("./demo-store")).demoOperation(
      (a) => a.deleteRecord(id),
      true,
    ),
};
export const api = BROWSER_DEMO ? browserApi : serverApi;

export async function downloadRecord(id: string) {
  const record = await api.record(id);
  const link = document.createElement("a");
  link.href = record.annotatedImage;
  link.download = `${id}-annotated.png`;
  link.click();
}

export const formatTime = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
