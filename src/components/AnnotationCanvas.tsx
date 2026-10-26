import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  Annotation,
  Point,
  ShapeType,
  StudyImage,
} from "../../shared/types";

export type Tool = ShapeType | "select";

interface Props {
  image: StudyImage;
  annotations: Annotation[];
  selectedId: string | null;
  tool: Tool;
  zoom: number;
  showLabels: boolean;
  onSelect: (id: string | null) => void;
  onCreate: (type: ShapeType, points: Point[]) => void;
  onMove: (id: string, points: Point[]) => void;
  onMoveStart: () => void;
}

export default function AnnotationCanvas({
  image,
  annotations,
  selectedId,
  tool,
  zoom,
  showLabels,
  onSelect,
  onCreate,
  onMove,
  onMoveStart,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const drag = useRef<{ start: Point; id?: string; points?: Point[] } | null>(
    null,
  );

  useEffect(() => {
    setDraft([]);
    drag.current = null;
  }, [tool, image]);

  function position(event: ReactPointerEvent<SVGSVGElement>): Point {
    const matrix = svgRef.current!.getScreenCTM()!.inverse();
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix,
    );
    return {
      x: Math.min(1, Math.max(0, point.x / image.width)),
      y: Math.min(1, Math.max(0, point.y / image.height)),
    };
  }

  function finishPolygon() {
    if (draft.length >= 3) onCreate("polygon", draft);
    setDraft([]);
  }

  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const point = position(event);
    if (tool === "polygon") {
      setDraft((previous) => {
        const last = previous[previous.length - 1];
        return last && Math.hypot(last.x - point.x, last.y - point.y) < 0.002
          ? previous
          : [...previous, point];
      });
      return;
    }
    if (tool === "select") {
      const target = (event.target as Element).closest("[data-shape-id]");
      const annotation = annotations.find(
        (item) => item.id === target?.getAttribute("data-shape-id"),
      );
      onSelect(annotation?.id || null);
      if (!annotation) return;
      onMoveStart();
      drag.current = {
        start: point,
        id: annotation.id,
        points: annotation.points,
      };
    } else {
      drag.current = { start: point };
      setDraft([point, point]);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current) return;
    const point = position(event);
    if (current.id && current.points) {
      const dx = Math.max(
        -Math.min(...current.points.map((p) => p.x)),
        Math.min(
          1 - Math.max(...current.points.map((p) => p.x)),
          point.x - current.start.x,
        ),
      );
      const dy = Math.max(
        -Math.min(...current.points.map((p) => p.y)),
        Math.min(
          1 - Math.max(...current.points.map((p) => p.y)),
          point.y - current.start.y,
        ),
      );
      onMove(
        current.id,
        current.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      );
    } else setDraft([current.start, point]);
  }

  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!current) return;
    const point = position(event);
    if (!current.id && tool !== "select" && tool !== "polygon") {
      const dx = Math.abs(point.x - current.start.x);
      const dy = Math.abs(point.y - current.start.y);
      if (
        (tool === "rectangle" && dx >= 0.008 && dy >= 0.008) ||
        (tool === "line" && Math.hypot(dx, dy) >= 0.008)
      )
        onCreate(tool, [current.start, point]);
    }
    drag.current = null;
    setDraft([]);
  }

  const geometry = (type: ShapeType, points: Point[]) => {
    const positions = points.map((point) => ({
      x: point.x * image.width,
      y: point.y * image.height,
    }));
    if (type === "rectangle" && positions.length === 2)
      return (
        <rect
          x={Math.min(positions[0].x, positions[1].x)}
          y={Math.min(positions[0].y, positions[1].y)}
          width={Math.abs(positions[1].x - positions[0].x)}
          height={Math.abs(positions[1].y - positions[0].y)}
        />
      );
    if (type === "line" && positions.length === 2)
      return (
        <line
          x1={positions[0].x}
          y1={positions[0].y}
          x2={positions[1].x}
          y2={positions[1].y}
        />
      );
    return (
      <polyline
        points={positions.map((point) => `${point.x},${point.y}`).join(" ")}
      />
    );
  };

  return (
    <div className={`image-viewport ${tool === "select" ? "select-mode" : ""}`}>
      <div className="scan-corner top-left" />
      <div className="scan-corner bottom-right" />
      <svg
        ref={svgRef}
        data-testid="annotation-canvas"
        role="img"
        aria-label="X 线影像标注画布"
        viewBox={`0 0 ${image.width} ${image.height}`}
        style={{ transform: `scale(${zoom})` }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDraft([]);
        }}
        onDoubleClick={tool === "polygon" ? finishPolygon : undefined}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setDraft([]);
            drag.current = null;
          }
          if (event.key === "Enter" && tool === "polygon") finishPolygon();
        }}
        tabIndex={0}
      >
        <image href={image.dataUrl} width={image.width} height={image.height} />
        {annotations.map((annotation, index) => {
          const firstX =
            Math.min(...annotation.points.map((p) => p.x)) * image.width;
          const firstY =
            Math.min(...annotation.points.map((p) => p.y)) * image.height;
          const fontSize = image.width / 56;
          const labelWidth = image.width * 0.28;
          const labelX = Math.max(
            0,
            Math.min(firstX, image.width - labelWidth),
          );
          const labelY = Math.max(fontSize * 1.7, firstY);
          return (
            <g
              key={annotation.id}
              data-shape-id={annotation.id}
              className={`annotation-shape ${selectedId === annotation.id ? "selected" : ""}`}
            >
              {annotation.type === "polygon" ? (
                <polygon
                  points={annotation.points
                    .map(
                      (point) =>
                        `${point.x * image.width},${point.y * image.height}`,
                    )
                    .join(" ")}
                />
              ) : (
                geometry(annotation.type, annotation.points)
              )}
              {showLabels && (
                <g className="shape-label">
                  <rect
                    x={labelX}
                    y={labelY - fontSize * 1.7}
                    width={labelWidth}
                    height={fontSize * 1.7}
                    rx={3}
                  />
                  <text
                    x={labelX + 10}
                    y={labelY - fontSize * 0.5}
                    fontSize={fontSize}
                  >
                    {String(index + 1).padStart(2, "0")}　{annotation.lesion} ·{" "}
                    {annotation.confidence}%
                  </text>
                </g>
              )}
              {selectedId === annotation.id &&
                annotation.points.map((point, i) => (
                  <circle
                    key={i}
                    cx={point.x * image.width}
                    cy={point.y * image.height}
                    r={image.width / 160}
                  />
                ))}
            </g>
          );
        })}
        {draft.length > 0 && (
          <g className="annotation-shape draft">
            {geometry(tool === "select" ? "rectangle" : tool, draft)}
            {draft.map((point, index) => (
              <circle
                key={index}
                cx={point.x * image.width}
                cy={point.y * image.height}
                r={image.width / 180}
              />
            ))}
          </g>
        )}
      </svg>
      {tool === "polygon" && draft.length > 0 && (
        <div className="polygon-action">
          <span>已添加 {draft.length} 个顶点</span>
          <button disabled={draft.length < 3} onClick={finishPolygon}>
            完成多边形 ↵
          </button>
          <button onClick={() => setDraft([])}>取消</button>
        </div>
      )}
    </div>
  );
}
