"use client";

/**
 * 사진 편집(마킹·자르기)용 캔버스 유틸리티.
 * 전부 legacy Photo-Report(뚝 DOC)의 sketch 편집기 로직을 그대로 이식했다 —
 * 좌표 정규화·회전 굽기·자르기 시 스트로크 재배치까지 원본과 동일한 방식이어야
 * "그려 놓은 표시가 자르기·회전 후에도 제자리에 있다"가 유지된다.
 */
import type { Stroke } from "./types";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function canvasToObjectUrl(canvas: HTMLCanvasElement, quality = 0.92): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("이미지를 만들지 못했습니다."));
          return;
        }
        resolve(URL.createObjectURL(blob));
      },
      "image/jpeg",
      quality,
    );
  });
}

/** 스트로크 하나의 정규화 좌표(0~1)를 90도 배수 회전에 맞춰 옮긴다 (원본 rotateNormPoint) */
function rotateNormPoint(p: { x: number; y: number }, deg: number): { x: number; y: number } {
  if (deg === 90) return { x: 1 - p.y, y: p.x };
  if (deg === 180) return { x: 1 - p.x, y: 1 - p.y };
  if (deg === 270) return { x: p.y, y: 1 - p.x };
  return { x: p.x, y: p.y };
}

/**
 * 목록의 [90도 회전] 버튼은 화면에서 CSS transform 으로만 돌려 보여준다(실제 픽셀은 그대로).
 * 편집기를 열 때는 그 상태로 그리기가 안 맞으므로, 실제 픽셀에 회전을 구워 넣고
 * 기존 스트로크 좌표도 같이 돌려서 rotation 을 0 으로 리셋한다. (원본 flattenRotation)
 */
export async function flattenRotation(
  url: string,
  width: number,
  height: number,
  deg: number,
  strokes: Stroke[],
): Promise<{ url: string; width: number; height: number; strokes: Stroke[] }> {
  if (deg === 0) return { url, width, height, strokes };

  const img = await loadImage(url);
  const cw = deg === 90 || deg === 270 ? height : width;
  const ch = deg === 90 || deg === 270 ? width : height;

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);
  ctx.save();
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(img, -width / 2, -height / 2, width, height);
  ctx.restore();

  const widthScale = width / cw;
  const rotatedUrl = await canvasToObjectUrl(canvas);
  const rotatedStrokes = strokes.map((s) => ({
    tool: s.tool,
    color: s.color,
    width: s.width * widthScale,
    points: s.points.map((p) => rotateNormPoint(p, deg)),
  }));

  return { url: rotatedUrl, width: cw, height: ch, strokes: rotatedStrokes };
}

/** 정규화 좌표 스트로크들을 실제 캔버스(w×h)에 그린다 (원본 drawStrokes 1:1) */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  w: number,
  h: number,
): void {
  if (!strokes.length) return;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length === 0) continue;
    ctx.globalAlpha = stroke.tool === "highlighter" ? 0.35 : 1;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = Math.max(1, stroke.width * w);
    ctx.beginPath();
    if (stroke.tool === "pen" || stroke.tool === "highlighter") {
      ctx.moveTo(pts[0].x * w, pts[0].y * h);
      if (pts.length === 1) {
        ctx.lineTo(pts[0].x * w + 0.01, pts[0].y * h);
      } else {
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * w, pts[i].y * h);
      }
      ctx.stroke();
    } else {
      const a = pts[0];
      const b = pts[pts.length - 1];
      const x1 = a.x * w;
      const y1 = a.y * h;
      const x2 = b.x * w;
      const y2 = b.y * h;
      if (stroke.tool === "line") {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      } else if (stroke.tool === "rect") {
        ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        ctx.stroke();
      } else if (stroke.tool === "ellipse") {
        ctx.ellipse(
          (x1 + x2) / 2,
          (y1 + y2) / 2,
          Math.abs(x2 - x1) / 2,
          Math.abs(y2 - y1) / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/**
 * 목록 썸네일·A4 미리보기에 실제로 보여줄 이미지 — 기준 이미지 위에 strokes 를
 * 구워 하나의 래스터로 합친다. strokes 가 없으면 원본 url 을 그대로 돌려줘
 * 불필요한 캔버스 작업을 건너뛴다. (원본 composeSketchedCache)
 */
export async function composePreview(
  url: string,
  width: number,
  height: number,
  strokes: Stroke[],
): Promise<string> {
  if (strokes.length === 0) return url;

  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);
  drawStrokes(ctx, strokes, width, height);
  return canvasToObjectUrl(canvas, 0.9);
}

/**
 * 자르기 적용 — 기준 이미지를 실제로 잘라내고(되돌릴 수 없음, 원본과 동일),
 * 기존 스트로크 좌표를 잘라낸 영역 기준으로 다시 정규화한다. (원본 applyCrop)
 */
export async function cropImage(
  url: string,
  baseWidth: number,
  baseHeight: number,
  rect: { x: number; y: number; w: number; h: number },
  strokes: Stroke[],
): Promise<{ url: string; width: number; height: number; strokes: Stroke[] }> {
  const img = await loadImage(url);
  const px = Math.round(rect.x * baseWidth);
  const py = Math.round(rect.y * baseHeight);
  const pw = Math.max(1, Math.round(rect.w * baseWidth));
  const ph = Math.max(1, Math.round(rect.h * baseHeight));

  const canvas = document.createElement("canvas");
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pw, ph);
  ctx.drawImage(img, px, py, pw, ph, 0, 0, pw, ph);

  const croppedUrl = await canvasToObjectUrl(canvas);
  const remapped = strokes.map((s) => ({
    tool: s.tool,
    color: s.color,
    width: s.width / rect.w,
    points: s.points.map((p) => ({
      x: (p.x - rect.x) / rect.w,
      y: (p.y - rect.y) / rect.h,
    })),
  }));

  return { url: croppedUrl, width: pw, height: ph, strokes: remapped };
}

/** 파일 → object URL + 실제 픽셀 크기. 사진 추가 시 최초 1회 쓴다 */
export function readImageFile(
  file: File,
): Promise<{ url: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  return loadImage(url).then((img) => ({ url, width: img.naturalWidth, height: img.naturalHeight }));
}
