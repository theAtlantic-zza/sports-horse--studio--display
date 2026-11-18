import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createApp } from "../server/app.ts";
import type { ViewerState } from "../shared/types.ts";

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

describe("mock diagnostic reports and human review", () => {
  let diagnosticServer: Server;
  let diagnosticBase: string;
  let diagnosticDirectory: string;
  let uploadedId: string;
  let pendingReport: Record<string, unknown>;
  let diagnosisRecordId: string;
  let createdAt: string;
  const bodyPart = "左前肢 · 腕关节";
  const input = {
    bodyPart,
    targetLesion: "关节间隙异常",
    inputMode: "annotated",
  };
  const diagnosticPayload = (extra = {}) => ({
    ...payload(),
    studyId: uploadedId,
    bodyPart,
    annotator: "王一伊",
    annotations: [],
    diagnosis: pendingReport,
    ...extra,
  });
  const fields = (extra = {}) => ({
    horseName: "测试马匹",
    bodyPart,
    annotator: "王一伊",
    ...extra,
  });
  async function launch() {
    const app = await createApp(diagnosticDirectory, 0, 0);
    diagnosticServer = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) =>
      diagnosticServer.on("listening", resolve),
    );
    diagnosticBase = `http://127.0.0.1:${(diagnosticServer.address() as { port: number }).port}`;
  }
  before(async () => {
    await mkdir("work/qa/diagnosis", { recursive: true });
    diagnosticDirectory = await mkdtemp(path.resolve("work/qa/diagnosis/api-"));
    await launch();
    uploadedId = (
      await (await fetch(`${diagnosticBase}/api/studies`, json(image))).json()
    ).id;
  });
  after(async () => {
    await new Promise<void>((resolve) =>
      diagnosticServer.close(() => resolve()),
    );
    await rm(diagnosticDirectory, { recursive: true });
  });

  it("generates an explicitly simulated distribution for the chosen body part and lesion", async () => {
    const response = await fetch(
      `${diagnosticBase}/api/studies/${uploadedId}/diagnose`,
      json(input),
    );
    assert.equal(response.status, 200);
    pendingReport = await response.json();
    assert.equal(pendingReport.mock, true);
    assert.equal(pendingReport.bodyPart, bodyPart);
    assert.equal(pendingReport.targetLesion, "关节间隙异常");
    assert.equal(pendingReport.status, "pending");
    assert.equal(pendingReport.reviewedAt, null);
    assert.equal(pendingReport.archivedAt, null);
    assert.deepEqual(
      (pendingReport.scores as { percentage: number }[]).map(
        (score) => score.percentage,
      ),
      [82, 12, 6],
    );
    assert.match(String(pendingReport.finding), /固定示例/);
    assert.match(String(pendingReport.recommendation), /AI 仅提供参考/);
    assert.equal(
      (
        await (
          await fetch(`${diagnosticBase}/api/studies/${uploadedId}`)
        ).json()
      ).status,
      "analyzed",
    );
    for (const invalid of [
      {},
      { ...input, bodyPart: "不存在的部位" },
      { ...input, targetLesion: "未知病变" },
      { ...input, inputMode: "remote" },
    ]) {
      assert.equal(
        (
          await fetch(
            `${diagnosticBase}/api/studies/${uploadedId}/diagnose`,
            json(invalid),
          )
        ).status,
        400,
      );
    }
    assert.equal(
      (
        await fetch(
          `${diagnosticBase}/api/studies/missing/diagnose`,
          json(input),
        )
      ).status,
      404,
    );
  });

  it("saves a pre-annotated image and report without inventing editable annotation geometry", async () => {
    const response = await fetch(
      `${diagnosticBase}/api/records`,
      json(diagnosticPayload()),
    );
    assert.equal(response.status, 201);
    const record = await response.json();
    diagnosisRecordId = record.id;
    createdAt = record.createdAt;
    assert.deepEqual(record.annotations, []);
    assert.deepEqual(record.diagnosis, pendingReport);
    assert.equal(record.original.dataUrl, png);
    assert.equal(record.annotatedImage, png);
    const listing = await (await fetch(`${diagnosticBase}/api/records`)).json();
    assert.equal(listing[0].diagnosis.status, "pending");
    assert.equal(
      (await fetch(`${diagnosticBase}/api/records/${diagnosisRecordId}/archive`, { method: "POST" })).status,
      409,
    );
    assert.equal(listing[0].original, undefined);
  });

  it("rejects invalid percentages, mismatched body parts and forged review status", async () => {
    const invalidReports = [
      { ...pendingReport, mock: false },
      { ...pendingReport, bodyPart: "右前肢 · 腕关节" },
      { ...pendingReport, generatedAt: "invalid-time" },
      { ...pendingReport, finding: "" },
      { ...pendingReport, status: "reviewed" },
      { ...pendingReport, reviewer: "伪造复核人" },
      { ...pendingReport, reviewedAt: new Date().toISOString() },
      { ...pendingReport, archivedAt: new Date().toISOString() },
      { ...pendingReport, scores: [] },
      {
        ...pendingReport,
        scores: [{ lesion: "关节间隙异常", percentage: 101 }],
      },
      {
        ...pendingReport,
        scores: [{ lesion: "关节间隙异常", percentage: 80 }],
      },
      { ...pendingReport, scores: [{ lesion: "未知病变", percentage: 100 }] },
      {
        ...pendingReport,
        scores: [
          { lesion: "关节间隙异常", percentage: 50 },
          { lesion: "关节间隙异常", percentage: 50 },
        ],
      },
      { ...pendingReport, inputMode: "manual" },
    ];
    for (const diagnosis of invalidReports) {
      assert.equal(
        (
          await fetch(
            `${diagnosticBase}/api/records`,
            json(diagnosticPayload({ diagnosis })),
          )
        ).status,
        400,
      );
    }
    assert.equal(
      (
        await fetch(
          `${diagnosticBase}/api/records`,
          json(diagnosticPayload({ diagnosis: undefined })),
        )
      ).status,
      400,
    );
    assert.equal(
      (await (await fetch(`${diagnosticBase}/api/records`)).json()).length,
      1,
    );
  });

  it("persists reviewer, conclusion and time without changing the original record after restart", async () => {
    for (const invalid of [
      { reviewer: "", conclusion: "已复核" },
      { reviewer: "朱诗嘉", conclusion: " " },
    ]) {
      assert.equal(
        (
          await fetch(
            `${diagnosticBase}/api/records/${diagnosisRecordId}/review`,
            json(invalid),
          )
        ).status,
        400,
      );
    }
    const reviewed = await fetch(
      `${diagnosticBase}/api/records/${diagnosisRecordId}/review`,
      json({
        reviewer: "朱诗嘉",
        conclusion: "已核对部位与标注，保留模拟分析结论。",
      }),
    );
    assert.equal(reviewed.status, 200);
    const record = await reviewed.json();
    assert.equal(record.id, diagnosisRecordId);
    assert.equal(record.createdAt, createdAt);
    assert.equal(record.diagnosis.status, "reviewed");
    assert.equal(record.diagnosis.archivedAt, null);
    assert.equal(record.diagnosis.reviewer, "朱诗嘉");
    assert.ok(
      Math.abs(Date.now() - Date.parse(record.diagnosis.reviewedAt)) < 5000,
    );
    const reviewedAt = record.diagnosis.reviewedAt;
    await new Promise<void>((resolve) =>
      diagnosticServer.close(() => resolve()),
    );
    await launch();
    const restored = await (
      await fetch(`${diagnosticBase}/api/records/${diagnosisRecordId}`)
    ).json();
    assert.equal(restored.diagnosis.reviewedAt, reviewedAt);
    assert.equal(restored.diagnosis.archivedAt, null);
    assert.equal(
      restored.diagnosis.reviewConclusion,
      "已核对部位与标注，保留模拟分析结论。",
    );
    assert.equal(
      (
        await fetch(
          `${diagnosticBase}/api/records/${diagnosisRecordId}/review`,
          json({ reviewer: "王一伊", conclusion: "重复" }),
        )
      ).status,
      400,
    );
  });

  it("archives the reviewed record once, even when two archive requests arrive together", async () => {
    const endpoint = `${diagnosticBase}/api/records/${diagnosisRecordId}`;
    const requests = await Promise.all([
      fetch(`${endpoint}/archive`, { method: "POST" }),
      fetch(`${endpoint}/archive`, { method: "POST" }),
    ]);
    for (const request of requests) assert.equal(request.status, 200);
    const [first, retry] = await Promise.all(requests.map((item) => item.json()));
    const stored = await (await fetch(endpoint)).json();
    assert.ok(Date.parse(first.diagnosis.archivedAt) >= Date.parse(first.diagnosis.reviewedAt));
    assert.deepEqual(first.diagnosis, retry.diagnosis);
    assert.deepEqual(first.diagnosis, stored.diagnosis);
    assert.equal(stored.id, diagnosisRecordId);
    assert.equal(stored.createdAt, createdAt);
    assert.equal(stored.diagnosis.reviewer, "朱诗嘉");
  });

  it("preserves historical combined confirmations while leaving legacy pending reports open", async () => {
    const directory = await mkdtemp(path.resolve("work/qa/diagnosis/legacy-"));
    const file = path.join(directory, "image-archive.json");
    try {
      const state = JSON.parse(await readFile(path.join(diagnosticDirectory, "image-archive.json"), "utf8"));
      const reviewed = state.records[0];
      delete reviewed.diagnosis.archivedAt;
      const pending = { ...reviewed, id: "EV-000002", diagnosis: { ...pendingReport } };
      delete pending.diagnosis.archivedAt;
      state.records.unshift(pending);
      state.nextRecordNumber = 3;
      await writeFile(file, JSON.stringify(state));
      await createApp(directory, 0, 0);
      const migrated = JSON.parse(await readFile(file, "utf8"));
      assert.equal(migrated.records[0].diagnosis.archivedAt, null);
      assert.equal(migrated.studies[0].status, "pending");
      assert.equal(migrated.records[1].diagnosis.archivedAt, reviewed.diagnosis.reviewedAt);
      await createApp(directory, 0, 0);
      assert.deepEqual(JSON.parse(await readFile(file, "utf8")), migrated);
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it("keeps report snapshots for name edits but removes stale reports when the body part changes", async () => {
    const metadataEdit = await fetch(
      `${diagnosticBase}/api/records/${diagnosisRecordId}`,
      { ...json(fields({ horseName: "更新马匹名称" })), method: "PATCH" },
    );
    assert.equal(metadataEdit.status, 200);
    assert.equal((await metadataEdit.json()).diagnosis.status, "reviewed");
    const response = await fetch(
      `${diagnosticBase}/api/records/${diagnosisRecordId}`,
      { ...json(fields({ bodyPart: "右前肢 · 腕关节" })), method: "PATCH" },
    );
    assert.equal(response.status, 200);
    const changed = await response.json();
    assert.equal(changed.id, diagnosisRecordId);
    assert.equal(changed.diagnosis, undefined);
    assert.equal(changed.requiresAnalysis, true);
    assert.equal(changed.original.dataUrl, png);
    assert.equal(
      (await fetch(`${diagnosticBase}/api/records/${diagnosisRecordId}/archive`, { method: "POST" })).status,
      409,
    );
    assert.equal(
      (
        await fetch(
          `${diagnosticBase}/api/records/${diagnosisRecordId}/review`,
          json({ reviewer: "王一伊", conclusion: "旧结果" }),
        )
      ).status,
      400,
    );
  });

  it("invalidates manual report review after annotation edits and preserves legacy annotation behavior", async () => {
    const report = await (
      await fetch(
        `${diagnosticBase}/api/studies/${uploadedId}/diagnose`,
        json({ ...input, inputMode: "manual" }),
      )
    ).json();
    const record = await (
      await fetch(
        `${diagnosticBase}/api/records`,
        json(
          diagnosticPayload({ annotations: [annotation], diagnosis: report }),
        ),
      )
    ).json();
    assert.ok(record.id);
    await fetch(
      `${diagnosticBase}/api/records/${record.id}/review`,
      json({ reviewer: "李其杭", conclusion: "人工确认示例区域。" }),
    );
    const changed = await fetch(`${diagnosticBase}/api/records/${record.id}`, {
      ...json({
        ...fields(),
        annotations: [{ ...annotation, confidence: 92 }],
        annotatedImage: png,
      }),
      method: "PATCH",
    });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).diagnosis, undefined);
    const legacy = await fetch(
      `${diagnosticBase}/api/records`,
      json(
        diagnosticPayload({ annotations: [annotation], diagnosis: undefined }),
      ),
    );
    assert.equal(legacy.status, 201);
    assert.equal((await legacy.json()).diagnosis, undefined);
  });

  it("invalidates all linked reports consistently when an image body part changes", async () => {
    const id = (
      await (await fetch(`${diagnosticBase}/api/studies`, json(image))).json()
    ).id;
    async function saveForPart(part: string) {
      const report = await (
        await fetch(
          `${diagnosticBase}/api/studies/${id}/diagnose`,
          json({ ...input, bodyPart: part }),
        )
      ).json();
      const response = await fetch(
        `${diagnosticBase}/api/records`,
        json(
          diagnosticPayload({ studyId: id, bodyPart: part, diagnosis: report }),
        ),
      );
      assert.equal(response.status, 201);
      return response.json();
    }
    const first = await saveForPart(bodyPart);
    const second = await saveForPart(bodyPart);
    const reviewed = await fetch(
      `${diagnosticBase}/api/records/${first.id}/review`,
      json({ reviewer: "朱诗嘉", conclusion: "已核对演示区域。" }),
    );
    assert.equal(reviewed.status, 200);
    const otherPart = "右前肢 · 腕关节";
    const response = await fetch(`${diagnosticBase}/api/studies/${id}`, {
      ...json({ ...fields({ bodyPart: otherPart }), name: image.name }),
      method: "PATCH",
    });
    assert.equal(response.status, 200);
    for (const record of [first, second]) {
      const restored = await (
        await fetch(`${diagnosticBase}/api/records/${record.id}`)
      ).json();
      assert.equal(restored.diagnosis, undefined);
      assert.equal(restored.original.dataUrl, png);
      assert.equal(restored.createdAt, record.createdAt);
    }
    const third = await saveForPart(otherPart);
    const fourth = await saveForPart(otherPart);
    const edit = await fetch(`${diagnosticBase}/api/records/${third.id}`, {
      ...json(fields()),
      method: "PATCH",
    });
    assert.equal(edit.status, 200);
    assert.equal(
      (await (await fetch(`${diagnosticBase}/api/records/${fourth.id}`)).json())
        .diagnosis,
      undefined,
    );
    const fifth = await saveForPart(bodyPart);
    const sixth = await saveForPart(otherPart);
    assert.equal(
      (await (await fetch(`${diagnosticBase}/api/records/${fifth.id}`)).json())
        .diagnosis,
      undefined,
    );
    assert.equal(sixth.diagnosis.bodyPart, otherPart);
  });

  it("keeps multi-film measurements and report authors on the original numbered record", async () => {
    const study = await (await fetch(`${diagnosticBase}/api/studies`, json(image))).json();
    const visit = await (await fetch(`${diagnosticBase}/api/records`, json({
      ...diagnosticPayload(), studyId: study.id, annotations: [annotation], diagnosis: undefined,
    }))).json();
    const url = `${diagnosticBase}/api/records/${visit.id}`;
    const change = (action: unknown) => fetch(url + "/viewer", json(action));
    const view = async (): Promise<ViewerState> => (await fetch(url + "/viewer")).json();
    assert.equal((await view()).images[0].id, "primary");
    assert.equal((await change({op: "attach", image})).status, 200);
    assert.equal((await change({op: "metadata", imageId: "1", projection: "背内侧-掌外侧斜位", quality: "良好"})).status, 200);
    const mark = {op: "measure", imageId: "primary", kind: "distance", author: "王一伊",
      points: [{x: 0,y: 0}, {x: 0.6,y: 0.8}]};
    for (const outside of [{x:-1,y:0}, {x:1,y:0.5}, {x:0.5,y:1}])
      assert.equal((await change({...mark, points: [{x:0,y:0}, outside]})).status, 400);
    assert.equal((await change(mark)).status, 200);
    assert.equal((await change({...mark, imageId: "1", kind: "angle",
      points: [{x: 0,y: 0.5},{x: 0,y: 0},{x: 0.5,y: 0}]})).status, 200);
    const [primary, second] = (await view()).images;
    assert.equal(primary.measurements[0].value, 1);
    assert.equal(second.measurements[0].value, 90);
    assert.equal(second.measurements[0].unit, "°");
    assert.equal(second.projection, "背内侧-掌外侧斜位");
    assert.equal(primary.projection, "未确认");
    const remove = {op: "removeMeasurement", measurementId: second.measurements[0].id};
    assert.equal((await change({...remove, imageId:"primary"})).status, 404);
    assert.equal((await change({...remove, imageId:"1"})).status, 200);
    assert.equal((await view()).images[1].measurements.length, 0);
    const listing = await (await fetch(`${diagnosticBase}/api/records`)).text();
    assert.equal(listing.includes("base64"), false);
    assert.equal((await fetch(url + "/diagnose", json({...input, bodyPart: "右前肢 · 腕关节"}))).status, 400);
    const [one, retry] = await Promise.all([1,2].map(async () => (await fetch(url + "/diagnose", json(input))).json()));
    assert.equal(one.id, visit.id);
    assert.deepEqual(one.diagnosis, retry.diagnosis);
    assert.equal((await view()).images.length, 2);
    const draft = {op: "draft", findings: "已阅读两张影像", conclusion: "保留复查记录", author: "王一伊", revision: 0};
    assert.equal((await change(draft)).status, 200);
    assert.equal((await change({...draft, author:"朱诗嘉", findings:"冲突的新内容"})).status, 409);
    const {findings, conclusion} = draft;
    assert.equal((await fetch(url + "/review", json({reviewer: "朱诗嘉", findings: " ", conclusion, revision: 1}))).status, 400);
    assert.equal((await fetch(url + "/review", json({reviewer: "朱诗嘉", findings, conclusion, revision: 0}))).status, 409);
    const signed = await (await fetch(url + "/review", json({reviewer: "朱诗嘉", findings, conclusion, revision: 1}))).json();
    assert.equal(signed.diagnosis.reviewer, "朱诗嘉");
    assert.equal(signed.diagnosis.archivedAt, null);
    assert.equal((await view()).reviewDraft.author, "王一伊");
    assert.equal((await change(mark)).status, 409);
    assert.equal((await change({...draft, revision: 1})).status, 409);
    assert.equal((await fetch(url + "/archive", {method:"POST"})).status, 200);
    const saved = await view();
    assert.deepEqual(saved.images[0].measurements, primary.measurements);
    await new Promise<void>(resolve => diagnosticServer.close(() => resolve()));
    await launch();
    const restored = await (await fetch(`${diagnosticBase}/api/records/${visit.id}/viewer`)).json();
    assert.deepEqual(restored, saved);
  });

  it("stores an annotated copy once and keeps its projection bound to the primary film", async () => {
    const study = await (await fetch(`${diagnosticBase}/api/studies`, json(image))).json();
    const visit = await (await fetch(`${diagnosticBase}/api/records`, json({
      ...diagnosticPayload(), studyId: study.id, annotations: [annotation], diagnosis: undefined,
    }))).json();
    const endpoint = `${diagnosticBase}/api/records/${visit.id}`;
    const change = (value: unknown) => fetch(endpoint + "/viewer", json(value));
    const metadata = (imageId: string, projection: string) =>
      change({op: "metadata", imageId, projection, quality: "良好"});
    const copy = {op: "attachAnnotatedCopy", image};
    assert.equal((await metadata("primary", "侧位")).status, 200);
    assert.equal((await change({...copy, image:{...image, width:2}})).status, 400);
    const mismatched = Buffer.from(png.split(",")[1], "base64");
    mismatched.writeUInt32BE(2, 20);
    assert.equal((await change({...copy, image:{...image, dataUrl:"data:image/png;base64," + mismatched.toString("base64")}})).status, 400);
    assert.equal((await change({op:"attach", image, projection:"斜位"})).status, 200);
    const results = await Promise.all([change(copy), change(copy)]);
    for (const response of results) {
      assert.equal(response.status, 200);
      const state: ViewerState = await response.json();
      assert.deepEqual(state.images.map(f => f.derivedFrom), [undefined, undefined, "primary"]);
      assert.equal(state.images[2].projection, "侧位");
    }
    const timestamp = (await (await fetch(endpoint)).json()).updatedAt;
    assert.equal((await change(copy)).status, 200);
    assert.equal((await (await fetch(endpoint)).json()).updatedAt, timestamp);
    assert.equal((await metadata("2", "正位")).status, 409);
    assert.equal((await metadata("2", "侧位")).status, 200);
    assert.equal((await metadata("primary", "正位")).status, 200);
    const state: ViewerState = await (await fetch(endpoint + "/viewer")).json();
    assert.deepEqual(state.images.map(f => f.projection), ["正位", "斜位", "正位"]);
    assert.equal((await fetch(endpoint + "/diagnose", json(input))).status, 200);
    assert.equal((await fetch(endpoint + "/review", json({reviewer:"朱诗嘉", conclusion:"已核对"}))).status, 200);
    assert.equal((await change(copy)).status, 409);
  });
});
