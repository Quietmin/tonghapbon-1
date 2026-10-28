/**
 * 설비 마스터 지사 선택 지도의 데이터 — 외부 지도 서비스·지도 파일 없이 SVG 로 그리는 약식 지도다.
 *
 * 업무망에서는 외부 지도 서버에 접속이 막힐 수 있어 코드 안의 좌표만으로 그린다. 해안선·시도 경계는
 * 눈으로 알아볼 정도로 단순화해 손으로 옮긴 것이고(개략도), 지사 위치도 정확한 주소가 아니다.
 * 좌표는 [경도, 위도]. 지사가 늘면 BRANCH_COORDS 에 한 줄 추가하면 지도에 핀이 생긴다.
 *
 * 화면은 한 장의 그림이다: 전국 지도 + 지사가 몰린 수도권을 확대한 그림(왼쪽 위)을 선으로 이었다.
 */

type LonLat = [number, number];

/** 남한 윤곽(제주 제외) — 서해안 북쪽 끝에서 시계 방향 */
export const KOREA_OUTLINE: LonLat[] = [
  // 휴전선(서 → 동)
  [126.5, 37.8], [126.68, 37.8], [126.95, 37.95], [127.15, 38.1], [127.5, 38.3], [128.0, 38.32],
  [128.2, 38.4], [128.37, 38.62],
  // 동해안(북 → 남)
  [128.55, 38.3], [128.6, 38.15], [128.85, 37.9], [128.95, 37.75], [129.1, 37.5], [129.2, 37.3],
  [129.35, 37.05], [129.4, 36.8], [129.43, 36.55], [129.45, 36.25], [129.55, 36.05], [129.45, 35.8],
  [129.4, 35.55], [129.3, 35.3], [129.15, 35.1],
  // 남해안(동 → 서)
  [128.9, 35.05], [128.75, 35.0], [128.5, 34.9], [128.3, 34.85], [128.05, 34.95], [127.9, 34.75],
  [127.7, 34.75], [127.6, 34.65], [127.45, 34.55], [127.3, 34.45], [127.1, 34.4], [126.8, 34.35],
  [126.55, 34.3], [126.3, 34.5], [126.25, 34.75], [126.35, 35.0], [126.45, 35.2], [126.55, 35.5],
  [126.6, 35.75], [126.7, 35.97], [126.65, 36.1], [126.5, 36.35], [126.4, 36.6], [126.3, 36.75],
  // 서해안(남 → 북)
  [126.35, 36.95], [126.65, 37.0], [126.85, 36.98], [126.75, 37.15], [126.75, 37.35], [126.6, 37.45],
  [126.6, 37.6], [126.45, 37.65], [126.3, 37.78],
];

/** 수도권(서울·인천·경기) 윤곽 — 전국 지도에서 색을 달리하고 확대 그림으로 보여 주는 영역 */
export const CAPITAL_REGION: LonLat[] = [
  [126.3, 37.78], [126.5, 37.8], [126.68, 37.8], [126.95, 37.95], [127.15, 38.1], [127.3, 38.0],
  [127.4, 37.8], [127.55, 37.62], [127.65, 37.45], [127.8, 37.3], [127.7, 37.15], [127.5, 37.05],
  [127.3, 36.98], [127.0, 36.95], [126.85, 36.98], [126.75, 37.15], [126.75, 37.35], [126.6, 37.45],
  [126.6, 37.6], [126.45, 37.65],
];

/** 시도 경계(대략) — 흰 선으로 그어 지역이 나뉘어 보이게 한다. 윤곽 밖은 잘린다 */
export const PROVINCE_LINES: LonLat[][] = [
  // 경기·충남 / 충북 경계 — 수도권 남쪽
  [[126.6, 36.95], [127.0, 36.95], [127.3, 36.98], [127.5, 37.05]],
  // 강원 / 충북 · 경북
  [[127.5, 37.05], [127.8, 37.15], [128.1, 37.2], [128.4, 37.1], [128.7, 37.1], [129.0, 37.15], [129.35, 37.05]],
  // 충북 / 경북
  [[128.4, 37.1], [128.3, 36.85], [128.05, 36.65], [127.95, 36.4], [127.8, 36.2]],
  // 충남 / 충북 · 대전
  [[127.3, 36.98], [127.45, 36.78], [127.3, 36.6], [127.4, 36.45], [127.3, 36.25], [127.1, 36.1], [126.65, 36.1]],
  // 전북 / 충남·충북·경북·경남
  [[127.1, 36.1], [127.4, 36.15], [127.7, 36.05], [127.85, 35.75], [127.7, 35.45], [127.55, 35.2], [127.4, 35.0]],
  // 전북 / 전남
  [[126.5, 35.55], [126.85, 35.55], [127.2, 35.4], [127.45, 35.2]],
  // 경북 / 경남
  [[127.85, 35.95], [128.2, 35.85], [128.5, 35.7], [128.85, 35.65], [129.15, 35.5]],
];

export interface BranchPoint {
  /** [경도, 위도] */
  lonlat: LonLat;
  /** 수도권 지사 — 확대 그림에 핀을 찍고, 전국 지도에는 작은 점만 찍는다 */
  capital?: boolean;
  /**
   * 이름표 자리 — 핀에서 얼마나 떨어뜨릴지(dx, dy)와 맞춤. start 는 이름표의 왼쪽을, end 는 오른쪽을,
   * middle 은 가운데를 핀 옆 dx 에 맞춘다. 값은 그 핀이 찍힌 그림(확대 또는 전국)의 단위다.
   */
  label: { dx: number; dy: number; anchor: "start" | "end" | "middle" };
}

const R = (dy = 0, dx = 11) => ({ dx, dy, anchor: "start" as const });
const L = (dy = 0, dx = -11) => ({ dx, dy, anchor: "end" as const });

export const BRANCH_COORDS: Record<string, BranchPoint> = {
  // ── 수도권(확대 그림) — 점이 거의 겹치는 지사(판교·분당, 수원·광교)는 보이도록 위치를 살짝 벌려 찍었다 ──
  파주지사: { lonlat: [126.78, 37.76], capital: true, label: L() },
  고양사업소: { lonlat: [126.82, 37.66], capital: true, label: L() },
  삼송지사: { lonlat: [126.92, 37.65], capital: true, label: R() },
  중앙지사: { lonlat: [126.97, 37.55], capital: true, label: L() },
  강남지사: { lonlat: [127.06, 37.5], capital: true, label: R() },
  판교지사: { lonlat: [127.08, 37.41], capital: true, label: L() },
  분당사업소: { lonlat: [127.15, 37.36], capital: true, label: R() },
  광교지사: { lonlat: [127.05, 37.3], capital: true, label: L() },
  수원사업소: { lonlat: [127.0, 37.24], capital: true, label: { dx: 0, dy: 26, anchor: "middle" } },
  용인지사: { lonlat: [127.2, 37.25], capital: true, label: R() },
  동탄지사: { lonlat: [127.12, 37.17], capital: true, label: R(14) },
  화성지사: { lonlat: [126.83, 37.2], capital: true, label: L(4) },
  평택지사: { lonlat: [127.09, 36.99], capital: true, label: R() },
  // ── 그 밖의 지역(전국 지도) ──
  청주지사: { lonlat: [127.49, 36.64], label: R(-5, 9) },
  세종지사: { lonlat: [127.29, 36.5], label: L(5, -9) },
  대구지사: { lonlat: [128.6, 35.87], label: R(0, 9) },
  광주전남지사: { lonlat: [126.85, 35.16], label: R(0, 9) },
  양산지사: { lonlat: [129.04, 35.34], label: R(-5, 9) },
  김해사업소: { lonlat: [128.88, 35.23], label: L(5, -9) },
};

/** 한 그림의 투영 — 위도에 따른 경도 길이 보정(cos 36°)을 한 단순 투영이다. ox·oy 는 캔버스 안 자리 */
export interface MapView {
  lonMin: number;
  latMax: number;
  /** 위도 1도당 캔버스 단위 */
  scale: number;
  ox: number;
  oy: number;
}

const COS = Math.cos((36 * Math.PI) / 180);

/** 캔버스 전체 크기 */
export const CANVAS = { w: 600, h: 440 };

/** 전국 — 오른쪽. 위도 34.3~38.45 */
export const NATIONAL_VIEW: MapView = { lonMin: 126.15, latMax: 38.45, scale: 100, ox: 322, oy: 14 };

/** 수도권 확대 — 왼쪽 위. 경도 126.3~127.75, 위도 36.95~38.1 */
export const CAPITAL_VIEW: MapView = { lonMin: 126.3, latMax: 38.1, scale: 250, ox: 0, oy: 20 };

export function project(view: MapView, [lon, lat]: LonLat): [number, number] {
  return [view.ox + (lon - view.lonMin) * view.scale * COS, view.oy + (view.latMax - lat) * view.scale];
}

/** 모서리를 깎아 곡선처럼 부드럽게 한다(Chaikin) — 직선 토막이 티 나는 손 그림을 완화 */
function smooth(points: LonLat[], iterations: number, closed: boolean): LonLat[] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    const next: LonLat[] = [];
    const n = pts.length;
    const last = closed ? n : n - 1;
    if (!closed) next.push(pts[0]);
    for (let i = 0; i < last; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) next.push(pts[n - 1]);
    pts = next;
  }
  return pts;
}

function toPath(view: MapView, pts: LonLat[], closed: boolean): string {
  return (
    pts
      .map((p, i) => {
        const [x, y] = project(view, p);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + (closed ? " Z" : "")
  );
}

/** 남한 윤곽 */
export function outlinePath(view: MapView): string {
  return toPath(view, smooth(KOREA_OUTLINE, 1, true), true);
}

/** 수도권 영역 — 확대 그림에서는 더 많이 다듬어 큰 윤곽이 덜 각져 보이게 한다 */
export function capitalPath(view: MapView, iterations: number): string {
  return toPath(view, smooth(CAPITAL_REGION, iterations, true), true);
}

/** 시도 경계선들(한 path 로 이어 붙임) */
export function provincePath(view: MapView): string {
  return PROVINCE_LINES.map((l) => toPath(view, smooth(l, 1, false), false)).join(" ");
}

/** "강남지사" → "강남", "고양사업소" → "고양" — 지도 위 글자는 짧게 */
export function shortName(branch: string): string {
  return branch.replace(/(지사|사업소)$/, "");
}
