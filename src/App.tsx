import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Box,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  BarChart3,
  FileImage,
  FolderOpen,
  ImagePlus,
  LayoutDashboard,
  LoaderCircle,
  Maximize,
  MousePointer2,
  MoveUpRight,
  Pentagon,
  Plus,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Square,
  Tag,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  Annotation,
  AnnotationRecord,
  AnalysisResult,
  Lesion,
  Point,
  RecordSummary,
  ShapeType,
  StudyImage,
  StudySummary,
} from "../shared/types";
import { LESIONS } from "../shared/types";
import { api, BROWSER_DEMO } from "./api";
import {
  DEMO_SOURCE,
  prepareDemo,
  prepareUpload,
  renderAnnotated,
  SHAPE_LABELS,
} from "./imaging";
import AnnotationCanvas from "./components/AnnotationCanvas";
import type { Tool } from "./components/AnnotationCanvas";
import Modal from "./components/Modal";
import DataDashboard from "./components/DataDashboard";
import DownloadLink from "./components/DownloadLink";
import { RecordDetail, RecordList } from "./components/Records";

type View = "overview" | "workspace" | "records" | "dashboard";
type Attributes = { lesion: Lesion; confidence: number; note: string };
const TOOLS = [
  { id: "select", label: "选择 / 移动", shortcut: "V", Icon: MousePointer2 },
  { id: "rectangle", label: "矩形框", shortcut: "R", Icon: Square },
  { id: "polygon", label: "多边形", shortcut: "P", Icon: Pentagon },
  { id: "line", label: "线段", shortcut: "L", Icon: MoveUpRight },
] as const;
const VIEW_LABELS = {
  overview: "总览工作台",
  workspace: "影像标注",
  records: "标注记录",
  dashboard: "数据看板",
};

export default function App() {
  const [view, setView] = useState<View>(
    window.location.hash === "#dashboard" ? "dashboard" : "overview",
  );
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [studies, setStudies] = useState<StudySummary[]>([]);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [image, setImage] = useState<StudyImage | null>(null);
  const [studyId, setStudyId] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("rectangle");
  const [zoom, setZoom] = useState(1);
  const [showLabels, setShowLabels] = useState(true);
  const [attributes, setAttributes] = useState<Attributes>({
    lesion: "骨赘形成",
    confidence: 85,
    note: "",
  });
  const [annotator, setAnnotator] = useState("演示标注员");
  const [horseName, setHorseName] = useState("追风");
  const [bodyPart, setBodyPart] = useState("左前肢 · 腕关节");
  const [modal, setModal] = useState<"upload" | "confirm" | "guide" | null>(
    null,
  );
  const [detail, setDetail] = useState<AnnotationRecord | null>(null);
  const [busy, setBusy] = useState<"loading" | "analyzing" | "saving" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshRecords = useCallback(async () => {
    try {
      const [nextRecords, nextStudies] = await Promise.all([
        api.records(),
        api.studies(),
      ]);
      setRecords(nextRecords);
      setStudies(nextStudies);
    } catch (error) {
      setError((error as Error).message);
    }
  }, []);
  useEffect(() => {
    void refreshRecords();
  }, [refreshRecords]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  function remember() {
    setHistory((previous) => [...previous.slice(-29), annotations]);
    setSavedId(null);
  }
  function changeAnnotations(next: Annotation[]) {
    remember();
    setAnnotations(next);
  }
  function undo() {
    if (!history.length) return;
    setAnnotations(history[history.length - 1]);
    setHistory((previous) => previous.slice(0, -1));
    setSelectedId(null);
    setSavedId(null);
  }
  function select(id: string | null) {
    setSelectedId(id);
    const selected = annotations.find((item) => item.id === id);
    if (selected)
      setAttributes({
        lesion: selected.lesion,
        confidence: selected.confidence,
        note: selected.note,
      });
  }
  function changeAttributes(next: Partial<Attributes>) {
    setAttributes((previous) => ({ ...previous, ...next }));
    if (selectedId)
      changeAnnotations(
        annotations.map((item) =>
          item.id === selectedId ? { ...item, ...next } : item,
        ),
      );
  }
  function createAnnotation(type: ShapeType, points: Point[]) {
    if (annotations.length >= 50) {
      setToast("每张影像最多保存 50 处标注。");
      return;
    }
    const annotation = { id: crypto.randomUUID(), type, points, ...attributes };
    changeAnnotations([...annotations, annotation]);
    setSelectedId(annotation.id);
  }
  function removeAnnotation(id: string) {
    changeAnnotations(annotations.filter((item) => item.id !== id));
    if (id === selectedId) setSelectedId(null);
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (
        modal ||
        detail ||
        view !== "workspace" ||
        !analysis ||
        (event.target as HTMLElement)?.closest(
          "input, textarea, select, [contenteditable]",
        )
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        removeAnnotation(selectedId);
      }
      const entry = TOOLS.find(
        (item) => item.shortcut.toLowerCase() === event.key.toLowerCase(),
      );
      if (entry && !event.ctrlKey && !event.metaKey) {
        setTool(entry.id);
        setSelectedId(null);
      }
    }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  });

  async function loadStudy(file?: File) {
    if (busy) return;
    setBusy("loading");
    setError("");
    try {
      const nextImage = file ? await prepareUpload(file) : await prepareDemo();
      const study = await api.upload(nextImage);
      setImage(nextImage);
      setStudyId(study.id);
      setEditingRecordId(null);
      setAnnotations([]);
      setHistory([]);
      setSelectedId(null);
      setSavedId(null);
      setAnalysis(null);
      setZoom(1);
      setTool("rectangle");
      setAttributes({ lesion: "骨赘形成", confidence: 85, note: "" });
      setModal(null);
      setView("workspace");
      setBusy("analyzing");
      await refreshRecords();
      setAnalysis(await api.analyze(study.id));
      await refreshRecords();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function analyzeAgain() {
    setBusy("analyzing");
    setError("");
    try {
      setAnalysis(await api.analyze(studyId));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function resumeStudy(id: string, recordId?: string) {
    setBusy("loading");
    setError("");
    try {
      const study = await api.study(id);
      const record = recordId ? await api.record(recordId) : null;
      setImage(study.image);
      setStudyId(study.id);
      setHorseName(record?.horseName || study.horseName);
      setBodyPart(record?.bodyPart || study.bodyPart);
      setAnnotator(record?.annotator || study.annotator);
      setAnnotations(record?.annotations || []);
      setEditingRecordId(record?.id || null);
      setSavedId(null);
      setHistory([]);
      setSelectedId(null);
      setZoom(1);
      setTool("rectangle");
      setAnalysis(null);
      setView("workspace");
      setAttributes({ lesion: "骨赘形成", confidence: 85, note: "" });
      setBusy("analyzing");
      setAnalysis(await api.analyze(id));
      await refreshRecords();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function openRecord(id: string) {
    setError("");
    try {
      setDetail(await api.record(id));
    } catch (error) {
      setError((error as Error).message);
    }
  }

  async function save() {
    if (!image || busy) return;
    setBusy("saving");
    setError("");
    try {
      const annotatedImage = await renderAnnotated(image, annotations);
      const input = {
        studyId,
        horseName,
        bodyPart,
        annotator,
        annotations,
        annotatedImage,
      };
      const record = editingRecordId
        ? await api.updateRecord(editingRecordId, input)
        : await api.save(input);
      setEditingRecordId(record.id);
      setSavedId(record.id);
      setModal(null);
      setDetail(record);
      setToast("标注已归档，原图与标注图均已保留。");
      await refreshRecords();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const newStudy = () => {
    setError("");
    setModal("upload");
  };
  const totalAnnotations = records.reduce(
    (count, record) => count + record.annotations.length,
    0,
  );
  const activeIndex = annotations.findIndex((item) => item.id === selectedId);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => setView("overview")}
          aria-label="EQUIVISION 首页"
        >
          <span className="brand-symbol">
            <ScanLine size={27} strokeWidth={1.6} />
          </span>
          <span>
            <strong>
              EQUIVISION<span>.</span>
            </strong>
            <small>运动马影像工作台</small>
          </span>
        </button>
        <div className="organization">
          <span className="org-avatar">研</span>
          <span>
            <strong>运动马研究中心</strong>
            <small>影像数据演示空间</small>
          </span>
          <span className="org-indicator" />
        </div>
        <div className="nav-section-label">临床工作台</div>
        <nav aria-label="主导航">
          {(
            [
              { id: "overview", Icon: LayoutDashboard },
              { id: "workspace", Icon: ScanLine },
              { id: "dashboard", Icon: BarChart3 },
              { id: "records", Icon: FolderOpen },
            ] as const
          ).map(({ id, Icon }) => (
            <button
              key={id}
              aria-label={VIEW_LABELS[id]}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => setView(id)}
            >
              <Icon size={20} strokeWidth={1.7} />
              <span>{VIEW_LABELS[id]}</span>
              {view === id ? (
                <span className="nav-dot" />
              ) : id === "records" && records.length > 0 ? (
                <span className="nav-count">{records.length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="nav-section-label resource-label">资源与支持</div>
        <button className="nav-item" onClick={() => setModal("guide")}>
          <CircleHelp size={20} strokeWidth={1.7} />
          <span>演示使用指南</span>
          <ArrowUpRight size={14} className="nav-arrow" />
        </button>
        <div className="sidebar-note">
          <span className="sidebar-note-icon">
            <Box size={24} strokeWidth={1.4} />
          </span>
          <h3>
            让经验，成为
            <br />
            看得见的数据。
          </h3>
          <p>结构化标注 · 完整追溯</p>
          <div className="sidebar-note-line" />
        </div>
        <div className="sidebar-footer">
          <div className="service-status">
            <span>
              <i />
              模拟 API 服务
            </span>
            <span>{BROWSER_DEMO ? "在线演示" : "本地运行"}</span>
          </div>
          <div className="profile">
            <span className="avatar">演</span>
            <span>
              <strong>演示标注员</strong>
              <small>DEMO WORKSPACE</small>
            </span>
            <ShieldCheck size={18} />
          </div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>EQUIVISION</span>
            <ChevronRight size={15} />
            <strong>{VIEW_LABELS[view]}</strong>
          </div>
          <div className="topbar-actions">
            <span className="environment-label">
              <i />
              DEMO ENVIRONMENT
            </span>
            <button
              className="icon-button"
              aria-label="演示使用指南"
              onClick={() => setModal("guide")}
            >
              <CircleHelp size={19} />
            </button>
            <span className="topbar-divider" />
            <span className="avatar small">演</span>
          </div>
        </header>
        <div className="demo-banner">
          <span className="demo-badge">
            <span />
            演示模式
          </span>
          <span>所有分析结果为模拟数据，仅用于标注流程展示</span>
          <button onClick={() => setModal("guide")}>
            了解演示 <ArrowUpRight size={14} />
          </button>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button aria-label="关闭错误提示" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}

        {view === "overview" && (
          <div className="page overview-page">
            <div className="page-heading">
              <div>
                <span className="eyebrow">CLINICAL WORKSPACE</span>
                <h1>
                  影像标注工作台<span className="heading-dot">.</span>
                </h1>
                <p>聚焦每一处细节，让每一次观察都有迹可循。</p>
              </div>
              <button className="button primary" onClick={newStudy}>
                <Plus size={18} />
                新建标注
              </button>
            </div>
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label">
                  <span>累计标注影像</span>
                  <FileImage size={19} />
                </div>
                <div className="stat-value">
                  {String(records.length).padStart(2, "0")}
                  <span>份</span>
                </div>
                <p>
                  <span className="stat-mini-line" />
                  每份影像，完整留存
                </p>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  <span>已标注病变区域</span>
                  <ScanLine size={19} />
                </div>
                <div className="stat-value">
                  {String(totalAnnotations).padStart(2, "0")}
                  <span>处</span>
                </div>
                <p>
                  <span className="stat-mini-line" />
                  专业观察，精确记录
                </p>
              </div>
              <div className="stat-card stat-feature">
                <div className="stat-label">
                  <span>可用标注方式</span>
                  <Pentagon size={19} />
                </div>
                <div className="stat-value">
                  03<span>种</span>
                </div>
                <p>
                  矩形框 <span> / </span> 多边形 <span> / </span> 线段
                </p>
              </div>
            </div>
            <section className="start-panel panel">
              <div className="start-copy">
                <span className="section-kicker">
                  <span />
                  ANNOTATION STUDIO
                </span>
                <h2>
                  从一张影像，
                  <br />
                  开始一次精准记录。
                </h2>
                <p>
                  上传影像，圈定关注区域，留下你的专业判断。
                  <br className="desktop-break" />
                  每一份标注，都值得被完整保存。
                </p>
                <div className="start-actions">
                  <button className="button primary" onClick={newStudy}>
                    <ScanLine size={18} />
                    开始分析 <ArrowRight size={17} />
                  </button>
                  <button
                    className="button light"
                    disabled={!!busy}
                    onClick={() => void loadStudy()}
                  >
                    {busy ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <Sparkles size={17} />
                    )}
                    体验内置示例
                  </button>
                </div>
                <div className="start-note">
                  <ShieldCheck size={15} />
                  本地保存记录 <span />
                  支持 PNG / JPG / WebP
                </div>
              </div>
              <div className="demo-preview">
                <div className="preview-grid" />
                <div className="preview-label">
                  <span>
                    <i />
                    SAMPLE RADIOGRAPH
                  </span>
                  <span>01 / 01</span>
                </div>
                <div className="xray-preview-frame">
                  <div className="cropped-preview">
                    <img src={DEMO_SOURCE} alt="内置马匹左前肢 X 线示例" />
                  </div>
                  <div className="preview-box">
                    <span>关节区域 · 标注示意</span>
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <div className="preview-footer">
                  <span>
                    <strong>追风</strong>
                    <span>左前肢 · 腕关节</span>
                  </span>
                  <span className="preview-tag">LF · 正位</span>
                </div>
              </div>
            </section>
            <div className="workflow-strip">
              {[
                { label: "加载影像", text: "上传图片或使用示例", Icon: Upload },
                {
                  label: "分析与标注",
                  text: "选择工具，圈定病变",
                  Icon: ScanLine,
                },
                {
                  label: "确认信息",
                  text: "填写类型与置信度",
                  Icon: CheckCheck,
                },
                {
                  label: "保存与导出",
                  text: "留存原图和标注记录",
                  Icon: ArrowDownToLine,
                },
              ].map(({ label, text, Icon }, index) => (
                <div className="workflow-step" key={label}>
                  <span className="workflow-icon">
                    <Icon size={19} />
                  </span>
                  <span>
                    <strong>
                      <em>0{index + 1}</em>
                      {label}
                    </strong>
                    <small>{text}</small>
                  </span>
                  {index < 3 && (
                    <ChevronRight size={17} className="workflow-arrow" />
                  )}
                </div>
              ))}
            </div>
            <RecordList
              records={records}
              onOpen={(id) => void openRecord(id)}
              onNew={newStudy}
              compact
            />
            <footer className="page-footer">
              <span>EQUIVISION · 运动马影像数据工作台</span>
              <span>每一处标注，都是经验的沉淀。</span>
            </footer>
          </div>
        )}

        {view === "workspace" && (
          <div className="page workspace-page">
            <div className="page-heading workspace-heading">
              <div>
                <span className="eyebrow">ANNOTATION STUDIO</span>
                <h1>
                  影像标注<span className="heading-dot">.</span>
                </h1>
                <p>
                  {image ? image.name : "加载一张影像，开始你的第一份标注。"}
                  {image && (
                    <span className="source-pill">
                      {image.source === "demo" ? "内置示例" : "本地上传"}
                    </span>
                  )}
                </p>
              </div>
              <div className="heading-actions">
                <button
                  className="button light"
                  onClick={newStudy}
                  disabled={!!busy}
                >
                  <ImagePlus size={17} />
                  {image ? "更换影像" : "加载影像"}
                </button>
                <button
                  className="button primary"
                  disabled={
                    !analysis || !annotations.length || !!busy || !!savedId
                  }
                  onClick={() => setModal("confirm")}
                >
                  {savedId ? <Check size={17} /> : <CheckCheck size={17} />}
                  {savedId ? "已保存标注" : "确认并保存"}
                </button>
              </div>
            </div>
            {!image ? (
              <div className="workspace-empty panel">
                <div className="empty-icon large">
                  <ScanLine size={36} strokeWidth={1.4} />
                </div>
                <span className="eyebrow">
                  YOUR NEXT OBSERVATION STARTS HERE
                </span>
                <h2>让影像里的细节，被看见。</h2>
                <p>使用内置 X 线示例，或上传一张本地图片体验完整标注流程。</p>
                <div className="start-actions">
                  <button className="button primary" onClick={newStudy}>
                    <Upload size={17} />
                    上传影像
                  </button>
                  <button
                    className="button light"
                    disabled={!!busy}
                    onClick={() => void loadStudy()}
                  >
                    <Sparkles size={17} />
                    使用演示示例
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="studio-progress">
                  <span className="complete">
                    <Check size={13} />
                    影像已加载
                  </span>
                  <div />
                  <span className={analysis ? "complete" : "current"}>
                    {analysis ? (
                      <Check size={13} />
                    ) : (
                      <span className="step-number">2</span>
                    )}
                    模拟分析
                  </span>
                  <div />
                  <span
                    className={
                      annotations.length
                        ? "complete"
                        : analysis
                          ? "current"
                          : ""
                    }
                  >
                    {annotations.length ? (
                      <Check size={13} />
                    ) : (
                      <span className="step-number">3</span>
                    )}
                    人工标注
                  </span>
                  <div />
                  <span className={savedId ? "complete" : ""}>
                    {savedId ? (
                      <Check size={13} />
                    ) : (
                      <span className="step-number">4</span>
                    )}
                    确认归档
                  </span>
                </div>
                <div className="studio-layout">
                  <section className="viewer-panel">
                    <div className="viewer-header">
                      <div>
                        <span className="viewer-status-dot" />
                        <strong>{horseName || "未命名马匹"}</strong>
                        <span>{bodyPart}</span>
                        <span className="viewer-lf">LF</span>
                      </div>
                      <span className="viewer-dimensions">
                        {image.width} × {image.height}
                      </span>
                    </div>
                    <div className="viewer-toolbar">
                      <div className="drawing-tools">
                        {TOOLS.map(({ id, label, shortcut, Icon }) => (
                          <button
                            key={id}
                            className={tool === id ? "active" : ""}
                            title={`${label} (${shortcut})`}
                            aria-label={label}
                            aria-pressed={tool === id}
                            disabled={!analysis || !!busy}
                            onClick={() => {
                              setTool(id);
                              setSelectedId(null);
                            }}
                          >
                            <Icon size={17} />
                            {id === tool && <span>{label}</span>}
                          </button>
                        ))}
                        <span className="toolbar-separator" />
                        <button
                          title="撤销 (⌘Z / Ctrl+Z)"
                          aria-label="撤销上一步"
                          disabled={!history.length || !!busy}
                          onClick={undo}
                        >
                          <Undo2 size={17} />
                        </button>
                      </div>
                      <div className="viewer-options">
                        <button
                          title="缩小"
                          aria-label="缩小"
                          onClick={() => setZoom(Math.max(1, zoom - 0.25))}
                          disabled={zoom <= 1}
                        >
                          <ZoomOut size={16} />
                        </button>
                        <span>{Math.round(zoom * 100)}%</span>
                        <button
                          title="放大"
                          aria-label="放大"
                          onClick={() => setZoom(Math.min(2, zoom + 0.25))}
                          disabled={zoom >= 2}
                        >
                          <ZoomIn size={16} />
                        </button>
                        <button
                          title="适应窗口"
                          aria-label="适应窗口"
                          onClick={() => setZoom(1)}
                        >
                          <Maximize size={16} />
                        </button>
                        <span className="toolbar-separator" />
                        <button
                          title="显示 / 隐藏标签"
                          aria-label="切换标签显示"
                          aria-pressed={showLabels}
                          className={
                            showLabels ? "label-toggle active" : "label-toggle"
                          }
                          onClick={() => setShowLabels(!showLabels)}
                        >
                          <Tag size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="canvas-container">
                      <AnnotationCanvas
                        image={image}
                        annotations={annotations}
                        selectedId={selectedId}
                        tool={tool}
                        zoom={zoom}
                        showLabels={showLabels}
                        onSelect={select}
                        onCreate={(type, points) => {
                          if (analysis && !busy) createAnnotation(type, points);
                        }}
                        onMoveStart={remember}
                        onMove={(id, points) => {
                          if (analysis && !busy) {
                            setSavedId(null);
                            setAnnotations((previous) =>
                              previous.map((item) =>
                                item.id === id ? { ...item, points } : item,
                              ),
                            );
                          }
                        }}
                      />
                      {busy === "analyzing" && (
                        <div className="analysis-overlay">
                          <div className="scan-animation">
                            <ScanLine size={34} />
                            <span />
                          </div>
                          <h3>正在模拟影像分析</h3>
                          <p>准备影像 · 加载示例提示</p>
                          <span className="analysis-demo-label">
                            DEMO ANALYSIS
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="viewer-hint">
                      <MousePointer2 size={14} />
                      <span>
                        {tool === "rectangle"
                          ? "按住鼠标拖动，绘制矩形标注框"
                          : tool === "line"
                            ? "按住鼠标拖动，绘制线段标注"
                            : tool === "polygon"
                              ? "单击添加顶点，双击或按 Enter 完成；Esc 取消"
                              : "单击选中标注，拖动调整位置；Delete 删除"}
                      </span>
                      <span>{annotations.length} / 50 处</span>
                    </div>
                  </section>
                  <aside className="annotation-panel panel">
                    <div className="annotation-panel-heading">
                      <h2>标注信息</h2>
                      <span className="count-pill">{annotations.length}</span>
                    </div>
                    <div
                      className={`analysis-status ${analysis ? "ready" : ""}`}
                    >
                      <span>
                        {analysis ? (
                          <Sparkles size={17} />
                        ) : (
                          <LoaderCircle size={17} className="spin" />
                        )}
                      </span>
                      <div>
                        <strong>
                          {analysis ? "模拟分析已完成" : "正在准备分析"}
                        </strong>
                        <p>
                          {analysis
                            ? "请结合影像，手动标记关注区域"
                            : "完成后即可开始绘制标注"}
                        </p>
                      </div>
                      {analysis && <Check size={15} />}
                    </div>
                    {analysis && annotations.length === 0 && (
                      <button
                        className="sample-suggestion"
                        onClick={() => {
                          changeAnnotations([
                            { ...analysis.suggestion, id: crypto.randomUUID() },
                          ]);
                          setAttributes({
                            lesion: analysis.suggestion.lesion,
                            confidence: analysis.suggestion.confidence,
                            note: analysis.suggestion.note,
                          });
                          setSelectedId(null);
                          setToast(
                            "已载入固定示例标注，可继续编辑或自行绘制。",
                          );
                        }}
                      >
                        <span>快速体验</span>载入一处示例标注{" "}
                        <ArrowUpRight size={14} />
                      </button>
                    )}
                    <div className="properties-title">
                      <span>
                        {selectedId
                          ? `正在编辑标注 ${String(activeIndex + 1).padStart(2, "0")}`
                          : "新标注属性"}
                      </span>
                      <span>{selectedId ? "实时更新" : "绘制前设置"}</span>
                    </div>
                    <div className="properties-form">
                      <label>
                        病变类型 <em>*</em>
                        <select
                          aria-label="病变类型"
                          value={attributes.lesion}
                          disabled={!analysis || !!busy}
                          onChange={(event) =>
                            changeAttributes({
                              lesion: event.target.value as Lesion,
                            })
                          }
                        >
                          {LESIONS.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="confidence-label">
                          置信程度{" "}
                          <strong>
                            {attributes.confidence}
                            <small>%</small>
                          </strong>
                        </span>
                        <input
                          aria-label="置信程度"
                          type="range"
                          min="0"
                          max="100"
                          value={attributes.confidence}
                          disabled={!analysis || !!busy}
                          onChange={(event) =>
                            changeAttributes({
                              confidence: Number(event.target.value),
                            })
                          }
                        />
                        <span className="range-labels">
                          <span>不确定</span>
                          <span>非常确定</span>
                        </span>
                      </label>
                      <label>
                        标注备注 <span className="optional">选填</span>
                        <textarea
                          aria-label="标注备注"
                          placeholder="记录位置、形态或观察说明…"
                          rows={2}
                          maxLength={500}
                          value={attributes.note}
                          disabled={!analysis || !!busy}
                          onChange={(event) =>
                            changeAttributes({ note: event.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="annotation-list-heading">
                      <span>区域列表</span>
                      <span>{annotations.length} 处</span>
                    </div>
                    <div className="annotation-list">
                      {annotations.length ? (
                        annotations.map((annotation, index) => (
                          <div
                            className={`annotation-list-item ${selectedId === annotation.id ? "selected" : ""}`}
                            key={annotation.id}
                          >
                            <button
                              className="annotation-select"
                              onClick={() => {
                                select(annotation.id);
                                setTool("select");
                              }}
                            >
                              <span className="annotation-number">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <span>
                                <strong>{annotation.lesion}</strong>
                                <small>
                                  {SHAPE_LABELS[annotation.type]} ·{" "}
                                  {annotation.confidence}% 置信度
                                </small>
                              </span>
                            </button>
                            <button
                              className="delete-button"
                              aria-label={`删除标注 ${index + 1}`}
                              onClick={() => removeAnnotation(annotation.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="no-annotations">
                          <Square size={25} strokeWidth={1.2} />
                          <p>尚未添加标注</p>
                          <small>在左侧影像上拖动鼠标开始绘制</small>
                        </div>
                      )}
                    </div>
                    <div className="panel-bottom-note">
                      <ShieldCheck size={14} />
                      固定演示结果，不代表实际诊断
                    </div>
                  </aside>
                </div>
                <div className="study-info panel">
                  <div className="study-info-title">
                    <UserRound size={19} />
                    <span>
                      <strong>归档信息</strong>
                      <small>随标注记录一同保存</small>
                    </span>
                  </div>
                  <label>
                    马匹名称
                    <input
                      aria-label="马匹名称"
                      maxLength={40}
                      value={horseName}
                      onChange={(event) => {
                        setHorseName(event.target.value);
                        setSavedId(null);
                      }}
                    />
                  </label>
                  <label>
                    检查部位
                    <input
                      aria-label="检查部位"
                      maxLength={40}
                      value={bodyPart}
                      onChange={(event) => {
                        setBodyPart(event.target.value);
                        setSavedId(null);
                      }}
                    />
                  </label>
                  <label>
                    标注人 <em>*</em>
                    <input
                      aria-label="标注人"
                      maxLength={40}
                      value={annotator}
                      onChange={(event) => {
                        setAnnotator(event.target.value);
                        setSavedId(null);
                      }}
                    />
                  </label>
                  <div className="archive-time">
                    <Clock3 size={15} />
                    <span>
                      保存时自动记录
                      <br />
                      <strong>北京时间</strong>
                    </span>
                  </div>
                </div>
                {savedId && (
                  <div className="saved-inline">
                    <span>
                      <BadgeCheck size={17} />
                      当前标注已保存，原图与标注图均已归档。
                    </span>
                    <button
                      className="text-button"
                      onClick={() => void openRecord(savedId)}
                    >
                      查看完整记录 <ArrowUpRight size={15} />
                    </button>
                    <DownloadLink id={savedId} className="text-button">
                      <ArrowDownToLine size={15} />
                      下载图片
                    </DownloadLink>
                  </div>
                )}
                {!analysis && !busy && (
                  <button
                    className="button primary"
                    onClick={() => void analyzeAgain()}
                  >
                    <Sparkles size={17} />
                    重试模拟分析
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {view === "dashboard" && (
          <DataDashboard
            studies={studies}
            records={records}
            onRefresh={refreshRecords}
            onNew={newStudy}
            onOpen={(id) => void openRecord(id)}
            onResume={(id, recordId) => void resumeStudy(id, recordId)}
          />
        )}

        {view === "records" && (
          <div className="page">
            <div className="page-heading">
              <div>
                <span className="eyebrow">ANNOTATION ARCHIVE</span>
                <h1>
                  标注记录<span className="heading-dot">.</span>
                </h1>
                <p>原始影像、标注结果与每一次专业观察，完整归档。</p>
              </div>
              <button className="button primary" onClick={newStudy}>
                <Plus size={18} />
                新建标注
              </button>
            </div>
            <div className="archive-banner">
              <span className="archive-banner-icon">
                <Database size={26} strokeWidth={1.5} />
              </span>
              <div>
                <h3>每一份影像，都有完整的标注档案</h3>
                <p>
                  记录标注人、标注时间、病变类型与置信度，支持下载标注后的图片。
                </p>
              </div>
              <div className="archive-total">
                <strong>{String(records.length).padStart(2, "0")}</strong>
                <span>份已归档影像</span>
              </div>
            </div>
            <RecordList
              records={records}
              onOpen={(id) => void openRecord(id)}
              onNew={newStudy}
            />
          </div>
        )}
      </main>

      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="上传本地影像文件"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void loadStudy(file);
        }}
      />
      {modal === "upload" && (
        <Modal
          title="开启一份新的影像标注"
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <div className="upload-modal-body">
            {error && (
              <p className="modal-error" role="alert">
                {error}
              </p>
            )}
            <p className="modal-description">
              选择一张影像，即可体验从分析到归档的完整流程。
            </p>
            {annotations.length > 0 && !savedId && (
              <div className="unsaved-warning">
                加载新影像会替换当前尚未保存的 {annotations.length} 处标注。
              </div>
            )}
            <div
              className={`upload-dropzone ${isDragging ? "dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                const file = event.dataTransfer.files[0];
                if (file) void loadStudy(file);
              }}
            >
              <div className="upload-icon">
                <Upload size={27} strokeWidth={1.5} />
              </div>
              <h3>拖拽图片到这里</h3>
              <p>或点击选择本地影像文件</p>
              <button
                className="button primary"
                disabled={!!busy}
                onClick={() => fileRef.current?.click()}
              >
                {busy === "loading" ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <ImagePlus size={17} />
                )}
                选择图片
              </button>
              <small>PNG、JPG、WebP · 单张最大 10 MB</small>
            </div>
            <div className="or-divider">
              <span />
              或使用内置演示影像
              <span />
            </div>
            <button
              className="demo-file"
              disabled={!!busy}
              onClick={() => void loadStudy()}
            >
              <span className="demo-file-preview">
                <span className="cropped-preview">
                  <img src={DEMO_SOURCE} alt="马匹 X 线演示缩略图" />
                </span>
              </span>
              <span>
                <strong>追风 · 左前肢腕关节</strong>
                <small>内置 X 线示例 / LF 正位</small>
                <span className="demo-file-badge">
                  <Sparkles size={12} />
                  无需准备图片，直接体验
                </span>
              </span>
              {busy ? (
                <LoaderCircle size={21} className="spin" />
              ) : (
                <ArrowUpRight size={21} />
              )}
            </button>
            <p className="upload-privacy">
              <ShieldCheck size={14} />
              影像仅保存到本机演示服务，不上传至分析模型。
            </p>
          </div>
        </Modal>
      )}
      {modal === "confirm" && image && (
        <Modal
          title="确认并保存标注"
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <div className="confirm-body">
            {error && (
              <p className="modal-error" role="alert">
                {error}
              </p>
            )}
            <div className="confirm-summary">
              <span className="empty-icon">
                <CheckCheck size={25} />
              </span>
              <div>
                <h3>{annotations.length} 处标注，准备归档</h3>
                <p>原始影像和标注结果将一同保存。</p>
              </div>
            </div>
            <dl className="confirmation-metadata">
              <div>
                <dt>影像名称</dt>
                <dd>{image.name}</dd>
              </div>
              <div>
                <dt>马匹 / 部位</dt>
                <dd>
                  {horseName || "尚未填写"} / {bodyPart || "尚未填写"}
                </dd>
              </div>
              <div>
                <dt>标注人</dt>
                <dd>{annotator || "尚未填写"}</dd>
              </div>
              <div>
                <dt>标注时间</dt>
                <dd>保存时自动生成 · 北京时间</dd>
              </div>
            </dl>
            <div className="confirm-annotations">
              {annotations.map((annotation, index) => (
                <div key={annotation.id}>
                  <span className="annotation-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <strong>{annotation.lesion}</strong>
                  <span>{SHAPE_LABELS[annotation.type]}</span>
                  <span className="confidence-tag">
                    {annotation.confidence}%
                  </span>
                </div>
              ))}
            </div>
            {(!horseName.trim() || !bodyPart.trim() || !annotator.trim()) && (
              <p className="validation-error">
                请返回工作台，补全马匹名称、检查部位和标注人。
              </p>
            )}
            <div className="modal-footer">
              <button
                className="button light"
                disabled={!!busy}
                onClick={() => setModal(null)}
              >
                返回修改
              </button>
              <button
                className="button primary"
                disabled={
                  !!busy ||
                  !horseName.trim() ||
                  !bodyPart.trim() ||
                  !annotator.trim()
                }
                onClick={() => void save()}
              >
                {busy === "saving" ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <CheckCheck size={17} />
                )}
                {busy === "saving" ? "正在保存…" : "确认保存标注"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {modal === "guide" && (
        <Modal title="几步，完成一份影像标注" onClose={() => setModal(null)}>
          <div className="guide-body">
            {[
              {
                title: "加载与模拟分析",
                text: "点击“开始分析”，选择内置示例或本地图片。分析接口返回固定提示，不进行真实影像推断。",
              },
              {
                title: "选择工具，绘制关注区域",
                text: "矩形框（R）与线段（L）：按住鼠标拖动。多边形（P）：单击添加顶点，双击或 Enter 完成，Esc 取消。",
              },
              {
                title: "填写标注属性",
                text: "选择病变类型、调整置信度并填写备注。点击区域列表可编辑已有标注，选择工具（V）可拖动区域，Delete 删除，⌘Z / Ctrl+Z 撤销。",
              },
              {
                title: "确认、保存与下载",
                text: "填写马匹、部位和标注人后确认保存。标注记录保留原图、标注图和北京时间，支持 PNG 下载，刷新页面后可继续查看。",
              },
            ].map((item, index) => (
              <div className="guide-step" key={item.title}>
                <span>0{index + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
            <div className="guide-note">
              <ShieldCheck size={21} />
              <div>
                <strong>关于这个演示</strong>
                <p>
                  本系统用于展示标注交互。病变名称、置信度和示例位置均为演示信息，不构成兽医诊断。每次上传和标注均独立编号，数据看板支持查询、编辑与删除。在线演示数据保存在当前浏览器，未接入真实模型。
                </p>
              </div>
            </div>
            <button
              className="button primary guide-close"
              onClick={() => setModal(null)}
            >
              了解，开始体验 <ArrowRight size={17} />
            </button>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal title="影像标注档案" onClose={() => setDetail(null)} wide>
          <RecordDetail record={detail} />
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={16} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}
