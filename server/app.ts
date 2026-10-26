import express from "express";
import type { ErrorRequestHandler } from "express";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import {
  Archive,
  ArchiveError,
  emptyArchive,
  migrateDemoAnnotators,
} from "../shared/archive.ts";
import type { AnnotationRecord, ArchiveState } from "../shared/types.ts";

export async function createApp(dataDirectory: string, analysisDelay = 900) {
  await mkdir(dataDirectory, { recursive: true });
  const file = path.join(dataDirectory, "image-archive.json");
  let state = emptyArchive();
  try {
    state = JSON.parse(await readFile(file, "utf8")) as ArchiveState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // Preserve the previous file while importing its records into the unified archive.
    try {
      const legacy = JSON.parse(
        await readFile(
          path.join(dataDirectory, "annotation-records.json"),
          "utf8",
        ),
      ) as AnnotationRecord[];
      state.nextRecordNumber =
        Math.max(
          0,
          ...legacy.map((r) =>
            /^EV-\d{6}$/.test(r.id) ? Number(r.id.slice(3)) : 0,
          ),
        ) + 1;
      const migrated = new Archive(state);
      for (const record of [...legacy].reverse()) {
        const { id } = migrated.upload(record.original);
        Object.assign(migrated.study(id), {
          horseName: record.horseName,
          bodyPart: record.bodyPart,
          annotator: record.annotator,
          status: "annotated",
          createdAt: record.createdAt,
          updatedAt: record.createdAt,
        });
        state.records.unshift({
          ...record,
          studyId: id,
          updatedAt: record.updatedAt || record.createdAt,
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const archive = new Archive(state);
  const renamed = migrateDemoAnnotators(state);
  let queue = Promise.resolve();
  function commit<T>(operation: () => T): Promise<T> {
    const task = queue.then(async () => {
      const previous = structuredClone(archive.state);
      try {
        const value = operation();
        await writeFile(
          `${file}.pending`,
          JSON.stringify(archive.state),
          "utf8",
        );
        await rename(`${file}.pending`, file);
        return value;
      } catch (error) {
        archive.state = previous;
        throw error;
      }
    });
    queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  if (renamed) await commit(() => undefined);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "24mb" }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", mode: "demo", modelConnected: false }),
  );
  app.get("/api/studies", (_req, res) => res.json(archive.studies()));
  app.post("/api/studies", async (req, res) =>
    res.status(201).json(await commit(() => archive.upload(req.body))),
  );
  app.get("/api/studies/:id", (req, res) =>
    res.json(archive.study(req.params.id)),
  );
  app.patch("/api/studies/:id", async (req, res) =>
    res.json(await commit(() => archive.updateStudy(req.params.id, req.body))),
  );
  app.delete("/api/studies/:id", async (req, res) =>
    res.json(await commit(() => archive.deleteStudy(req.params.id))),
  );
  app.post("/api/studies/:id/analyze", async (req, res) => {
    await new Promise((resolve) => setTimeout(resolve, analysisDelay));
    res.json(await commit(() => archive.analyze(req.params.id)));
  });
  app.get("/api/records", (_req, res) => res.json(archive.records()));
  app.post("/api/records", async (req, res) =>
    res.status(201).json(await commit(() => archive.save(req.body))),
  );
  app.get("/api/records/:id", (req, res) =>
    res.json(archive.record(req.params.id)),
  );
  app.patch("/api/records/:id", async (req, res) =>
    res.json(await commit(() => archive.updateRecord(req.params.id, req.body))),
  );
  app.delete("/api/records/:id", async (req, res) =>
    res.json(await commit(() => archive.deleteRecord(req.params.id))),
  );
  app.get("/api/records/:id/download", (req, res) => {
    const record = archive.record(req.params.id);
    const mime = record.annotatedImage.match(/^data:([^;]+)/)![1];
    res
      .type(mime)
      .attachment(
        `${record.id}-annotated.${mime === "image/jpeg" ? "jpg" : mime.split("/")[1]}`,
      );
    res.send(Buffer.from(record.annotatedImage.split(",")[1], "base64"));
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "接口不存在。" }),
  );
  const frontend = path.resolve(process.env.FRONTEND_DIR || "dist-server");
  app.use(express.static(frontend));
  app.get("/{*splat}", (_req, res) =>
    res.sendFile(path.join(frontend, "index.html")),
  );
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const status =
      error instanceof ArchiveError
        ? error.status
        : error.status === 413
          ? 413
          : error instanceof SyntaxError
            ? 400
            : 500;
    res
      .status(status)
      .json({
        error:
          error instanceof ArchiveError
            ? error.message
            : status === 413
              ? "图片过大，请选择 10 MB 以内的图片。"
              : status === 400
                ? "请求格式错误。"
                : "保存失败，请稍后重试。",
      });
  };
  app.use(errors);
  return app;
}
