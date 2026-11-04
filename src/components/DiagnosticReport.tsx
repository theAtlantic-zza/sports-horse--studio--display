import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CheckCheck,
  ClipboardCheck,
  FileCheck2,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { AnnotationRecord } from "../../shared/types";
import { ANNOTATORS } from "../../shared/types";
import { api, formatTime } from "../api";
import Modal from "./Modal";

interface Props {
  record: AnnotationRecord;
  onReviewed?: (record: AnnotationRecord) => void;
  onDashboard?: () => void;
}

export default function DiagnosticReport({
  record,
  onReviewed,
  onDashboard,
}: Props) {
  const [current, setCurrent] = useState(record);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewer, setReviewer] = useState(record.annotator);
  const [conclusion, setConclusion] = useState(
    "已核对影像、检查部位及分析结果，确认本次演示报告并归档。",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setCurrent(record);
    setReviewer(record.annotator);
  }, [record]);
  const diagnosis = current.diagnosis;
  if (!diagnosis) return null;
  const reviewed = diagnosis.status === "reviewed";
  const primary = diagnosis.scores[0];

  async function review() {
    setError("");
    setBusy(true);
    try {
      const next = await api.reviewRecord(current.id, { reviewer, conclusion });
      setCurrent(next);
      setReviewOpen(false);
      onReviewed?.(next);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="diagnostic-report"
      data-testid="diagnosis-report"
      aria-label="辅助诊疗报告详情"
    >
      <div className="diagnostic-title">
        <div className="diagnostic-heading-icon">
          <FileCheck2 size={23} />
        </div>
        <div>
          <span className="clinical-kicker">ASSISTED DIAGNOSTIC REPORT</span>
          <h2>AI 辅助诊疗报告</h2>
        </div>
        <span
          className={`clinical-status ${reviewed ? "reviewed" : "pending"}`}
        >
          {reviewed ? <BadgeCheck size={15} /> : <ClipboardCheck size={15} />}
          {reviewed ? "已人工复核" : "待人工复核"}
        </span>
      </div>
      <div className="diagnostic-metadata">
        <div>
          <span>报告编号</span>
          <strong>{current.id}</strong>
        </div>
        <div>
          <span>马匹 / 检查部位</span>
          <strong>
            {current.horseName} · {diagnosis.bodyPart}
          </strong>
        </div>
        <div>
          <span>影像编号</span>
          <strong>{current.studyId}</strong>
        </div>
        <div>
          <span>生成时间 · 北京时间</span>
          <strong>{formatTime(diagnosis.generatedAt)}</strong>
        </div>
      </div>
      <div className="diagnostic-content">
        <div className="diagnostic-image-panel">
          <div>
            <span>本次分析影像</span>
            <span>ANNOTATED IMAGE</span>
          </div>
          <img src={current.annotatedImage} alt="诊疗报告中的标注影像" />
          <p>
            <ScanBadge />
            {diagnosis.inputMode === "manual"
              ? `${current.annotations.length} 处人工标注`
              : "已标注影像"}
            <span>演示样本</span>
          </p>
        </div>
        <div className="diagnostic-findings">
          <div className="diagnostic-primary">
            <div>
              <span>
                <Sparkles size={14} /> 主要病变倾向
              </span>
              <h3>{primary.lesion}</h3>
              <p>辅助分析结果 · 模拟百分比</p>
            </div>
            <strong>
              {primary.percentage}
              <small>%</small>
            </strong>
          </div>
          <div className="diagnostic-scores" aria-label="模拟病变倾向百分比">
            {diagnosis.scores.map((score, i) => (
              <div className="diagnostic-score" key={score.lesion}>
                <div>
                  <span>{score.lesion}</span>
                  <strong>{score.percentage}%</strong>
                </div>
                <div className="diagnostic-track">
                  <span
                    style={{
                      width: `${score.percentage}%`,
                      opacity: 1 - i * 0.22,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="diagnostic-notes">
            <div>
              <h4>影像发现</h4>
              <p>{diagnosis.finding}</p>
            </div>
            <div>
              <h4>诊疗建议 · 演示</h4>
              <p>{diagnosis.recommendation}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="diagnostic-disclaimer">
        <ShieldCheck size={20} />
        <div>
          <strong>AI 仅提供参考，最终结论由人工复核确认。</strong>
          <p>百分比为固定演示数据，未接入真实模型，不代表实际患病概率。</p>
        </div>
        <span>HUMAN IN THE LOOP</span>
      </div>
      {reviewed && (
        <div className="diagnostic-reviewed" role="status">
          <BadgeCheck size={20} />
          <div>
            <strong>人工复核已完成 · {diagnosis.reviewer}</strong>
            <p>{diagnosis.reviewConclusion}</p>
          </div>
          <span>
            {diagnosis.reviewedAt && formatTime(diagnosis.reviewedAt)}
          </span>
        </div>
      )}
      <div className="diagnostic-actions">
        <span>
          <UserRound size={15} />
          {reviewed
            ? "报告与人工意见已一同留存"
            : "报告草稿已保存，等待人工确认"}
        </span>
        {!reviewed ? (
          <button
            className="button primary"
            onClick={() => setReviewOpen(true)}
          >
            <ClipboardCheck size={18} />
            人工复核
            <ArrowRight size={16} />
          </button>
        ) : onDashboard ? (
          <button className="button primary" onClick={onDashboard}>
            查看数据看板
            <ArrowRight size={17} />
          </button>
        ) : (
          <span className="diagnostic-final-label">
            <CheckCheck size={17} />
            已复核归档
          </span>
        )}
      </div>
      {reviewOpen && (
        <Modal
          title="人工复核"
          onClose={() => {
            if (!busy) setReviewOpen(false);
          }}
        >
          <form
            className="clinical-review-form"
            onSubmit={(event) => {
              event.preventDefault();
              void review();
            }}
          >
            <div className="clinical-review-summary">
              <ClipboardCheck size={24} />
              <div>
                <strong>请核对本次辅助分析结果</strong>
                <p>
                  {primary.lesion} · {primary.percentage}%（模拟） /{" "}
                  {current.id}
                </p>
              </div>
            </div>
            <label>
              复核人
              <select
                aria-label="复核人"
                value={reviewer}
                onChange={(event) => setReviewer(event.target.value)}
                disabled={busy}
              >
                {[...new Set([record.annotator, ...ANNOTATORS])].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              复核意见
              <textarea
                aria-label="复核意见"
                value={conclusion}
                onChange={(event) => setConclusion(event.target.value)}
                required
                maxLength={1000}
                rows={3}
                disabled={busy}
              />
            </label>
            <p className="clinical-review-note">
              <ShieldCheck size={15} />
              AI 分析与人工复核意见分别留存，可在看板中追溯。
            </p>
            {error && (
              <p className="modal-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-footer">
              <button
                type="button"
                className="button light"
                onClick={() => setReviewOpen(false)}
                disabled={busy}
              >
                取消
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={busy || !conclusion.trim()}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <CheckCheck size={17} />
                )}
                确认复核并归档
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function ScanBadge() {
  return <span className="diagnostic-image-dot" />;
}
