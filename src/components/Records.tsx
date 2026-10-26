import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ClipboardCheck,
  Search,
  ScanLine,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import type { AnnotationRecord, RecordSummary } from "../../shared/types";
import { formatTime } from "../api";
import { SHAPE_LABELS } from "../imaging";
import DownloadLink from "./DownloadLink";

export function RecordList({
  records,
  onOpen,
  onNew,
  compact = false,
}: {
  records: RecordSummary[];
  onOpen: (id: string) => void;
  onNew: () => void;
  compact?: boolean;
}) {
  const [search, setSearch] = useState("");
  const matching = records.filter((record) =>
    `${record.horseName} ${record.annotator} ${record.id} ${record.bodyPart}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section className="records-panel panel">
      <div className="section-header">
        <div>
          <h2>
            {compact ? "最近标注记录" : "全部标注记录"}{" "}
            <span className="count-pill">{records.length}</span>
          </h2>
          <p>从原始影像到标注结果，每一步都有据可循</p>
        </div>
        {!compact && (
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="搜索标注记录"
              placeholder="搜索马匹、标注人或编号"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        )}
      </div>
      {matching.length ? (
        <div className="record-table-wrap">
          <table className="record-table">
            <thead>
              <tr>
                <th>影像 / 马匹</th>
                <th>标注信息</th>
                <th>标注人</th>
                <th>标注时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {(compact ? matching.slice(0, 3) : matching).map((record) => (
                <tr key={record.id}>
                  <td>
                    <button
                      className="record-name"
                      onClick={() => onOpen(record.id)}
                    >
                      <span className="record-thumb">
                        <ScanLine size={22} />
                      </span>
                      <span>
                        <strong>
                          {record.horseName}
                          <span className="tiny-tag">LF</span>
                        </strong>
                        <small>{record.id}</small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className="record-bodypart">{record.bodyPart}</span>
                    <small className="muted">
                      {record.annotations.length} 处标注 ·{" "}
                      <span className="green-text">已归档</span>
                    </small>
                  </td>
                  <td>
                    <span className="annotator-name">
                      <UserRound size={14} />
                      {record.annotator}
                    </span>
                  </td>
                  <td className="record-date">
                    {formatTime(record.createdAt)}
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => onOpen(record.id)}
                    >
                      查看 <ArrowUpRight size={14} />
                    </button>
                    <DownloadLink
                      id={record.id}
                      className="row-download"
                      title="下载标注图片"
                      label={`下载 ${record.horseName} 的标注图片`}
                    >
                      <ArrowDownToLine size={16} />
                    </DownloadLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-records">
          <div className="empty-icon">
            <ClipboardCheck size={26} />
          </div>
          <h3>{search ? "没有找到匹配的记录" : "第一份标注，等你开始"}</h3>
          <p>
            {search
              ? "试试其他马匹名称、标注人或记录编号"
              : "保存后的原图、标注图和操作信息将在这里完整留存"}
          </p>
          {!search && (
            <button className="text-button" onClick={onNew}>
              开始第一份标注 <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function RecordDetail({ record }: { record: AnnotationRecord }) {
  return (
    <div className="record-detail">
      <div className="detail-success">
        <span>
          <Check size={16} />
          标注已保存
        </span>
        <span>{record.id}</span>
      </div>
      <div className="comparison-grid">
        <div>
          <div className="comparison-label">
            <span>原始影像</span>
            <span>ORIGINAL</span>
          </div>
          <div className="comparison-image">
            <img src={record.original.dataUrl} alt="保存的原始 X 线影像" />
          </div>
        </div>
        <div>
          <div className="comparison-label">
            <span>标注结果</span>
            <span className="green-text">
              {record.annotations.length} 处标注
            </span>
          </div>
          <div className="comparison-image">
            <img src={record.annotatedImage} alt="保存的标注结果图片" />
          </div>
        </div>
      </div>
      <dl className="record-metadata">
        <div>
          <dt>马匹名称</dt>
          <dd>{record.horseName}</dd>
        </div>
        <div>
          <dt>检查部位</dt>
          <dd>{record.bodyPart}</dd>
        </div>
        <div>
          <dt>标注人</dt>
          <dd>{record.annotator}</dd>
        </div>
        <div>
          <dt>标注时间（北京时间）</dt>
          <dd>{formatTime(record.createdAt)}</dd>
        </div>
      </dl>
      <div className="saved-annotations">
        {record.annotations.map((annotation, index) => (
          <div key={annotation.id}>
            <span className="annotation-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <strong>{annotation.lesion}</strong>
            <span>{SHAPE_LABELS[annotation.type]}</span>
            <span className="confidence-tag">
              {annotation.confidence}% 置信度
            </span>
            {annotation.note && <p>{annotation.note}</p>}
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <p>
          <ScanLine size={15} />
          演示标注，不用于临床诊断
        </p>
        <DownloadLink id={record.id} className="button primary">
          <ArrowDownToLine size={17} />
          下载标注图片
        </DownloadLink>
      </div>
    </div>
  );
}
