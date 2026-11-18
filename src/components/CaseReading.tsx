import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileText, ScanLine } from "lucide-react";
import { api } from "../api";
import { prepareUpload, renderAnnotated } from "../imaging";
import { LESIONS, type AnnotationRecord, type ViewerAction, type ViewerState } from "../../shared/types";
import DiagnosticReport from "./DiagnosticReport";
import { mountViewer, type ReadingCase } from "./viewer/viewer";
import "./viewer/viewer.css";
import "./viewer/reading.css";

function snapshot(record: AnnotationRecord, data: ViewerState): ReadingCase {
  return {
    id:record.id, status:record.diagnosis?.status === "reviewed" ? "reviewed" : record.diagnosis ? "analyzed" : "uploaded",
    archived_at:record.diagnosis?.archivedAt || null, body_part:record.bodyPart, detections:[],
    images:data.images.map(im=>({...im, url:im.dataUrl,
      measurements:im.measurements.map(m=>({...m, created_by:m.createdBy}))})),
  };
}

export default function CaseReading({ id, showReport, user, refresh }: {
  id:string; showReport:boolean; user:string; refresh:()=>Promise<void>;
}) {
  const [record,setRecord]=useState<AnnotationRecord | null>(null);
  const [data,setData]=useState<ViewerState | null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [lesion,setLesion]=useState<(typeof LESIONS)[number]>("骨折疑似");
  const host=useRef<HTMLDivElement>(null);
  const picker=useRef<HTMLInputElement>(null);
  const reportURL="#viewer/"+id+"/report";
  const viewerURL="#viewer/"+id;
  useEffect(()=>{
    let active=true;
    setError("");setRecord(null);setData(null);
    Promise.all([api.record(id),api.viewer(id)]).then(([r,v])=>{
      if(active){setRecord(r);setData(v);setLesion(r.annotations[0]?.lesion || "骨折疑似");}
    }).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[id,showReport]);
  useEffect(()=>{
    if (!host.current || !data || !record || showReport) return;
    const reading=record;
    return mountViewer(host.current,snapshot(reading,data),{
      onUpload:reading.diagnosis?.status === "reviewed" ? undefined : ()=>picker.current?.click(),
      onReport:()=>{location.hash=reportURL;},
      api:async (path,{method,body})=>{
        const [,imageId,measurementId] = /\/images\/([^/]+)(?:\/measurements(?:\/([^/]+))?)?$/.exec(path) || [];
        if(!imageId) throw new Error("找不到这张影像。");
        const payload=body ? JSON.parse(body) : {};
        let action: ViewerAction;
        if(method==="DELETE") action={op:"removeMeasurement",imageId,measurementId};
        else if(method==="PATCH") action={op:"metadata",imageId,projection:payload.projection,quality:payload.quality};
        else action={op:"measure",imageId,kind:payload.kind,points:payload.points,author:user};
        return snapshot(reading,await api.updateViewer(id,action));
      },
    });
  },[data,record,id,reportURL,showReport,user]);

  async function attach(file: File) {
    setBusy(true);setError("");
    try {
      const image=await prepareUpload(file);
      setData(await api.updateViewer(id,{op:"attach",image}));
    } catch(e) {setError((e as Error).message);}
    finally {setBusy(false);if(picker.current)picker.current.value="";}
  }
  const sampleName="同片标注对照.png";
  async function addAnnotatedCopy() {
    if (!record || busy || !data || data.images.some(im=>im.derivedFrom==="primary")) return;
    setError(""); setBusy(true);
    try {
      const image={...record.original, name:sampleName, dataUrl:await renderAnnotated(record.original,record.annotations,false)};
      setData(await api.updateViewer(id,{op:"attachAnnotatedCopy",image}));
    } catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }
  async function analyze() {
    if(!record || busy) return;
    setBusy(true);setError("");
    try {
      const updated=await api.diagnoseRecord(id,{bodyPart:record.bodyPart,targetLesion:lesion,inputMode:"annotated"});
      setRecord(updated);await refresh();
    } catch(e){setError((e as Error).message);}
    finally {setBusy(false);}
  }
  const hasReport=!!record?.diagnosis;
  return <div className="page case-reading-page">
    <header className="reading-head"><div>
      <a href={showReport ? viewerURL : "#dashboard"}><ArrowLeft size={15}/>{showReport ? "返回阅片" : "历史记录"}</a>
      <div><h1>{record?.horseName || "病例阅片"}</h1><span>{showReport ? "复核报告" : "影像工作台"}</span><code>{id}</code></div>
    </div></header>
    {error && <p role="alert" className="clinical-error">{error}</p>}
    {(!record || !data) && !error && <p role="status">正在读取病例影像…</p>}
    {record && data && !showReport && <>
      <section className="reading-result" aria-label="主图分析状态">
        <ScanLine size={23} aria-hidden="true"/>
        <div><strong>{record.diagnosis ? "模拟分析已完成" : "主图已载入，等待模拟分析"}</strong>
          <p>{record.diagnosis
            ? `主要关注项 · ${record.diagnosis.scores[0].lesion} ${record.diagnosis.scores[0].percentage}%（固定演示分数）`
            : "选择关注的病变类型后即可生成示例报告。"}</p></div>
        <a className="button primary" href={reportURL}><FileText size={17}/>{hasReport ? "查看复核报告" : "分析与复核"}</a>
      </section>
      <div ref={host}/><input aria-label="上传对照影像" type="file" accept="image/png,image/jpeg,image/webp" ref={picker} hidden onChange={e=>{const f=e.target.files?.[0];if(f)void attach(f);}}/>
      {record.original.source==="demo" && record.annotations.length>0 && record.diagnosis?.status!=="reviewed" &&
        !data.images.some(im=>im.derivedFrom==="primary") && <div className="sample-compare">
          <button type="button" className="text-button" disabled={busy} onClick={()=>void addAnnotatedCopy()}>载入标注对照片</button>
          <span>用同一张原片与已保存的标注图演示对照。不同投照位请从「补充影像」上传。</span>
        </div>}
      {busy && <p role="status">正在保存影像…</p>}
    </>}
    {record && data && showReport && <details className="reading-evidence"><summary>本次检查影像与测量 · {data.images.length} 张</summary>
      {data.images.map(im=><div key={im.id}><strong>{im.filename} · {im.projection}</strong><span>{im.measurements.length ?
          im.measurements.map(m=>(m.kind==="distance"?"距离 ":"角度 ")+m.value.toFixed(1)+" "+m.unit).join("　") : "暂无测量"}</span></div>)}</details>}
    {record && data && showReport && (hasReport ? <DiagnosticReport record={record} onChange={r=>{setRecord(r);void refresh();}} onDashboard={()=>{location.hash="dashboard";}}/> :
      <section className="panel reading-analysis"><ScanLine size={27}/><h2>分析本次检查主图</h2><p>{record.bodyPart} · {record.original.name}</p>
        <label>关注病变类型<select value={lesion} disabled={busy} onChange={e=>setLesion(e.target.value as typeof lesion)}>{LESIONS.map(l=><option key={l}>{l}</option>)}</select></label>
        <button className="button primary" disabled={busy} onClick={()=>void analyze()}>{busy ? "正在生成模拟分析报告…" : "开始模拟分析"}</button>
      </section>)}
  </div>;
}
