import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  FileImage,
  Filter,
  LoaderCircle,
  Pencil,
  Plus,
  ScanLine,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { RecordSummary, Study, StudySummary } from "../../shared/types";
import { LESIONS, STATUS_LABELS } from "../../shared/types";
import { api, BROWSER_DEMO, formatTime } from "../api";
import Modal from "./Modal";
import DownloadLink from "./DownloadLink";

interface Props {
  studies: StudySummary[];
  records: RecordSummary[];
  onRefresh: () => Promise<void>;
  onNew: () => void;
  onOpen: (id: string) => void;
  onResume: (studyId: string, recordId?: string) => void;
}
type Selection =
  | { kind: "study"; item: StudySummary }
  | { kind: "record"; item: RecordSummary };
const COLORS = ["#2d614b", "#7c946a", "#aaba89", "#c9be88", "#e2e4cf"];

export default function DataDashboard({
  studies,
  records,
  onRefresh,
  onNew,
  onOpen,
  onResume,
}: Props) {
  const [tab, setTab] = useState<"studies" | "records">("studies");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState("createdAt");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Selection | null>(null);
  const [deleting, setDeleting] = useState<Selection | null>(null);
  const [studyDetail, setStudyDetail] = useState<Study | null>(null);
  const [fields, setFields] = useState({
    name: "",
    horseName: "",
    bodyPart: "",
    annotator: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const annotations = records.flatMap((r) => r.annotations);
  const total = annotations.length;
  const analyzed = studies.filter((s) => s.status !== "uploaded").length;
  const completion = studies.length
    ? Math.round(
        (studies.filter((s) => s.status === "annotated").length /
          studies.length) *
          100,
      )
    : 0;
  const distribution = LESIONS.map((label, i) => ({
    label,
    color: COLORS[i],
    count: annotations.filter((a) => a.lesion === label).length,
  }));
  let angle = 0;
  const segments = distribution.map((item) => {
    const from = angle;
    angle += total ? (item.count / total) * 100 : 0;
    return `${item.color} ${from}% ${angle}%`;
  });
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
    }).format(date);
    const match = (value: string) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(
        new Date(value),
      ) === key;
    return {
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      uploads: studies.filter((s) => match(s.createdAt)).length,
      saved: records.filter((r) => match(r.createdAt)).length,
    };
  });
  const maximum = Math.max(2, ...days.flatMap((d) => [d.uploads, d.saved]));
  const rows = useMemo(() => {
    const values: (StudySummary | RecordSummary)[] =
      tab === "studies" ? studies : records;
    return values
      .filter((item) => {
        const name =
          "name" in item
            ? item.name
            : item.annotations.map((a) => a.lesion).join(" ");
        const matches =
          `${item.id} ${item.horseName} ${item.bodyPart} ${item.annotator} ${name}`
            .toLowerCase()
            .includes(search.toLowerCase().trim());
        return (
          matches &&
          (source === "all" || item.source === source) &&
          (status === "all" ||
            ("status" in item ? item.status : "annotated") === status)
        );
      })
      .sort((a, b) =>
        sort === "id"
          ? b.id.localeCompare(a.id, undefined, { numeric: true })
          : new Date(b[sort as "createdAt" | "updatedAt"]).getTime() -
            new Date(a[sort as "createdAt" | "updatedAt"]).getTime(),
      );
  }, [tab, studies, records, search, source, status, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / 6));
  const current = Math.min(page, pages);
  const reset = () => {
    setSearch("");
    setStatus("all");
    setSource("all");
    setPage(1);
  };
  function startEdit(selection: Selection) {
    setFields({
      name: selection.kind === "study" ? selection.item.name : "",
      horseName: selection.item.horseName,
      bodyPart: selection.item.bodyPart,
      annotator: selection.item.annotator,
    });
    setError("");
    setEdit(selection);
  }
  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      if (edit.kind === "study") await api.updateStudy(edit.item.id, fields);
      else await api.updateRecord(edit.item.id, fields);
      await onRefresh();
      setEdit(null);
      setMessage("记录已更新，原编号和创建时间已保留。");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      if (deleting.kind === "study") await api.deleteStudy(deleting.item.id);
      else await api.deleteRecord(deleting.item.id);
      await onRefresh();
      setDeleting(null);
      setMessage("记录已删除，数据看板已同步更新。");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function showStudy(id: string) {
    setError("");
    try {
      setStudyDetail(await api.study(id));
    } catch (error) {
      setError((error as Error).message);
    }
  }

  return (
    <div className="page data-dashboard">
      <div className="page-heading">
        <div>
          <span className="eyebrow">IMAGE DATA INTELLIGENCE</span>
          <h1>
            影像数据看板<span className="heading-dot">.</span>
          </h1>
          <p>从影像上传到标注归档，让每一份数据清晰可循。</p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={17} />
          新增影像
        </button>
      </div>
      <div className="dashboard-context">
        <span>
          <Database size={14} />
          影像与标注统一管理
        </span>
        <span>
          <span className="context-dot" />
          {BROWSER_DEMO ? "演示数据 · 当前浏览器保存" : "模拟 API · 本地持久化"}
        </span>
      </div>
      <div className="dashboard-metrics">
        {[
          {
            label: "累计上传影像",
            value: studies.length,
            unit: "张",
            caption: `${studies.filter((s) => s.source === "upload").length} 张本地上传`,
            Icon: FileImage,
          },
          {
            label: "已完成模拟分析",
            value: analyzed,
            unit: "张",
            caption: `${studies.length - analyzed} 张等待分析`,
            Icon: ScanLine,
          },
          {
            label: "标注归档记录",
            value: records.length,
            unit: "份",
            caption: `${completion}% 影像完成归档`,
            Icon: CheckCheck,
          },
          {
            label: "累计病变标注",
            value: total,
            unit: "处",
            caption: `覆盖 ${distribution.filter((d) => d.count).length} 种病变类型`,
            Icon: BarChart3,
          },
        ].map(({ label, value, unit, caption, Icon }) => (
          <div className="dashboard-metric panel" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>
              {String(value).padStart(2, "0")}
              <small>{unit}</small>
            </strong>
            <p>
              <span />
              {caption}
            </p>
          </div>
        ))}
      </div>
      <div className="dashboard-charts">
        <section className="panel trend-panel">
          <div className="chart-heading">
            <div>
              <h2>影像与标注趋势</h2>
              <p>从上传到归档，记录每一天的数据积累</p>
            </div>
            <span className="period-label">
              <Clock3 size={12} />
              最近 7 天
            </span>
          </div>
          <div className="chart-legend">
            <span>
              <i />
              上传影像
            </span>
            <span>
              <i />
              标注归档
            </span>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label="最近七天的影像上传与标注归档数量"
          >
            <div className="chart-gridlines">
              {[maximum, Math.ceil(maximum / 2), 0].map((n, i) => (
                <div key={i}>
                  <span>{n}</span>
                  <i />
                </div>
              ))}
            </div>
            <div className="chart-bars">
              {days.map((day) => (
                <div className="bar-day" key={day.label}>
                  <div>
                    <div
                      className="upload-bar"
                      style={{
                        height: `${Math.max(2, (day.uploads / maximum) * 100)}%`,
                      }}
                      title={`${day.label} 上传 ${day.uploads} 张`}
                    >
                      <span>{day.uploads > 0 && day.uploads}</span>
                    </div>
                    <div
                      className="saved-bar"
                      style={{
                        height: `${Math.max(2, (day.saved / maximum) * 100)}%`,
                      }}
                      title={`${day.label} 归档 ${day.saved} 份`}
                    >
                      <span>{day.saved > 0 && day.saved}</span>
                    </div>
                  </div>
                  <span>{day.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="panel distribution-panel">
          <div className="chart-heading">
            <div>
              <h2>病变类型分布</h2>
              <p>已保存标注的类型构成</p>
            </div>
            <ScanLine size={17} />
          </div>
          <div className="distribution-content">
            <div
              className="donut"
              style={{
                background: total
                  ? `conic-gradient(${segments.join(",")})`
                  : "#edf1e6",
              }}
              role="img"
              aria-label={`共 ${total} 处病变标注`}
            >
              <div>
                <strong>{total}</strong>
                <span>标注总数</span>
              </div>
            </div>
            <div className="distribution-legend">
              {distribution.map((item) => (
                <div key={item.label}>
                  <span>
                    <i style={{ background: item.color }} />
                    {item.label}
                  </span>
                  <strong>
                    {item.count}
                    <small>处</small>
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      <section className="panel dashboard-records">
        <div className="dashboard-table-heading">
          <div>
            <h2>影像分析记录</h2>
            <p>独立编号储存 · 完整记录生命周期</p>
          </div>
          <span className="dashboard-count">
            共 {studies.length} 张影像 / {records.length} 份标注
          </span>
        </div>
        <div className="record-tabs">
          <button
            className={tab === "studies" ? "active" : ""}
            onClick={() => {
              setTab("studies");
              reset();
            }}
          >
            影像记录 <span>{studies.length}</span>
          </button>
          <button
            className={tab === "records" ? "active" : ""}
            onClick={() => {
              setTab("records");
              reset();
            }}
          >
            标注记录 <span>{records.length}</span>
          </button>
        </div>
        <div className="dashboard-filters">
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="搜索数据记录"
              placeholder="搜索编号、马匹、影像名称或标注人"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="filter-select">
            <Filter size={13} />
            <select
              aria-label="按记录状态筛选"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">全部状态</option>
              {Object.entries(STATUS_LABELS)
                .filter(([key]) => tab === "studies" || key === "annotated")
                .map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
            </select>
          </div>
          <select
            aria-label="按图片来源筛选"
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">全部来源</option>
            <option value="demo">内置示例</option>
            <option value="upload">本地上传</option>
          </select>
          <select
            aria-label="记录排序"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="createdAt">最近创建</option>
            <option value="updatedAt">最近更新</option>
            <option value="id">编号降序</option>
          </select>
          {(search || source !== "all" || status !== "all") && (
            <button className="filter-reset" onClick={reset}>
              <X size={12} />
              重置
            </button>
          )}
        </div>
        {error && !edit && !deleting && (
          <p className="modal-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <div className="dashboard-message" role="status">
            <CheckCheck size={14} />
            {message}
            <button aria-label="关闭操作提示" onClick={() => setMessage("")}>
              <X size={13} />
            </button>
          </div>
        )}
        <div className="record-table-wrap">
          <table className="record-table dashboard-table">
            <thead>
              <tr>
                <th>记录编号 / 影像</th>
                <th>马匹 / 部位</th>
                <th>状态</th>
                <th>{tab === "studies" ? "标注关联" : "标注人"}</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice((current - 1) * 6, current * 6).map((item) => {
                const isStudy = "status" in item;
                const selection: Selection = isStudy
                  ? { kind: "study", item }
                  : { kind: "record", item };
                const recordId = isStudy ? item.latestRecordId : item.id;
                return (
                  <tr key={item.id}>
                    <td>
                      <button
                        className="record-name"
                        onClick={() =>
                          isStudy ? void showStudy(item.id) : onOpen(item.id)
                        }
                      >
                        <span className="record-thumb">
                          <ScanLine size={20} />
                        </span>
                        <span>
                          <strong className="record-identifier">
                            {item.id}
                          </strong>
                          <small className="image-filename">
                            {isStudy
                              ? item.name
                              : `${item.studyId} · ${item.annotations.length} 处标注`}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className="db-horse-name">{item.horseName}</span>
                      <small className="muted">{item.bodyPart}</small>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${isStudy ? item.status : "annotated"}`}
                      >
                        <i />
                        {isStudy ? STATUS_LABELS[item.status] : "已归档"}
                      </span>
                      <small className="row-source">
                        {item.source === "demo" ? "内置示例" : "本地上传"}
                      </small>
                    </td>
                    <td>
                      {isStudy ? (
                        <>
                          <strong className="relation-count">
                            {item.recordCount}
                            <small>份记录</small>
                          </strong>
                          <small className="muted">
                            {item.annotationCount} 处标注
                          </small>
                        </>
                      ) : (
                        <span>{item.annotator}</span>
                      )}
                    </td>
                    <td className="record-date">
                      {formatTime(item.createdAt)}
                      <small className="muted">北京时间</small>
                    </td>
                    <td>
                      <div className="dashboard-row-actions">
                        <button
                          className="text-button"
                          onClick={() =>
                            isStudy ? void showStudy(item.id) : onOpen(item.id)
                          }
                        >
                          详情 <ArrowUpRight size={12} />
                        </button>
                        <button
                          className="action-icon"
                          title="编辑记录信息"
                          aria-label={`编辑 ${item.id}`}
                          onClick={() => startEdit(selection)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="action-icon"
                          title="继续标注"
                          aria-label={`继续标注 ${item.id}`}
                          onClick={() =>
                            onResume(
                              isStudy ? item.id : item.studyId,
                              recordId || undefined,
                            )
                          }
                        >
                          <ScanLine size={15} />
                        </button>
                        {recordId && (
                          <DownloadLink
                            id={recordId}
                            className="action-icon"
                            label={`下载 ${item.id}`}
                            title="下载标注图"
                          >
                            <ArrowDownToLine size={14} />
                          </DownloadLink>
                        )}
                        <button
                          className="action-icon danger"
                          title="删除记录"
                          aria-label={`删除 ${item.id}`}
                          onClick={() => {
                            setError("");
                            setDeleting(selection);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && (
            <div className="dashboard-empty">
              <Database size={30} strokeWidth={1.3} />
              <h3>暂无匹配记录</h3>
              <p>调整筛选条件，或新增一张影像开始演示。</p>
              <button className="text-button" onClick={onNew}>
                新增影像 <ArrowRight size={13} />
              </button>
            </div>
          )}
        </div>
        <div className="dashboard-pagination">
          <span>
            显示 {rows.length ? (current - 1) * 6 + 1 : 0}–
            {Math.min(current * 6, rows.length)} 条，共 {rows.length} 条记录
          </span>
          <div>
            <button
              aria-label="上一页记录"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={15} />
            </button>
            <span>
              {current} / {pages}
            </span>
            <button
              aria-label="下一页记录"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </section>
      <p className="dashboard-storage-note">
        <Database size={12} />
        {BROWSER_DEMO
          ? "演示数据保存在当前浏览器。不同浏览器独立保存，所有分析结果均为模拟数据。"
          : "所有上传与标注均已编号保存，删除影像时会同步删除关联标注记录。"}
      </p>
      {edit && (
        <Modal
          title={`编辑${edit.kind === "study" ? "影像" : "标注"}记录`}
          onClose={() => {
            if (!busy) setEdit(null);
          }}
        >
          <form
            className="dashboard-edit-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <div className="immutable-id">
              <Database size={16} />
              <span>{edit.item.id}</span>
              <small>编号保持不变</small>
            </div>
            {error && (
              <p className="modal-error" role="alert">
                {error}
              </p>
            )}
            {(
              [
                { key: "name", label: "影像名称" },
                { key: "horseName", label: "马匹名称" },
                { key: "bodyPart", label: "检查部位" },
                { key: "annotator", label: "标注人" },
              ] as const
            )
              .filter((field) => edit.kind === "study" || field.key !== "name")
              .map((field) => (
                <label key={field.key}>
                  {field.label}
                  <em>*</em>
                  <input
                    aria-label={`编辑${field.label}`}
                    required
                    maxLength={field.key === "name" ? 200 : 40}
                    value={fields[field.key]}
                    onChange={(e) =>
                      setFields({ ...fields, [field.key]: e.target.value })
                    }
                  />
                </label>
              ))}
            <div className="modal-footer">
              <button
                type="button"
                className="button light"
                disabled={busy}
                onClick={() => setEdit(null)}
              >
                取消
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <CheckCheck size={16} />
                )}
                保存修改
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="删除记录确认"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <div className="dashboard-delete">
            <span className="delete-large-icon">
              <Trash2 size={25} />
            </span>
            <h3>删除 {deleting.item.id}？</h3>
            <p>
              {deleting.kind === "study"
                ? `将移除此图片，以及关联的 ${deleting.item.recordCount} 份标注记录。`
                : "将移除此标注档案，原始上传图片会保留，可重新标注。"}
            </p>
            <p className="delete-warning">删除后无法恢复，请确认所选记录。</p>
            {error && (
              <p className="modal-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-footer">
              <button
                className="button light"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                取消
              </button>
              <button
                className="button danger-button"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                确认删除
              </button>
            </div>
          </div>
        </Modal>
      )}
      {studyDetail && (
        <Modal title="影像分析档案" onClose={() => setStudyDetail(null)}>
          <div className="study-detail">
            <div className="detail-success">
              <span>{STATUS_LABELS[studyDetail.status]}</span>
              <span>{studyDetail.id}</span>
            </div>
            <div className="study-detail-image">
              <img src={studyDetail.image.dataUrl} alt="影像记录原始图片" />
            </div>
            <dl className="confirmation-metadata">
              {[
                { label: "影像名称", value: studyDetail.image.name },
                {
                  label: "马匹 / 部位",
                  value: `${studyDetail.horseName} / ${studyDetail.bodyPart}`,
                },
                { label: "标注人", value: studyDetail.annotator },
                { label: "上传时间", value: formatTime(studyDetail.createdAt) },
                { label: "更新于", value: formatTime(studyDetail.updatedAt) },
              ].map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
            <div className="modal-footer">
              <span className="study-detail-number">
                {studyDetail.image.width} × {studyDetail.image.height}
              </span>
              <button
                className="button primary"
                onClick={() => {
                  const id = studies.find(
                    (s) => s.id === studyDetail.id,
                  )?.latestRecordId;
                  setStudyDetail(null);
                  onResume(studyDetail.id, id || undefined);
                }}
              >
                <ScanLine size={16} />
                {studyDetail.status === "annotated" ? "编辑标注" : "开始标注"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
