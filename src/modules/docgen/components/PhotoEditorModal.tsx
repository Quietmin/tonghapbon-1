"use client";

import { useEffect, useRef, useState } from "react";
import type { Stroke } from "../lib/types";
import { cropImage, drawStrokes, flattenRotation, loadImage } from "../lib/imageEdit";

/**
 * 사진 편집기 — 펜/형광펜/도형 마킹 + 자르기.
 * 원본(legacy Photo-Report) sketch-modal 을 그대로 이식했다. 전체화면 어두운 모달로
 * 앱의 밝은 Lumina 테마와 의도적으로 분리한다 — 사진에 집중하는 편집 화면이라
 * 원본처럼 카메라 앱에 가까운 톤을 유지한다.
 *
 * 캔버스 자체는 React state 가 아니라 ref 로 직접 그린다(그리는 도중 pointermove 가
 * 초당 수십 번 발생하므로 매번 리렌더하면 느려진다). 버튼 강조 표시처럼 화면에
 * 반영해야 하는 값만 React state 로 둔다.
 */

type Tool = "pen" | "highlighter" | "rect" | "ellipse" | "line" | "crop";

const TOOLS: { tool: Tool; label: string }[] = [
  { tool: "pen", label: "펜" },
  { tool: "highlighter", label: "형광펜" },
  { tool: "rect", label: "네모" },
  { tool: "ellipse", label: "동그라미" },
  { tool: "line", label: "선" },
  { tool: "crop", label: "자르기" },
];

const COLORS = [
  { color: "#ff0000", label: "빨강" },
  { color: "#ffe000", label: "노랑" },
  { color: "#00b050", label: "초록" },
  { color: "#0070ff", label: "파랑" },
  { color: "#000000", label: "검정" },
];

const STROKE_WIDTHS: Record<string, number> = {
  pen: 0.005,
  highlighter: 0.03,
  rect: 0.005,
  ellipse: 0.005,
  line: 0.005,
};

/** 캔버스 내부 해상도 상한 — 이보다 큰 사진은 축소해서 다룬다 (원본과 동일) */
const SKETCH_MAX_EDGE = 1400;
const HINT_DRAW = "손가락이나 마우스로 사진 위에 그려 주세요.";
const HINT_CROP = "남길 영역을 드래그한 뒤 [자르기 적용]을 누르세요.";
const UNDO_LIMIT = 40;

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface UndoSnapshot {
  url: string;
  width: number;
  height: number;
  strokes: Stroke[];
}

export interface PhotoEditorResult {
  url: string;
  width: number;
  height: number;
  strokes: Stroke[];
}

export interface PhotoEditorModalProps {
  url: string;
  width: number;
  height: number;
  /** 목록의 90도 회전 버튼이 만든, 아직 픽셀에 굽지 않은 회전값 */
  rotation: number;
  strokes: Stroke[];
  onCancel: () => void;
  onSave: (result: PhotoEditorResult) => void;
}

export default function PhotoEditorModal({
  url,
  width,
  height,
  rotation,
  strokes: initialStrokes,
  onCancel,
  onSave,
}: PhotoEditorModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseImgRef = useRef<HTMLImageElement | null>(null);
  const baseRef = useRef({ url, width, height });
  const strokesRef = useRef<Stroke[]>(initialStrokes.map((s) => ({ ...s, points: s.points.slice() })));
  const activeStrokeRef = useRef<Stroke | null>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const cropRectRef = useRef<CropRect | null>(null);
  const undoStackRef = useRef<UndoSnapshot[]>([]);
  /** 이 세션에서 새로 만든 blob URL — 취소하면 전부 해제해야 새는 게 없다 */
  const createdUrlsRef = useRef<Set<string>>(new Set());

  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ff0000");
  const [busy, setBusy] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(strokesRef.current.length > 0);
  const [message, setMessage] = useState<string | null>(null);

  function trackUrl(u: string): string {
    createdUrlsRef.current.add(u);
    return u;
  }

  function resizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width: w, height: h } = baseRef.current;
    const scale = Math.min(1, SKETCH_MAX_EDGE / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
  }

  function redraw() {
    const canvas = canvasRef.current;
    const img = baseImgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const all = activeStrokeRef.current
      ? [...strokesRef.current, activeStrokeRef.current]
      : strokesRef.current;
    drawStrokes(ctx, all, w, h);

    const rect = cropRectRef.current;
    if (tool === "crop" && rect) {
      const rx = rect.x * w;
      const ry = rect.y * h;
      const rw = rect.w * w;
      const rh = rect.h * h;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,.45)";
      ctx.fillRect(0, 0, w, ry);
      ctx.fillRect(0, ry + rh, w, h - (ry + rh));
      ctx.fillRect(0, ry, rx, rh);
      ctx.fillRect(rx + rw, ry, w - (rx + rw), rh);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(2, w * 0.004);
      ctx.setLineDash([w * 0.02, w * 0.012]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }
  }

  // 회전이 걸려 있으면(목록의 90도 회전 버튼) 실제 픽셀에 구워 넣고 스트로크 좌표도
  // 같이 돌린 뒤 시작한다 — 화면에 보이는 방향과 그리기가 어긋나지 않아야 한다.
  useEffect(() => {
    let cancelled = false;
    flattenRotation(url, width, height, rotation, strokesRef.current)
      .then(async (flat) => {
        if (cancelled) return;
        if (flat.url !== url) trackUrl(flat.url);
        baseRef.current = { url: flat.url, width: flat.width, height: flat.height };
        strokesRef.current = flat.strokes;
        const img = await loadImage(flat.url);
        if (cancelled) return;
        baseImgRef.current = img;
        resizeCanvas();
        redraw();
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setMessage("사진을 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 도구를 바꾸면(특히 자르기에서 벗어나면) 반투명 선택 영역을 지우고 다시 그린다.
  useEffect(() => {
    if (tool !== "crop") {
      cropRectRef.current = null;
      cropStartRef.current = null;
    }
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  function pushUndoSnapshot() {
    undoStackRef.current.push({
      url: baseRef.current.url,
      width: baseRef.current.width,
      height: baseRef.current.height,
      strokes: strokesRef.current.slice(),
    });
    if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
    setCanUndo(true);
  }

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ready) return;
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    if (tool === "crop") {
      const p = pointFromEvent(e);
      cropStartRef.current = p;
      cropRectRef.current = { x: p.x, y: p.y, w: 0, h: 0 };
      redraw();
      return;
    }
    activeStrokeRef.current = {
      tool,
      color,
      width: STROKE_WIDTHS[tool] ?? 0.005,
      points: [pointFromEvent(e)],
    };
    redraw();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ready) return;
    if (tool === "crop") {
      if (!cropStartRef.current) return;
      e.preventDefault();
      const p = pointFromEvent(e);
      const a = cropStartRef.current;
      cropRectRef.current = {
        x: Math.min(a.x, p.x),
        y: Math.min(a.y, p.y),
        w: Math.abs(p.x - a.x),
        h: Math.abs(p.y - a.y),
      };
      redraw();
      return;
    }
    const active = activeStrokeRef.current;
    if (!active) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    if (active.tool === "pen" || active.tool === "highlighter") active.points.push(p);
    else active.points[1] = p;
    redraw();
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "crop") {
      if (!cropStartRef.current) return;
      e.preventDefault();
      cropStartRef.current = null;
      const rect = cropRectRef.current;
      if (rect && (rect.w < 0.03 || rect.h < 0.03)) cropRectRef.current = null;
      redraw();
      return;
    }
    const active = activeStrokeRef.current;
    if (!active) return;
    e.preventDefault();
    const isShape = active.tool !== "pen" && active.tool !== "highlighter";
    if (isShape && active.points.length < 2) {
      activeStrokeRef.current = null;
      redraw();
      return;
    }
    pushUndoSnapshot();
    strokesRef.current = [...strokesRef.current, active];
    activeStrokeRef.current = null;
    setHasStrokes(true);
    redraw();
  }

  async function handleApplyCrop() {
    const rect = cropRectRef.current;
    if (!rect || rect.w < 0.03 || rect.h < 0.03) {
      setMessage("남길 영역을 먼저 드래그해 주세요.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      pushUndoSnapshot();
      const result = await cropImage(
        baseRef.current.url,
        baseRef.current.width,
        baseRef.current.height,
        rect,
        strokesRef.current,
      );
      trackUrl(result.url);
      baseRef.current = { url: result.url, width: result.width, height: result.height };
      strokesRef.current = result.strokes;
      cropRectRef.current = null;
      cropStartRef.current = null;
      const img = await loadImage(result.url);
      baseImgRef.current = img;
      resizeCanvas();
      setTool("pen");
      setMessage("사진을 잘랐습니다. 저장하면 반영됩니다.");
      redraw();
    } catch {
      setMessage("사진을 자르지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo() {
    const snap = undoStackRef.current.pop();
    if (!snap) {
      setMessage("되돌릴 편집 내용이 없습니다.");
      return;
    }
    setCanUndo(undoStackRef.current.length > 0);
    cropRectRef.current = null;
    cropStartRef.current = null;
    strokesRef.current = snap.strokes.slice();
    setHasStrokes(strokesRef.current.length > 0);

    if (snap.url === baseRef.current.url) {
      redraw();
      return;
    }
    setBusy(true);
    try {
      const img = await loadImage(snap.url);
      baseImgRef.current = img;
      baseRef.current = { url: snap.url, width: snap.width, height: snap.height };
      resizeCanvas();
      redraw();
    } catch {
      setMessage("되돌리지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function handleClear() {
    if (strokesRef.current.length === 0) return;
    if (!window.confirm("이 사진에 그린 내용을 모두 지우시겠습니까?")) return;
    pushUndoSnapshot();
    strokesRef.current = [];
    setHasStrokes(false);
    redraw();
  }

  /** 취소·저장 어느 쪽이든, 채택되지 않은 중간 결과물(blob URL)은 반드시 해제한다 */
  function cleanupUnsaved(keep?: string) {
    createdUrlsRef.current.forEach((u) => {
      if (u !== keep) URL.revokeObjectURL(u);
    });
  }

  function handleCancel() {
    cleanupUnsaved();
    onCancel();
  }

  function handleSave() {
    const result: PhotoEditorResult = {
      url: baseRef.current.url,
      width: baseRef.current.width,
      height: baseRef.current.height,
      strokes: strokesRef.current,
    };
    cleanupUnsaved(result.url);
    onSave(result);
  }

  const isCrop = tool === "crop";

  return (
    <div className="fixed inset-0 z-[300] bg-[#1a1a1a] flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-black">
        <button
          type="button"
          onClick={handleCancel}
          className="text-white text-sm px-3 py-1.5 rounded-lg hover:bg-white/10"
        >
          취소
        </button>
        <span className="text-white text-sm font-medium">사진 편집</span>
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !ready}
          className="text-white text-sm font-bold px-3 py-1.5 rounded-lg bg-primary disabled:opacity-40"
        >
          저장
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden p-2">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full touch-none bg-white shadow-[0_2px_12px_rgba(0,0,0,.5)]"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>

      <div className="bg-black px-3 pb-4 pt-2.5 flex flex-col gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              type="button"
              onClick={() => setTool(t.tool)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                tool === t.tool ? "bg-primary text-on-primary" : "bg-white/10 text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isCrop && (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleApplyCrop}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white disabled:opacity-40"
            >
              자르기 적용
            </button>
            <button
              type="button"
              onClick={() => {
                cropRectRef.current = null;
                cropStartRef.current = null;
                redraw();
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white"
            >
              영역 지우기
            </button>
          </div>
        )}

        {!isCrop && (
          <div className="flex gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.color}
                type="button"
                aria-label={c.label}
                onClick={() => setColor(c.color)}
                style={{ background: c.color }}
                className={`w-8 h-8 rounded-full border-2 ${
                  color === c.color ? "border-white" : "border-transparent"
                }`}
              />
            ))}
          </div>
        )}

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => void handleUndo()}
            disabled={!canUndo}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white disabled:opacity-40"
          >
            되돌리기
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={!hasStrokes}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white disabled:opacity-40"
          >
            전체 지우기
          </button>
        </div>

        <p className="text-white/60 text-[11px] text-center">
          {message ?? (isCrop ? HINT_CROP : HINT_DRAW)}
        </p>
      </div>
    </div>
  );
}
