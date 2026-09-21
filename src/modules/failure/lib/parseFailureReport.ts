import path from "node:path";
import url from "node:url";
import type { FailureHistoryInput } from "./repo";

/**
 * "고장상보" 종이양식 PDF에서 항목을 최대한 뽑아낸다.
 *
 * pdf-parse의 getTable()로 라벨:값 표를 그대로 얻는다(정규식으로 텍스트를 직접
 * 자르는 방식보다 훨씬 안정적 — 직접 여러 샘플로 확인함). 이 양식 하나만 지원하고,
 * 핵심 라벨(발생일시·지사/설비명)을 못 찾으면 빈 결과 + 경고를 돌려준다 — 실패를
 * 조용히 삼키지 않고, 화면에서 "직접 입력해 주세요"로 안내하게 한다.
 *
 * 뽑아내지 못한 칸은 그대로 비워 둔다 — 화면에서 빈칸을 음영으로 표시해 사용자가
 * 채워야 할 곳을 알려주는 용도이므로, 여기서 추측해 채우면 안 된다.
 */

let workerConfigured = false;

/** pdfjs-dist(pdf-parse가 내부에서 씀)는 서버리스 Node 런타임에 없는 DOMMatrix를
 * 전제하고 렌더 경로를 밟는다 — 텍스트만 읽는 우리는 최소 스텁이면 충분하다. */
function ensureDomMatrixPolyfill(): void {
  if (typeof globalThis.DOMMatrix !== "undefined") return;
  class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    }
    multiply() {
      return new DOMMatrixPolyfill();
    }
    inverse() {
      return new DOMMatrixPolyfill();
    }
    translate() {
      return new DOMMatrixPolyfill();
    }
    scale() {
      return new DOMMatrixPolyfill();
    }
    transformPoint(point: unknown) {
      return point;
    }
  }
  // @ts-expect-error - 서버 전용 최소 스텁, 스펙 전체를 흉내내지 않는다
  globalThis.DOMMatrix = DOMMatrixPolyfill;
}

/** pdfjs-dist 워커 파일 경로는 빌드 시 정적으로 추적되지 않아 별도로 지정해야 한다 */
async function configureWorker(PDFParse: typeof import("pdf-parse").PDFParse): Promise<void> {
  if (workerConfigured) return;
  workerConfigured = true;
  try {
    const workerPath = path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
    PDFParse.setWorker(url.pathToFileURL(workerPath).href);
  } catch (e) {
    console.error("pdf-parse 워커 경로 설정 실패", e);
  }
}

export interface ParsedFailureReport {
  fields: Partial<FailureHistoryInput>;
  warning?: string;
}

/** "2026년 05월 11일 14:44" / "2026-05-11 17:00" 등을 "YYYY-MM-DDTHH:mm"으로 통일 */
function toDatetimeLocal(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D+(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${mi}`;
}

/** 라벨 비교용 — 공백·가운뎃점류 구분자를 지워서 "발 생 일 시"와 "발생일시"를 같게 만든다 */
function normalizeLabel(s: string): string {
  return s.replace(/[\s·‧・.]/g, "");
}

function joinCells(cells: string[]): string | undefined {
  const text = cells
    .map((c) => c.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  return text || undefined;
}

const SIMPLE_FIELD_ALIASES: [string[], keyof FailureHistoryInput][] = [
  [["기기명(고장위치)", "기기명고장위치"], "deviceName"],
  [["중단시간"], "interruptionDuration"],
  [["기간"], "interruptionPeriod"],
  [["고장원인담당자"], "causeManagerRaw"],
  [["고장원인책임자"], "causeOwnerRaw"],
  [["고장지장열(전력)량", "고장지장열전력량"], "impactHeatLoss"],
  [["고장지장기간"], "impactDuration"],
  [["응급처리"], "emergencyAction"],
  [["복구내용"], "recoveryDetail"],
  [["재발방지대책"], "recurrencePrevention"],
];

function matchSimpleField(label: string): keyof FailureHistoryInput | null {
  const norm = normalizeLabel(label);
  for (const [aliases, key] of SIMPLE_FIELD_ALIASES) {
    if (aliases.some((a) => norm === a || norm.startsWith(a))) return key;
  }
  return null;
}

function applyRow(fields: Partial<FailureHistoryInput>, cells: string[]): void {
  if (cells.length === 0) return;
  const label = normalizeLabel(cells[0]);
  const rest = cells.slice(1);

  if (label.startsWith("발생일시")) {
    fields.occurredAt = toDatetimeLocal(rest[0]);
    return;
  }
  if (label.startsWith("지사") && label.includes("설비명")) {
    fields.branch = rest[0]?.trim() || undefined;
    fields.equipmentName = rest[1]?.trim() || undefined;
    return;
  }
  if (label.startsWith("상황")) {
    fields.situation = joinCells(rest);
    return;
  }
  if (label.includes("보안") && label.includes("경보장치")) {
    fields.alarmStatus = joinCells(rest);
    return;
  }
  if (label.startsWith("원인")) {
    fields.cause4m1e = joinCells(rest);
    return;
  }
  if (label.startsWith("복구일시")) {
    fields.recoveredAt = toDatetimeLocal(rest[0]);
    return;
  }
  // "장애현황"은 표에서 병합 칸(rowspan)이라 [장애현황, 하위라벨, 값] 형태로 온다 —
  // 하위 라벨을 다시 같은 규칙으로 매칭한다.
  if (label.startsWith("장애현황") && rest.length >= 2) {
    applyRow(fields, rest);
    return;
  }

  const simple = matchSimpleField(cells[0]);
  if (simple) {
    (fields as Record<string, string | undefined>)[simple] = joinCells(rest);
  }
}

export async function parseFailureReport(buffer: Buffer): Promise<ParsedFailureReport> {
  ensureDomMatrixPolyfill();
  const { PDFParse } = await import("pdf-parse");
  await configureWorker(PDFParse);

  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getTable();
    const rows = result.pages.flatMap((p) => p.tables ?? []).flatMap((t) => t);

    const fields: Partial<FailureHistoryInput> = {};
    for (const row of rows) applyRow(fields, row as string[]);

    // 핵심 라벨을 하나도 못 찾았으면 이 템플릿이 아니다 — 빈 결과 + 경고로 안내한다.
    if (!fields.occurredAt && !fields.branch && !fields.equipmentName) {
      return {
        fields: {},
        warning: "이 양식은 자동으로 인식되지 않았습니다. 직접 입력해 주세요.",
      };
    }
    return { fields };
  } catch (e) {
    return {
      fields: {},
      warning: e instanceof Error ? `PDF를 읽지 못했습니다: ${e.message}` : "PDF를 읽지 못했습니다.",
    };
  } finally {
    await parser.destroy();
  }
}
