/**
 * Rule-based field extraction for the "고장상보" standard report template (PRD 3.6.1 / 3.6.3).
 *
 * PDF text layers from this template render each label character as an independent
 * text run, so pdf-parse/pdf.js often join them with tabs (e.g. "발\t생\t일\t시").
 * Every label pattern below therefore uses \s* between characters instead of a
 * literal multi-character string match.
 *
 * Extraction is best-effort: if a field's label isn't found, it's simply left
 * undefined rather than throwing, so the caller can still show a partial result
 * and let the user fill in the rest manually.
 */

import { toDatetimeLocalValue } from "@/lib/datetime";

export interface ExtractedFailureFields {
  occurredAt?: string;
  branch?: string;
  equipmentName?: string;
  deviceName?: string;
  aptCount?: string;
  buildingCount?: string;
  interruptionDuration?: string;
  interruptionPeriod?: string;
  causeManagerRaw?: string;
  causeOwnerRaw?: string;
  situation?: string;
  alarmStatus?: string;
  cause4m1e?: string;
  impactHeatLoss?: string;
  impactDuration?: string;
  emergencyAction?: string;
  recoveredAt?: string;
  recoveryDetail?: string;
  recurrencePrevention?: string;
}

function normalizeLines(rawText: string): string[] {
  return rawText
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function findIndex(lines: string[], pattern: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i++) {
    if (pattern.test(lines[i])) return i;
  }
  return -1;
}

function afterLabel(line: string, labelPattern: RegExp): string {
  return line.replace(labelPattern, "").trim();
}

/** Boilerplate footer terminators: approval line, contact info, org letterhead. */
const FOOTER_PATTERN = /전화|팩스|전송|http|결재|^시행|공사/;

export function parseFailureReportText(rawText: string): ExtractedFailureFields {
  const lines = normalizeLines(rawText);
  const result: ExtractedFailureFields = {};

  // 발생일시
  const idxOccurred = findIndex(lines, /^발\s*생\s*일\s*시/);
  if (idxOccurred >= 0) {
    const m = lines[idxOccurred].match(/(\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일\s*\d{1,2}:\d{2})/);
    if (m) result.occurredAt = toDatetimeLocalValue(m[1].trim());
  }

  // 지사 / 설비명
  const idxBranch = findIndex(lines, /^지\s*사\s*\/\s*설\s*비\s*명/);
  if (idxBranch >= 0) {
    const rest = afterLabel(lines[idxBranch], /^지\s*사\s*\/\s*설\s*비\s*명\s*/);
    const tokens = rest.split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      result.branch = tokens[0];
      result.equipmentName = tokens.slice(1).join(" ");
    }
  }

  // 기기명(고장위치)
  const idxDevice = findIndex(lines, /^기기명\s*\(\s*고장위치\s*\)/);
  if (idxDevice >= 0) {
    result.deviceName = afterLabel(lines[idxDevice], /^기기명\s*\(\s*고장위치\s*\)\s*/);
  }

  // 공급중단 현황: APT 세대수 / 건물 개소
  const idxApt = findIndex(lines, /^A\s*P\s*T\b/);
  if (idxApt >= 0) {
    const aptMatch = lines[idxApt].match(/A\s*P\s*T\s*([\d,]+)\s*세대/);
    if (aptMatch) result.aptCount = aptMatch[1];
    const buildingMatch = lines[idxApt].match(/건물\s*([\d,]+)\s*개소/);
    if (buildingMatch) result.buildingCount = buildingMatch[1];
  }

  const idxInterruption = findIndex(lines, /^중단시간/);
  if (idxInterruption >= 0) {
    result.interruptionDuration = afterLabel(lines[idxInterruption], /^중단시간\s*/);
  }

  // Note: \b is unreliable around Korean characters (\w is ASCII-only in JS regex),
  // so section boundaries use $ / lookahead instead of \b wherever the preceding
  // character is Korean.
  const idxPeriod = findIndex(lines, /^기\s*간(?=\s|$)/);
  if (idxPeriod >= 0) {
    result.interruptionPeriod = afterLabel(lines[idxPeriod], /^기\s*간\s*/);
  }

  // 고장원인 담당자 / 책임자 (raw block — table sub-rows vary per report, so we
  // don't try to further split department vs. name; user can clean this up).
  const idxManager = findIndex(lines, /^고장원인\s*담당자/);
  const idxOwner = findIndex(lines, /^고장원인\s*책임자/, idxManager >= 0 ? idxManager + 1 : 0);
  const idxSituation = findIndex(lines, /^상\s*황\s*$/, idxOwner >= 0 ? idxOwner : 0);

  if (idxManager >= 0) {
    const end = idxOwner >= 0 ? idxOwner : idxManager + 1;
    result.causeManagerRaw = [afterLabel(lines[idxManager], /^고장원인\s*담당자\s*/), ...lines.slice(idxManager + 1, end)]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  if (idxOwner >= 0) {
    const end = idxSituation >= 0 ? idxSituation : idxOwner + 1;
    result.causeOwnerRaw = [afterLabel(lines[idxOwner], /^고장원인\s*책임자\s*/), ...lines.slice(idxOwner + 1, end)]
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  // 상황 (운전자/목격자 진술 포함) — strip the printed instruction hint itself.
  const idxAlarmHeader = findIndex(lines, /^보안/, idxSituation >= 0 ? idxSituation : 0);
  if (idxSituation >= 0) {
    const end = idxAlarmHeader >= 0 ? idxAlarmHeader : lines.length;
    result.situation = lines
      .slice(idxSituation + 1, end)
      .filter((l) => !/운전자|목격자|진술|^\(|포함\)/.test(l))
      .join("\n")
      .trim();
  }

  // 보안·경보장치 동작상태
  const idxAlarmStatus = findIndex(lines, /^동\s*작\s*상\s*태/, idxAlarmHeader >= 0 ? idxAlarmHeader : 0);
  if (idxAlarmStatus >= 0) {
    result.alarmStatus = afterLabel(lines[idxAlarmStatus], /^동\s*작\s*상\s*태\s*[-–]?\s*/);
  }

  // 원인(4M+1분석)
  const idxCauseLabel = findIndex(lines, /^원\s*인\s*$/, idxAlarmStatus >= 0 ? idxAlarmStatus : 0);
  const idxImpact = findIndex(lines, /^장\s*애\s*$/, idxCauseLabel >= 0 ? idxCauseLabel : 0);
  if (idxCauseLabel >= 0) {
    let start = idxCauseLabel + 1;
    if (lines[start] && /분석/.test(lines[start])) start += 1;
    const end = idxImpact >= 0 ? idxImpact : lines.length;
    result.cause4m1e = lines.slice(start, end).join("\n").trim();
  }

  // 장애현황: 고장지장열(전력)량 / 고장 지장 기간 / 응급처리
  const searchFrom = idxImpact >= 0 ? idxImpact : 0;
  const idxHeatLoss = findIndex(lines, /^고장지장열\s*\(\s*전력\s*\)\s*량/, searchFrom);
  if (idxHeatLoss >= 0) {
    result.impactHeatLoss = afterLabel(lines[idxHeatLoss], /^고장지장열\s*\(\s*전력\s*\)\s*량\s*/);
  }
  const idxImpactDuration = findIndex(lines, /^고장\s*지장\s*기간/, searchFrom);
  if (idxImpactDuration >= 0) {
    result.impactDuration = afterLabel(lines[idxImpactDuration], /^고장\s*지장\s*기간\s*/);
  }
  const idxEmergency = findIndex(lines, /^응\s*급\s*처\s*리/, searchFrom);
  if (idxEmergency >= 0) {
    result.emergencyAction = afterLabel(lines[idxEmergency], /^응\s*급\s*처\s*리\s*/);
  }

  // 복구일시
  const idxRecoveredAt = findIndex(lines, /^복\s*구\s*일\s*시/, searchFrom);
  if (idxRecoveredAt >= 0) {
    const raw = afterLabel(lines[idxRecoveredAt], /^복\s*구\s*일\s*시\s*/);
    result.recoveredAt = raw ? toDatetimeLocalValue(raw) : raw;
  }

  // 복구내용
  const idxRecoveryDetail = findIndex(lines, /^복\s*구\s*내\s*용/, idxRecoveredAt >= 0 ? idxRecoveredAt : searchFrom);
  const idxRecurrence = findIndex(lines, /^재발\s*방지\s*대책/, idxRecoveryDetail >= 0 ? idxRecoveryDetail : searchFrom);
  if (idxRecoveryDetail >= 0) {
    const end = idxRecurrence >= 0 ? idxRecurrence : lines.length;
    result.recoveryDetail = [afterLabel(lines[idxRecoveryDetail], /^복\s*구\s*내\s*용\s*/), ...lines.slice(idxRecoveryDetail + 1, end)]
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  // 재발방지대책 (stop at the approval-line / contact-info / letterhead footer)
  if (idxRecurrence >= 0) {
    const rest = [afterLabel(lines[idxRecurrence], /^재발\s*방지\s*대책\s*/)];
    for (let i = idxRecurrence + 1; i < lines.length; i++) {
      if (FOOTER_PATTERN.test(lines[i])) break;
      rest.push(lines[i]);
    }
    result.recurrencePrevention = rest.filter(Boolean).join("\n").trim();
  }

  return result;
}
