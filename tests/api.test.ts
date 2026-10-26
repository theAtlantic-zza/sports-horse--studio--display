import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createApp } from "../server/app.ts";

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVJkAAAAASUVORK5CYII=";
const image = {
  name: "test-xray.png",
  dataUrl: png,
  width: 1,
  height: 1,
  source: "demo",
};
const annotation = {
  id: "a-1",
  type: "rectangle",
  points: [
    { x: 0.2, y: 0.2 },
    { x: 0.5, y: 0.6 },
  ],
  lesion: "骨赘形成",
  confidence: 85,
  note: "接口测试",
};
let server: Server;
let base: string;
let directory: string;
let studyId: string;
let recordId: string;
const json = (value: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});
const payload = (extra = {}) => ({
  studyId,
  horseName: "测试马匹",
  bodyPart: "左前肢",
  annotator: "测试员",
  annotations: [annotation],
  annotatedImage: png,
  ...extra,
});

describe("mock API and persistent annotation archive", () => {
  before(async () => {
    await mkdir("work/qa", { recursive: true });
    directory = await mkdtemp(path.resolve("work/qa/api-test-"));
    const app = await createApp(directory, 0);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.on("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true });
  });

  it("declares demo status and no real model", async () => {
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), {
      status: "ok",
      mode: "demo",
      modelConnected: false,
    });
  });
  it("rejects invalid image inputs and malformed JSON", async () => {
    for (const invalid of [
      {},
      { ...image, dataUrl: "not-an-image" },
      { ...image, width: 0 },
      { ...image, source: "remote" },
    ]) {
      assert.equal(
        (await fetch(`${base}/api/studies`, json(invalid))).status,
        400,
      );
    }
    assert.equal(
      (
        await fetch(`${base}/api/studies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{bad",
        })
      ).status,
      400,
    );
  });
  it("accepts the image and returns an upload session", async () => {
    const response = await fetch(`${base}/api/studies`, json(image));
    assert.equal(response.status, 201);
    studyId = (await response.json()).id;
    assert.ok(studyId);
  });
  it("returns a fixed mock result and rejects an unknown session", async () => {
    const response = await fetch(
      `${base}/api/studies/${studyId}/analyze`,
      json({}),
    );
    const result = await response.json();
    assert.equal(result.mock, true);
    assert.equal(result.suggestion.confidence, 85);
    assert.equal(result.suggestion.type, "rectangle");
    assert.equal(
      (await fetch(`${base}/api/studies/missing/analyze`, json({}))).status,
      404,
    );
  });
  it("validates archive metadata, annotation bounds and geometry", async () => {
    for (const invalid of [
      { annotator: " " },
      { horseName: "" },
      { bodyPart: "" },
      { annotations: [] },
      { annotations: [{ ...annotation, confidence: 101 }] },
      { annotations: [{ ...annotation, lesion: "未知类型" }] },
      {
        annotations: [
          {
            ...annotation,
            points: [
              { x: -0.1, y: 0.1 },
              { x: 0.5, y: 0.4 },
            ],
          },
        ],
      },
      {
        annotations: [
          {
            ...annotation,
            points: [
              { x: 0.5, y: 0.1 },
              { x: 0.5, y: 0.4 },
            ],
          },
        ],
      },
      {
        annotations: [
          {
            ...annotation,
            type: "polygon",
            points: [
              { x: 0.1, y: 0.1 },
              { x: 0.5, y: 0.4 },
            ],
          },
        ],
      },
      { annotatedImage: "" },
    ])
      assert.equal(
        (await fetch(`${base}/api/records`, json(payload(invalid)))).status,
        400,
      );
    assert.equal(
      (
        await fetch(
          `${base}/api/records`,
          json(payload({ studyId: "missing" })),
        )
      ).status,
      404,
    );
  });
  it("saves original and annotated images, author, geometry and server time", async () => {
    const response = await fetch(`${base}/api/records`, json(payload()));
    assert.equal(response.status, 201);
    const record = await response.json();
    recordId = record.id;
    assert.equal(record.original.dataUrl, png);
    assert.equal(record.annotatedImage, png);
    assert.equal(record.annotator, "测试员");
    assert.deepEqual(record.annotations, [annotation]);
    assert.ok(Math.abs(Date.now() - Date.parse(record.createdAt)) < 5000);
    const summaries = await (await fetch(`${base}/api/records`)).json();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].original, undefined);
    assert.equal(summaries[0].annotatedImage, undefined);
  });
  it("downloads the saved annotation as a PNG attachment", async () => {
    const response = await fetch(`${base}/api/records/${recordId}/download`);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.match(
      response.headers.get("content-disposition")!,
      /attachment.*annotated\.png/,
    );
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      Buffer.from(png.split(",")[1], "base64"),
    );
  });
  it("keeps all records when saves arrive concurrently", async () => {
    const results = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        fetch(
          `${base}/api/records`,
          json(payload({ horseName: `并发测试-${index}` })),
        ),
      ),
    );
    assert.ok(results.every((response) => response.status === 201));
    assert.equal((await (await fetch(`${base}/api/records`)).json()).length, 4);
  });
  it("restores archived records after a server restart", async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const app = await createApp(directory, 0);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.on("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    assert.equal((await (await fetch(`${base}/api/records`)).json()).length, 4);
    const record = await (
      await fetch(`${base}/api/records/${recordId}`)
    ).json();
    assert.equal(record.annotator, "测试员");
    assert.equal(record.original.dataUrl, png);
  });
  it("returns JSON 404 responses for missing records and routes", async () => {
    for (const route of [
      "/api/records/missing",
      "/api/records/missing/download",
      "/api/unknown",
    ]) {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 404);
      assert.ok((await response.json()).error);
    }
  });

  it("persists numbered uploads before annotation and retains them after restart", async () => {
    const study = await (await fetch(`${base}/api/studies/${studyId}`)).json();
    assert.match(study.id, /^IMG-\d{6}$/);
    assert.equal(study.image.dataUrl, png);
    const listing = await (await fetch(`${base}/api/studies`)).json();
    assert.equal(listing[0].recordCount, 4);
    assert.equal(listing[0].annotationCount, 4);
    assert.equal(listing[0].status, "annotated");
    assert.equal(listing[0].image, undefined);
  });

  it("edits image metadata without changing its number or upload date", async () => {
    const before = await (await fetch(`${base}/api/studies/${studyId}`)).json();
    const response = await fetch(`${base}/api/studies/${studyId}`, {
      ...json({
        name: "更新的影像.png",
        horseName: "银月",
        bodyPart: "左前肢",
        annotator: "林医生",
      }),
      method: "PATCH",
    });
    assert.equal(response.status, 200);
    const changed = await response.json();
    assert.equal(changed.id, before.id);
    assert.equal(changed.createdAt, before.createdAt);
    assert.equal(changed.image.name, "更新的影像.png");
    assert.equal(changed.horseName, "银月");
    assert.equal(
      (
        await fetch(`${base}/api/studies/${studyId}`, {
          ...json({ name: "", horseName: "", bodyPart: "", annotator: "" }),
          method: "PATCH",
        })
      ).status,
      400,
    );
  });

  it("updates and deletes annotation records while preserving their source image", async () => {
    const { id } = await (
      await fetch(`${base}/api/studies`, json(image))
    ).json();
    const original = await (
      await fetch(`${base}/api/records`, json(payload({ studyId: id })))
    ).json();
    const response = await fetch(`${base}/api/records/${original.id}`, {
      ...json({
        horseName: "编辑案例",
        bodyPart: "腕关节",
        annotator: "王医生",
        annotations: [{ ...annotation, confidence: 96 }],
        annotatedImage: png,
      }),
      method: "PATCH",
    });
    assert.equal(response.status, 200);
    const changed = await response.json();
    assert.equal(changed.id, original.id);
    assert.equal(changed.createdAt, original.createdAt);
    assert.equal(changed.annotations[0].confidence, 96);
    assert.equal(
      (await fetch(`${base}/api/records/${original.id}`, { method: "DELETE" }))
        .status,
      200,
    );
    assert.equal(
      (await fetch(`${base}/api/records/${original.id}`)).status,
      404,
    );
    const remaining = await (await fetch(`${base}/api/studies/${id}`)).json();
    assert.equal(remaining.status, "analyzed");
    assert.equal(remaining.image.dataUrl, png);
  });

  it("cascades image deletion and never reuses either image or annotation numbers", async () => {
    const first = await (
      await fetch(`${base}/api/studies`, json(image))
    ).json();
    const record = await (
      await fetch(`${base}/api/records`, json(payload({ studyId: first.id })))
    ).json();
    assert.equal(
      (await fetch(`${base}/api/studies/${first.id}`, { method: "DELETE" }))
        .status,
      200,
    );
    assert.equal((await fetch(`${base}/api/studies/${first.id}`)).status, 404);
    assert.equal((await fetch(`${base}/api/records/${record.id}`)).status, 404);
    assert.equal(
      (await fetch(`${base}/api/records/${record.id}/download`)).status,
      404,
    );
    const next = await (await fetch(`${base}/api/studies`, json(image))).json();
    assert.ok(next.id > first.id);
    const nextRecord = await (
      await fetch(`${base}/api/records`, json(payload({ studyId: next.id })))
    ).json();
    assert.ok(nextRecord.id > record.id);
    for (const endpoint of ["studies", "records"])
      assert.equal(
        (await fetch(`${base}/api/${endpoint}/missing`, { method: "DELETE" }))
          .status,
        404,
      );
  });
});
