// 현장 사진을 올리기 전에 브라우저에서 줄인다.
//
// 왜 필요한가: 요즘 폰 사진은 한 장에 3~10MB다. 그대로 base64로 바꾸면 ×1.33이
// 되고, 분해 전·후 두 장이면 한 번 저장에 10MB를 넘긴다. Vercel 함수는 요청 본문을
// 4.5MB까지만 받으므로 그 순간 저장이 실패한다. 로컬 개발에서는 한계가 없어
// 멀쩡히 되다가 배포하면 터지는, 알아채기 어려운 종류의 고장이다.
//
// 그래서 찍은 사진을 그대로 두지 않고 긴 변 1600px · JPEG 품질 0.82로 다시 굽는다.
// 보통 3~5MB가 200~400KB로 줄어든다. 공정 기록·보고서에 쓰기엔 충분한 화질이고,
// 원본을 따로 보관하지 않는다는 전제로 정한 값이다.
//
// EXIF 회전: 폰 사진은 센서 방향 그대로 저장하고 "몇 도 돌려서 보라"는 표시만
// 남긴다. 캔버스에 그냥 그리면 그 표시가 사라져 세로 사진이 눕는다.
// createImageBitmap의 imageOrientation:"from-image"가 표시대로 돌려서 준다.

/** 다시 구운 결과 — 화면이 얼마나 줄었는지 보여줄 수 있게 크기를 함께 준다 */
export interface CompressedImage {
  /** data:image/jpeg;base64,... — 그대로 DB에 저장된다 */
  dataUrl: string;
  /** 원본 바이트 */
  originalBytes: number;
  /** 줄인 뒤 바이트 (base64 부풀림 전, 실제 이미지 크기) */
  bytes: number;
  width: number;
  height: number;
}

export interface CompressOptions {
  /** 긴 변 최대 픽셀 */
  maxEdge?: number;
  /** 첫 시도 JPEG 품질 */
  quality?: number;
  /** 이 크기를 넘으면 품질을 낮춰 다시 굽는다 (바이트) */
  targetBytes?: number;
  /** 여기까지 줄여도 안 되면 실패로 본다 (바이트) */
  hardLimitBytes?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxEdge: 1600,
  quality: 0.82,
  targetBytes: 1_200_000, // 1.2MB — 전·후 두 장이어도 요청 본문 한계에 여유가 있다
  hardLimitBytes: 2_000_000,
};

/** 브라우저가 읽을 수 있는 이미지인지 대략 거른다 */
function assertImage(file: File) {
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 첨부할 수 있습니다.");
  }
}

/**
 * 파일 → 캔버스에 그릴 수 있는 그림.
 * createImageBitmap이 EXIF 회전까지 처리해 주므로 이게 1순위다.
 * 지원하지 않는 브라우저에서는 <img>로 떨어진다 (<img>도 요즘은 EXIF를 반영한다).
 */
async function decode(file: File): Promise<{ src: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { src: bmp, width: bmp.width, height: bmp.height };
    } catch {
      // 아래 <img> 경로로 떨어진다
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode failed"));
      el.src = url;
    });
    return { src: img, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    throw new Error(
      "이 사진 형식은 브라우저가 읽지 못합니다(HEIC 등). " +
        "카메라 설정에서 '고효율 이미지'를 끄고 JPG로 찍은 뒤 다시 시도하세요.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("이미지를 변환하지 못했습니다."))),
      "image/jpeg",
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    r.readAsDataURL(blob);
  });
}

/**
 * 사진을 올리기 좋은 크기로 다시 굽는다.
 *
 * 한 번에 목표 크기에 못 닿으면 품질을 낮춰 두 번 더 시도하고, 그래도 크면
 * 긴 변을 줄여 한 번 더 시도한다. 끝내 안 되면 사람이 알아들을 수 있는 이유로
 * 실패시킨다 — 조용히 큰 파일을 보내 서버에서 터지게 두지 않는다.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<CompressedImage> {
  const opt = { ...DEFAULTS, ...options };
  assertImage(file);

  const { src, width, height } = await decode(file);
  if (!width || !height) throw new Error("이미지 크기를 읽지 못했습니다.");

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이 브라우저에서는 사진을 줄일 수 없습니다.");

  const draw = (maxEdge: number) => {
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  };

  // 품질을 단계적으로 낮춰 본다 → 그래도 크면 크기를 줄여 다시
  const attempts: { maxEdge: number; quality: number }[] = [
    { maxEdge: opt.maxEdge, quality: opt.quality },
    { maxEdge: opt.maxEdge, quality: 0.7 },
    { maxEdge: opt.maxEdge, quality: 0.6 },
    { maxEdge: Math.round(opt.maxEdge * 0.75), quality: 0.6 },
  ];

  let best: Blob | null = null;
  for (const a of attempts) {
    draw(a.maxEdge);
    const blob = await toBlob(canvas, a.quality);
    best = blob;
    if (blob.size <= opt.targetBytes) break;
  }
  if (!best) throw new Error("이미지를 변환하지 못했습니다.");

  if (best.size > opt.hardLimitBytes) {
    throw new Error(
      `사진이 너무 큽니다 (줄인 뒤에도 ${Math.round(best.size / 1024 / 1024)}MB). ` +
        "다른 사진을 쓰거나, 폰 갤러리에서 크기를 줄여 첨부하세요.",
    );
  }

  if (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap) src.close();

  return {
    dataUrl: await blobToDataUrl(best),
    originalBytes: file.size,
    bytes: best.size,
    width: canvas.width,
    height: canvas.height,
  };
}

/** "3.4MB → 280KB" 같은 안내 문구용 */
export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(n / 1024))}KB`;
}
