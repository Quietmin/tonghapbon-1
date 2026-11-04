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
  // ...s 로 통째로 복사한 뒤 바뀐 것만 덮는다 — 필드를 하나씩 나열하면 text 처럼
  // 나중에 늘어난 값을 빠뜨려, 회전 후 표기한 글자가 조용히 사라진다. (원본 주석)
  const rotatedStrokes = strokes.map((s) => ({
    ...s,
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

    if (stroke.tool === "text") {
      // 선을 긋는 도구들과 달리 경로(path)가 아니라 글자를 찍는다 — 어떤 사진
      // 배경 위에서도 읽히도록 흰 테두리를 두른 뒤 그 위에 글자색을 채운다. (원본과 동일)
      const fontPx = Math.max(12, stroke.width * w);
      ctx.globalAlpha = 1;
      ctx.font = `bold ${fontPx}px sans-serif`;
      ctx.textBaseline = "top";
      ctx.lineWidth = Math.max(2, fontPx * 0.18);
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText(stroke.text ?? "", pts[0].x * w, pts[0].y * h);
      ctx.fillStyle = stroke.color;
      ctx.fillText(stroke.text ?? "", pts[0].x * w, pts[0].y * h);
      continue;
    }

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
      } else if (stroke.tool === "arrow") {
        // 몸통을 긋고 끝점에 화살촉 두 선을 붙인다. 촉 길이는 이미지 너비에
        // 비례시켜(최소 10px) 사진 해상도가 달라도 비슷한 크기로 보이게 한다. (원본과 동일)
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = Math.max(10, w * 0.035);
        const headAngle = Math.PI / 7;
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - headAngle), y2 - headLen * Math.sin(angle - headAngle));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle + headAngle), y2 - headLen * Math.sin(angle + headAngle));
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
 *
 * maxEdge 를 주면 긴 변을 그 크기로 줄여 그린다 — 폰 사진(1200만 화소)을 원래 크기로 굽는 데 1초 넘게
 * 걸려, 편집기에서 [저장]을 눌러도 표시가 한참 뒤에 보였다. 줄인 판은 수십 ms 라 먼저 보여 주고,
 * 원래 크기 판은 뒤에서 만들어 바꿔 끼운다(DocEditor 재합성 이펙트). 스트로크 좌표는 0~1 로 정규화돼
 * 있고 선 굵기도 그리는 크기에 맞춰 drawStrokes 가 비례 조정하므로 줄여 그려도 모양이 같다.
 */
/** [저장] 직후 먼저 보여 줄 마킹 합성본의 긴 변(px) — 썸네일·미리보기에 충분하고 금방 구워진다 */
export const QUICK_PREVIEW_EDGE = 1000;

/**
 * 이미 디코드된 이미지로 줄인 합성본을 곧바로(동기) 만든다 — 사진 편집기가 [저장]할 때 쓴다.
 * 편집기는 기준 이미지를 이미 화면에 띄워 두고 있어 다시 디코드할 필요가 없으므로, 수십 ms 안에
 * 마킹이 얹힌 썸네일을 넘겨줄 수 있다(원래 크기 판은 DocEditor 가 뒤에서 굽는다).
 */
export function quickComposeFromImage(img: CanvasImageSource, width: number, height: number, strokes: Stroke[]): string {
  const scale = Math.min(1, QUICK_PREVIEW_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawStrokes(ctx, strokes, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

export async function composePreview(
  url: string,
  width: number,
  height: number,
  strokes: Stroke[],
  maxEdge?: number,
): Promise<string> {
  if (strokes.length === 0) return url;

  const img = await loadImage(url);
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(width, height)) : 1;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  drawStrokes(ctx, strokes, w, h);
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
  // 회전과 같은 이유로 ...s 통째 복사 — text 를 빠뜨리면 자르기 후 글자가 사라진다
  const remapped = strokes.map((s) => ({
    ...s,
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
