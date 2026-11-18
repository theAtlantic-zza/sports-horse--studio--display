import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronRight,
  CircleCheck,
  FileImage,
  FileText,
  LoaderCircle,
  LogIn,
  MousePointer2,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import {
  ANNOTATORS,
  BODY_PARTS,
  DIAGNOSIS_DELAY_MS,
  LESIONS,
} from "../../shared/types";
import type {
  Annotation,
  AnnotationRecord,
  Lesion,
  StudyImage,
} from "../../shared/types";
import { api } from "../api";
import {
  DEMO_SOURCE,
  prepareDemo,
  prepareUpload,
  renderAnnotated,
} from "../imaging";
import AnnotationCanvas from "./AnnotationCanvas";
import type { Tool } from "./AnnotationCanvas";
import DiagnosticReport from "./DiagnosticReport";

interface Props {
  onArchived: (id: string) => void;
  onRecordsChanged: () => Promise<void>;
  onUserChange?: (name: string) => void;
}
const stages = [
  "准备影像与标注",
  "核对部位与病变类型",
  "计算病变倾向",
  "生成报告草稿",
];
const userKey = "equivision-demo-user";
export const activeReportKey = "equivision-current-report";
const workflowLabels = ["上传影像", "模拟分析", "查看结果", "人工复核", "归档报告"];

export default function ClinicalWorkflow({
  onArchived,
  onRecordsChanged,
  onUserChange,
}: Props) {
  const [user, setUser] = useState(() => sessionStorage.getItem(userKey) || "");
  const [account, setAccount] = useState<string>(ANNOTATORS[0]);
  const [image, setImage] = useState<StudyImage | null>(null);
  const [studyId, setStudyId] = useState("");
  const [preview, setPreview] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [inputMode, setInputMode] = useState<"annotated" | "manual">(
    "annotated",
  );
  const [tool, setTool] = useState<Tool>("rectangle");
  const [selected, setSelected] = useState<string | null>(null);
  const [bodyPart, setBodyPart] = useState<string>(BODY_PARTS[0]);
  const [lesion, setLesion] = useState<Lesion>("关节间隙异常");
  const [horseName, setHorseName] = useState("追风");
  const [busy, setBusy] = useState<"loading" | "analyzing" | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [record, setRecord] = useState<AnnotationRecord | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [restoring, setRestoring] = useState(() => !!sessionStorage.getItem(activeReportKey));
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = sessionStorage.getItem(activeReportKey);
    if (!id) return;
    let active = true;
    void api.record(id).then((saved) => {
      if (!active) return;
      if (saved.diagnosis) setRecord(saved);
      else sessionStorage.removeItem(activeReportKey);
    }).catch((error: Error) => {
      if (active) {
        sessionStorage.removeItem(activeReportKey);
        setError(error.message);
      }
    }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (user) onUserChange?.(user);
  }, [user, onUserChange]);
  useEffect(() => {
    if (!image) return;
    let active = true;
    if (!annotations.length) setPreview(image.dataUrl);
    else
      void renderAnnotated(image, annotations)
        .then((value) => {
          if (active) setPreview(value);
        })
        .catch((error) => {
          if (active) setError(error.message);
        });
    return () => {
      active = false;
    };
  }, [image, annotations]);
  useEffect(() => {
    if (busy !== "analyzing") return;
    const start = performance.now();
    const timer = setInterval(() => setElapsed(performance.now() - start), 100);
    return () => clearInterval(timer);
  }, [busy]);

  async function load(mode: "annotated" | "manual", file?: File) {
    if (busy) return;
    setBusy("loading");
    setError("");
    try {
      const next = file ? await prepareUpload(file) : await prepareDemo();
      const { id } = await api.upload(next);
      const initial: Annotation[] =
        mode === "annotated" && !file
          ? [
              {
                id: crypto.randomUUID(),
                type: "rectangle",
                points: [
                  { x: 0.29, y: 0.25 },
                  { x: 0.53, y: 0.43 },
                ],
                lesion,
                confidence: 92,
                note: "内置已标注示例，仅用于流程展示。",
              },
            ]
          : [];
      setImage(next);
      setStudyId(id);
      setInputMode(mode);
      setAnnotations(initial);
      setPreview(next.dataUrl);
      setSelected(null);
      setRecord(null);
      setTool("rectangle");
      await onRecordsChanged();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function manual() {
    if (!image) {
      void load("manual");
      return;
    }
    setInputMode("manual");
    setTool("rectangle");
    setSelected(null);
  }
  async function analyze() {
    if (!image || busy || (inputMode === "manual" && !annotations.length))
      return;
    setBusy("analyzing");
    setElapsed(0);
    setError("");
    try {
      const diagnosis = await api.diagnose(studyId, {
        bodyPart,
        targetLesion: lesion,
        inputMode,
      });
      const annotatedImage = annotations.length
        ? await renderAnnotated(image, annotations)
        : image.dataUrl;
      const next = await api.save({
        studyId,
        horseName: horseName.trim(),
        bodyPart,
        annotator: user,
        annotations,
        annotatedImage,
        diagnosis,
      });
      setRecord(next);
      sessionStorage.setItem(activeReportKey, next.id);
      await onRecordsChanged();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const step = Math.min(3, Math.floor(elapsed / (DIAGNOSIS_DELAY_MS / 4)));
  const progress = Math.min(
    96,
    Math.round((elapsed / DIAGNOSIS_DELAY_MS) * 100),
  );
  const workflowStep = record?.diagnosis?.archivedAt ? 5
    : record?.diagnosis?.status === "reviewed" ? 4
    : reviewing ? 3 : record ? 2 : busy === "analyzing" ? 1 : 0;

  if (!user)
    return (
      <div className="page clinical-page clinical-login-page">
        <section className="clinical-login">
          <div className="clinical-login-story">
            <span className="clinical-kicker">EQUIVISION / ASSISTED CARE</span>
            <h1>
              让影像里的线索，
              <br />
              成为有据可循的判断。
            </h1>
            <p>
              从影像标注到辅助分析，再到人工复核。
              <br />
              每一次判断，都有完整的记录。
            </p>
            <div className="clinical-login-image">
              <div className="cropped-preview">
                <img src={DEMO_SOURCE} alt="运动马腕关节演示影像" />
              </div>
              <span className="clinical-image-tag">
                <ScanLine size={14} /> LF · 腕关节 / 演示样本
              </span>
              <div className="clinical-login-box">
                <span>关注区域</span>
              </div>
            </div>
            <div className="clinical-login-capabilities">
              <span>
                <ScanLine size={17} />
                影像标注
              </span>
              <span>
                <Sparkles size={17} />
                辅助分析
              </span>
              <span>
                <ShieldCheck size={17} />
                人工复核
              </span>
            </div>
          </div>
          <form
            className="clinical-login-form"
            onSubmit={(event) => {
              event.preventDefault();
              sessionStorage.setItem(userKey, account);
              setUser(account);
            }}
          >
            <span className="clinical-login-emblem">
              <ScanLine size={30} />
            </span>
            <span className="clinical-kicker">WELCOME TO YOUR WORKSPACE</span>
            <h2>登录影像工作台</h2>
            <p>选择演示身份，开始一次完整的辅助诊疗流程。</p>
            <label>
              演示账号
              <select
                aria-label="演示账号"
                value={account}
                onChange={(event) => setAccount(event.target.value)}
              >
                {ANNOTATORS.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <div className="clinical-organization">
              <span>所属机构</span>
              <strong>运动马研究中心</strong>
              <small>影像研究组 · 演示空间</small>
            </div>
            <button className="button primary" type="submit">
              <LogIn size={17} />
              登录工作台
              <ArrowRight size={18} />
            </button>
            <p className="clinical-login-note">
              <ShieldCheck size={15} />
              演示登录，无需密码；不连接真实账号系统。
            </p>
          </form>
        </section>
      </div>
    );

  return (
    <div className="page clinical-page">
      <header className="clinical-page-heading">
        <div>
          <span className="clinical-kicker">ASSISTED DIAGNOSTICS</span>
          <h1>
            {record ? "影像检查报告" : "新建影像检查"}<span>.</span>
          </h1>
          <p>{record ? `${record.horseName} · ${record.bodyPart} · ${record.id}` : "上传 X 线片并选择检查部位，开始模拟分析。"}</p>
        </div>
        <div className="clinical-signed-user">
          <span>
            <UserRound size={17} />
          </span>
          <div>
            <strong>{user}</strong>
            <small>已进入演示工作台</small>
          </div>
        </div>
      </header>
      <div className="clinical-steps" aria-label="辅助诊疗流程">
        {workflowLabels.map(
          (label, i) => (
            <div
              className={
                i < workflowStep
                  ? "complete"
                  : i === workflowStep
                    ? "active"
                    : ""
              }
              key={label}
            >
              <span>
                {i < workflowStep ? <Check size={13} /> : `0${i + 1}`}
              </span>
              <strong>{label}</strong>
              {i < workflowLabels.length - 1 && <ChevronRight size={16} />}
            </div>
          ),
        )}
      </div>
      {error && (
        <div className="clinical-error" role="alert">
          {error}
        </div>
      )}
      {restoring ? <p role="status">正在读取诊疗报告…</p> : record ? (
        <DiagnosticReport
          record={record}
          onReviewOpen={setReviewing}
          onChange={(next) => {
            setRecord(next);
            void onRecordsChanged();
          }}
          onDashboard={() => {
            sessionStorage.removeItem(activeReportKey);
            onArchived(record.id);
          }}
        />
      ) : busy === "analyzing" ? (
        <section
          className="clinical-thinking"
          data-testid="diagnosis-thinking"
          aria-busy="true"
        >
          <div className="clinical-thinking-image">
            <img src={preview || image?.dataUrl} alt="正在模拟分析的标注影像" />
            <div className="clinical-scan-line" />
            <span>
              <ScanLine size={15} />
              {bodyPart}
            </span>
          </div>
          <div className="clinical-thinking-detail">
            <span className="clinical-kicker">EQUIVISION ASSIST · DEMO</span>
            <div className="clinical-thinking-orb">
              <Sparkles size={27} />
            </div>
            <h2>
              AI 正在辅助分析<span className="clinical-thinking-dots">...</span>
            </h2>
            <p>正在整理影像信息，生成辅助诊疗报告</p>
            <div className="clinical-thinking-progress">
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="clinical-thinking-time">
              <span>模拟分析流程</span>
              <strong>{progress}%</strong>
            </div>
            <ol>
              {stages.map((label, i) => (
                <li
                  key={label}
                  className={i < step ? "done" : i === step ? "current" : ""}
                >
                  {i < step ? (
                    <CircleCheck size={17} />
                  ) : i === step ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <span className="clinical-stage-dot" />
                  )}
                  <span>{label}</span>
                  <small>
                    {i < step ? "已完成" : i === step ? "进行中" : "等待"}
                  </small>
                </li>
              ))}
            </ol>
            <div className="clinical-thinking-disclaimer">
              <ShieldCheck size={16} />
              此为模拟等待过程，未调用真实 AI 模型。
            </div>
          </div>
        </section>
      ) : (
        <div className="clinical-setup">
          <section
            className={`clinical-image-workspace ${image ? "has-image" : ""}`}
          >
            <header>
              <span>
                <FileImage size={17} />
                {image ? image.name : "添加本次检查影像"}
              </span>
              <small>{studyId || "IMAGE INPUT"}</small>
            </header>
            {image ? (
              <>
                <div className="clinical-image-toolbar">
                  <span className="clinical-source-label">
                    {inputMode === "manual" ? "人工标注" : "已标注影像"}
                  </span>
                  {inputMode === "manual" ? (
                    <div className="clinical-tools">
                      <button
                        aria-label="绘制矩形框"
                        aria-pressed={tool === "rectangle"}
                        onClick={() => setTool("rectangle")}
                      >
                        <Square size={15} />
                        矩形框
                      </button>
                      <button
                        aria-label="选择移动标注"
                        aria-pressed={tool === "select"}
                        onClick={() => setTool("select")}
                      >
                        <MousePointer2 size={15} />
                        移动
                      </button>
                      <button
                        aria-label="删除当前标注"
                        disabled={!selected}
                        onClick={() => {
                          setAnnotations((items) =>
                            items.filter((item) => item.id !== selected),
                          );
                          setSelected(null);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                      <span>{annotations.length} 处标注</span>
                    </div>
                  ) : (
                    <span className="clinical-image-ready">
                      <BadgeCheck size={14} />
                      可用于辅助分析
                    </span>
                  )}
                </div>
                {inputMode === "manual" ? (
                  <AnnotationCanvas
                    image={image}
                    annotations={annotations}
                    selectedId={selected}
                    tool={tool}
                    zoom={1}
                    showLabels
                    onSelect={setSelected}
                    onCreate={(type, points) => {
                      if (annotations.length >= 50) return;
                      const id = crypto.randomUUID();
                      setAnnotations((items) => [
                        ...items,
                        {
                          id,
                          type,
                          points,
                          lesion,
                          confidence: 92,
                          note: "人工演示标注。",
                        },
                      ]);
                      setSelected(id);
                    }}
                    onMoveStart={() => {}}
                    onMove={(id, points) =>
                      setAnnotations((items) =>
                        items.map((item) =>
                          item.id === id ? { ...item, points } : item,
                        ),
                      )
                    }
                  />
                ) : (
                  <div className="clinical-loaded-image">
                    <img
                      src={preview || image.dataUrl}
                      alt="本次检查的已标注影像"
                    />
                  </div>
                )}
                <footer>
                  <span>
                    <ShieldCheck size={14} />
                    {inputMode === "manual"
                      ? "拖动鼠标圈定关注区域后，开始辅助分析"
                      : "标注已保留，无需重复上传或重新绘制"}
                  </span>
                  <button
                    onClick={() => fileInput.current?.click()}
                    disabled={!!busy}
                  >
                    更换影像
                  </button>
                </footer>
              </>
            ) : (
              <div className="clinical-input-empty">
                <div className="clinical-upload-icon">
                  <Upload size={30} />
                </div>
                <h2>从一张已标注影像开始</h2>
                <p>上传已标注的 X 线片，或使用内置示例体验。</p>
                <button
                  className="button primary"
                  onClick={() => fileInput.current?.click()}
                  disabled={!!busy}
                >
                  <Upload size={16} />
                  上传已标注影像
                </button>
                <small>PNG / JPG / WebP · 最大 10 MB</small>
                <div className="clinical-sample-divider">
                  <span />
                  也可以直接使用演示样本
                  <span />
                </div>
                <button
                  className="clinical-demo-card"
                  aria-label="载入已标注示例"
                  onClick={() => void load("annotated")}
                  disabled={!!busy}
                >
                  <span className="clinical-demo-thumb">
                    <span className="cropped-preview">
                      <img src={DEMO_SOURCE} alt="内置已标注示例缩略图" />
                    </span>
                  </span>
                  <span>
                    <strong>载入已标注示例</strong>
                    <small>追风 · 左前肢腕关节 · 已圈定关注区域</small>
                  </span>
                  {busy ? (
                    <LoaderCircle size={19} className="spin" />
                  ) : (
                    <ArrowRight size={19} />
                  )}
                </button>
              </div>
            )}
          </section>
          <aside className="clinical-exam-panel">
            <div className="clinical-exam-title">
              <span>
                <FileText size={19} />
              </span>
              <div>
                <h2>本次检查</h2>
                <p>补充分析所需的上下文</p>
              </div>
            </div>
            <label>
              马匹名称
              <input
                aria-label="诊疗马匹名称"
                value={horseName}
                onChange={(event) => setHorseName(event.target.value)}
                maxLength={40}
                disabled={!!busy}
              />
            </label>
            <label>
              检查部位
              <select
                aria-label="检查部位"
                value={bodyPart}
                onChange={(event) => setBodyPart(event.target.value)}
                disabled={!!busy}
              >
                {BODY_PARTS.map((part) => (
                  <option key={part}>{part}</option>
                ))}
              </select>
            </label>
            <label>
              关注病变类型
              <select
                aria-label="关注病变类型"
                value={lesion}
                onChange={(event) => {
                  const value = event.target.value as Lesion;
                  setLesion(value);
                  setAnnotations((items) =>
                    items.map((item) => ({ ...item, lesion: value })),
                  );
                }}
                disabled={!!busy}
              >
                {LESIONS.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <div className="clinical-manual-entry">
              <span>
                <ScanLine size={18} />
              </span>
              <div>
                <strong>还没有完成标注？</strong>
                <p>圈定影像中的关注区域</p>
              </div>
              <button onClick={manual} disabled={!!busy}>
                进入标注界面
                <ArrowRight size={14} />
              </button>
            </div>
            <div className="clinical-exam-summary">
              <span>
                <Check size={14} />
                {image ? "影像已就绪" : "等待载入影像"}
              </span>
              <span>
                <UserRound size={14} />
                {user}
              </span>
            </div>
            <button
              className="button primary clinical-analyze-button"
              onClick={() => void analyze()}
              disabled={
                !image ||
                !!busy ||
                !horseName.trim() ||
                (inputMode === "manual" && !annotations.length)
              }
            >
              <Sparkles size={17} />
              开始 AI 辅助分析
              <ArrowRight size={16} />
            </button>
            <p className="clinical-exam-note">
              分析结果为模拟数据。影像仅用于流程展示。
            </p>
          </aside>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="上传已标注影像文件"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void load("annotated", file);
        }}
      />
    </div>
  );
}
