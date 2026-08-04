"use client";

import { useState } from "react";
import DocEditor from "@/modules/docgen/components/DocEditor";
import SortedSelect, { CheckField, TextField } from "@/modules/docgen/components/SortedSelect";
import { BRANCHES, DEFAULT_BRANCH, FAULT_FIELDS } from "@/modules/docgen/lib/constants";
import {
  formatDateTime,
  minutesText,
  orDash,
  spanMinutes,
  unitText,
} from "@/modules/docgen/lib/faultFormat";

/**
 * 고장 보고서 — 고장 요약과 관련 사진을 정리하는 핫라인 메모.
 * 출력물의 "1. 고장 요약" 표는 원본(legacy Photo-Report)의 buildFaultSummaryTable 을
 * 행 구성·병합까지 그대로 옮긴 것이다. 서식이 결재 문서로 그대로 올라가므로
 * 칸 폭(34/24mm)과 행 순서를 임의로 바꾸지 않는다.
 *
 * 입력 항목은 Supabase docgen_documents 의 고장 보고서 전용 컬럼에 맞췄다
 * (occurred_at / facility / device / fault_content / situation / cause /
 *  recover_at / action_taken / outage_*).
 */
export default function FaultReportPage() {
  const [branch, setBranch] = useState(DEFAULT_BRANCH);
  const [field, setField] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [facility, setFacility] = useState("");
  const [device, setDevice] = useState("");
  const [faultContent, setFaultContent] = useState("");
  const [situation, setSituation] = useState("");
  const [cause, setCause] = useState("");
  const [recoverAt, setRecoverAt] = useState("");
  const [recoverNote, setRecoverNote] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  // 열공급 중단 — 없으면 표에 '해당없음' 한 줄만 찍고 세부 행을 만들지 않는다
  const [outageNone, setOutageNone] = useState(false);
  const [outageApt, setOutageApt] = useState("");
  const [outageBldg, setOutageBldg] = useState("");
  const [outageAt, setOutageAt] = useState("");

  /** 열공급 기간 = 복구일시 - 중단일시 */
  const outageMins = spanMinutes(outageAt, recoverAt);
  /** 설비 정지기간 = 복구일시 - 발생일시 */
  const downMins = spanMinutes(occurredAt, recoverAt);

  /* 복구일시는 고른 값과 자유 입력이 함께 설 수 있다 — 어느 쪽만 있어도 되고 둘 다면 붙인다 */
  const recoveryText = (() => {
    const picked = recoverAt ? formatDateTime(recoverAt) : "";
    const note = recoverNote.trim();
    if (picked && note) return `${picked} ${note}`;
    return picked || note || "-";
  })();

  /* 원본은 '추정 원인'을 고장내용에 합쳤다(커밋 89a46da). 입력란은 남겨 두되
     출력에서는 같은 행에 이어 붙여 서식을 원본과 맞춘다. */
  const faultContentText = (() => {
    const body = faultContent.trim();
    const c = cause.trim();
    if (body && c) return `${body}\n${c}`;
    return body || c || "-";
  })();

  /** 출력물 첫 장의 "1. 고장 요약" 표 */
  const faultSummary = (
    <table className="fr-table">
      <colgroup>
        <col style={{ width: "34mm" }} />
        <col style={{ width: "24mm" }} />
        <col />
        <col style={{ width: "24mm" }} />
        <col />
      </colgroup>
      <tbody>
        <tr>
          <td className="fr-label">발생일시/고장분야</td>
          <td className="fr-center" colSpan={2}>
            {formatDateTime(occurredAt)}
          </td>
          <td className="fr-center" colSpan={2}>
            {field ? `${field}분야` : "-"}
          </td>
        </tr>
        <tr>
          <td className="fr-label">지사/설비명</td>
          <td className="fr-center" colSpan={2}>
            {orDash(branch)}
          </td>
          <td className="fr-center" colSpan={2}>
            {orDash(facility)}
          </td>
        </tr>
        <tr>
          <td className="fr-label">기기명(고장위치)</td>
          <td className="fr-center" colSpan={4}>
            {orDash(device)}
          </td>
        </tr>

        {outageNone ? (
          <tr>
            <td className="fr-label">열공급 중단</td>
            <td className="fr-center" colSpan={4}>
              해당없음
            </td>
          </tr>
        ) : (
          <>
            <tr>
              <td className="fr-label" rowSpan={3}>
                열공급 중단
              </td>
              <td className="fr-sublabel">APT</td>
              <td className="fr-center">{unitText(outageApt, "세대")}</td>
              <td className="fr-sublabel">건물</td>
              <td className="fr-center">{unitText(outageBldg, "개소")}</td>
            </tr>
            <tr>
              <td className="fr-sublabel">중단시간</td>
              <td className="fr-center" colSpan={3}>
                {formatDateTime(outageAt)}
              </td>
            </tr>
            <tr>
              <td className="fr-sublabel">기간</td>
              <td className="fr-center" colSpan={3}>
                {minutesText(outageMins) || "-"}
              </td>
            </tr>
          </>
        )}

        <tr>
          <td className="fr-label">고장내용(추정 원인)</td>
          <td className="fr-body" colSpan={4}>
            {faultContentText}
          </td>
        </tr>

        {/* 상황을 비우면 행 자체를 만들지 않는다 — 열공급 중단과 달리 '해당없음'을 찍지 않는다 */}
        {situation.trim() && (
          <tr>
            <td className="fr-label">{"상황(운전자/목격자\n진술 포함)"}</td>
            <td className="fr-body" colSpan={4}>
              {situation}
            </td>
          </tr>
        )}

        {/* 4칸을 2:2로 나눠 왼쪽은 복구일시, 오른쪽은 자동 계산된 설비 정지기간 */}
        <tr>
          <td className="fr-label">복구일시/설비정지기간</td>
          <td className="fr-center" colSpan={2}>
            {recoveryText}
          </td>
          <td className="fr-center" colSpan={2}>
            {minutesText(downMins) || "-"}
          </td>
        </tr>

        {/* 조치사항도 비우면 행 자체를 만들지 않는다 */}
        {actionTaken.trim() && (
          <tr>
            <td className="fr-label">조치사항</td>
            <td className="fr-body" colSpan={4}>
              {actionTaken}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  return (
    <DocEditor
      mode="fault"
      faultSummary={faultSummary}
      saveMeta={{
        branch,
        field,
        // datetime-local 은 빈 문자열을 주는데 timestamptz 컬럼은 그걸 거부한다 → null
        occurred_at: occurredAt || null,
        recover_at: recoverAt || null,
        recover_note: recoverNote,
        facility,
        device,
        fault_content: faultContent,
        situation,
        cause,
        action_taken: actionTaken,
        outage_none: outageNone,
        // 비었으면 null — 0 으로 넣으면 "0세대 중단"으로 읽힌다
        outage_apt: outageApt ? Number(outageApt) : null,
        outage_bldg: outageBldg ? Number(outageBldg) : null,
        outage_at: outageAt || null,
        outage_mins: outageMins,
      }}
      metaFields={
        <>
          <SortedSelect
            id="faultBranch"
            label="지사"
            values={BRANCHES}
            value={branch}
            onChange={setBranch}
          />
          <SortedSelect
            id="faultField"
            label="분야"
            values={FAULT_FIELDS}
            value={field}
            onChange={setField}
          />
          <TextField
            id="faultOccurredAt"
            label="발생일시"
            type="datetime-local"
            value={occurredAt}
            onChange={setOccurredAt}
          />
          <TextField
            id="faultRecoverAt"
            label="복구일시"
            type="datetime-local"
            value={recoverAt}
            onChange={setRecoverAt}
          />
          <TextField
            id="faultRecoverNote"
            label="복구일시 비고"
            value={recoverNote}
            onChange={setRecoverNote}
            placeholder="예: 예정"
          />
          <TextField
            id="faultFacility"
            label="설비명"
            value={facility}
            onChange={setFacility}
            placeholder="예: 열수송관"
          />
          <TextField
            id="faultDevice"
            label="기기명(고장위치)"
            value={device}
            onChange={setDevice}
          />

          <CheckField
            id="faultOutageNone"
            label="열공급 중단 없음"
            checked={outageNone}
            onChange={setOutageNone}
          />
          {/* 중단이 없으면 세부 칸은 출력되지 않으므로 입력도 받지 않는다 */}
          {!outageNone && (
            <>
              <TextField
                id="faultOutageApt"
                label="열공급 중단 · APT(세대)"
                type="number"
                value={outageApt}
                onChange={setOutageApt}
              />
              <TextField
                id="faultOutageBldg"
                label="열공급 중단 · 건물(개소)"
                type="number"
                value={outageBldg}
                onChange={setOutageBldg}
              />
              <TextField
                id="faultOutageAt"
                label="열공급 중단시간"
                type="datetime-local"
                value={outageAt}
                onChange={setOutageAt}
              />
            </>
          )}

          <TextField
            id="faultContent"
            label="고장내용"
            value={faultContent}
            onChange={setFaultContent}
          />
          <TextField id="faultCause" label="추정 원인" value={cause} onChange={setCause} />
          <TextField id="faultSituation" label="상황" value={situation} onChange={setSituation} />
          <TextField
            id="faultAction"
            label="조치사항"
            value={actionTaken}
            onChange={setActionTaken}
          />
        </>
      }
    />
  );
}
