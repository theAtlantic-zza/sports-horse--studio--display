import {
  Archive,
  emptyArchive,
  migrateDemoAnnotators,
} from "../shared/archive";
import type { ArchiveState } from "../shared/types";
import { ANNOTATORS, LESIONS } from "../shared/types";
import { prepareDemo, renderAnnotated } from "./imaging";

let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("equivision-image-studio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("archive");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("无法打开演示数据库，请允许此网页使用浏览器存储。"));
  }));
}

let ready: Promise<void> | undefined;
async function initialize() {
  const connection = await db();
  const exists = await new Promise<boolean>((resolve, reject) => {
    const transaction = connection.transaction("archive", "readwrite");
    const store = transaction.objectStore("archive");
    const request = store.get("current");
    let found = false;
    request.onsuccess = () => {
      found = !!request.result;
      if (found && migrateDemoAnnotators(request.result))
        store.put(request.result, "current");
    };
    transaction.oncomplete = () => resolve(found);
    transaction.onerror = () => reject(transaction.error);
  });
  if (exists) return;
  const archive = new Archive(emptyArchive());
  const image = await prepareDemo();
  const names = [
    "追风",
    "银月",
    "赤兔",
    "云杉",
    "星河",
    "白露",
    "霁青",
    "晨曦",
  ];
  for (let i = 0; i < names.length; i++) {
    const { id } = archive.upload({
      ...image,
      name: `${names[i]}_左前肢腕关节.png`,
    });
    const study = archive.study(id);
    const date = new Date();
    date.setDate(date.getDate() - (7 - i));
    date.setHours(10 + i, 15, 0, 0);
    Object.assign(study, {
      horseName: names[i],
      annotator: ANNOTATORS[i % ANNOTATORS.length],
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
    });
    if (i < 6) archive.analyze(id);
    if (i < 5) {
      const annotations = Array.from({ length: (i % 3) + 1 }, (_, j) => ({
        ...archive.analyze(id).suggestion,
        id: crypto.randomUUID(),
        lesion: LESIONS[(i + j) % LESIONS.length],
        confidence: 80 + i * 3,
        note: "预置演示数据，仅用于流程展示。",
        points: [
          { x: 0.3 + j * 0.04, y: 0.25 + j * 0.12 },
          { x: 0.52 + j * 0.04, y: 0.4 + j * 0.12 },
        ],
      }));
      const record = archive.save({
        studyId: id,
        horseName: study.horseName,
        bodyPart: study.bodyPart,
        annotator: study.annotator,
        annotations,
        annotatedImage: await renderAnnotated(image, annotations),
      });
      record.createdAt = date.toISOString();
      record.updatedAt = date.toISOString();
    }
    study.updatedAt = date.toISOString();
  }
  await new Promise<void>((resolve, reject) => {
    // Recheck inside the write transaction so two first-visit tabs never overwrite each other.
    const transaction = connection.transaction("archive", "readwrite");
    const store = transaction.objectStore("archive");
    const request = store.get("current");
    request.onsuccess = () => {
      if (!request.result) store.put(archive.state, "current");
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function demoOperation<T>(
  operation: (archive: Archive) => T,
  write = false,
): Promise<T> {
  await (ready ||= initialize());
  const connection = await db();
  return new Promise((resolve, reject) => {
    const transaction = connection.transaction(
      "archive",
      write ? "readwrite" : "readonly",
    );
    const store = transaction.objectStore("archive");
    const request = store.get("current");
    let result: T;
    request.onsuccess = () => {
      try {
        const archive = new Archive(request.result as ArchiveState);
        result = operation(archive);
        if (write) store.put(archive.state, "current");
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () =>
      reject(new Error("浏览器存储失败，可能没有足够的可用空间。"));
  });
}
