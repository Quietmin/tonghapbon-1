"use client";

import { useEffect, useState } from "react";
import DocEditor from "./DocEditor";
import SortedSelect, {
  ComputedField,
  DateField,
  InlineCheck,
  SectionHeading,
  TextAreaField,
  TextField,
  TimeField,
  UnitField,
} from "./SortedSelect";
import { BRANCHES, FAULT_FIELDS } from "../lib/constants";
import { ButtonLink, Icon } from "@/shared/components/ui";
import {
  formatDateTime,
  minutesText,
  nowForDateTimeLocal,
  orDash,
  spanMinutes,
  unitText,
} from "../lib/faultFormat";

/**
 * 고장 보고서 — 고장 요약과 관련 사진을 정리하는 핫라인 메모.
 * 출력물의 "1. 고장 요약" 표는 원본(legacy Photo-Report)의 buildFaultSummaryTable 을
 * 행 구성·병합까지 그대로 옮긴 것이다. 서식이 결재 문서로 그대로 올라가므로
 * 칸 폭(34/24mm)과 행 순서를 임의로 바꾸지 않는다.
 *
 * 입력 화면 배치도 원본과 같다 — 파일명·작성자 다음에 "1. 고장 요약"을 두고,
 * 날짜와 시각을 따로 받으며, 열공급 중단·상황·조치사항은 각각 접어 둘 수 있다.
 * 값은 "YYYY-MM-DDTHH:mm" 한 덩어리로 들고 다닌다(저장 컬럼이 timestamptz 라
 * 합쳐진 값이 필요하고, 출력 서식도 그 형태를 그대로 받는다).
 *
 * 입력 항목은 Supabase docgen_documents 의 고장 보고서 전용 컬럼에 맞췄다
 * (occurred_at / facility / device / fault_content / situation /
 *  recover_at / action_taken / outage_*).
 */
export default function FaultReportEditor() {
  // 지사는 기본값을 두지 않는다 — 고르지 않고 지나쳐도 조용히 찍히는 값이 되면 안 된다.
  const [branch, setBranch] = useState("");
  const [field, setField] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [facility, setFacility] = useState("");
  const [device, setDevice] = useState("");
  const [faultContent, setFaultContent] = useState("");
  const [situation, setSituation] = useState("");
  const [recoverAt, setRecoverAt] = useState("");
  const [recoverNote, setRecoverNote] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  // 열공급 중단 — 없으면 표에 '해당없음' 한 줄만 찍고 세부 행을 만들지 않는다
  const [outageNone, setOutageNone] = useState(false);
  const [outageApt, setOutageApt] = useState("");
  const [outageBldg, setOutageBldg] = useState("");
  const [outageAt, setOutageAt] = useState("");
  /*
   * 상황·조치사항의 '생략'. 열공급 중단과 달리 출력물에서 행 자체가 빠진다 —
   * '해당없음'을 찍지 않는다(원본과 동일). 보관함에는 '생략'이라고 남겨,
   * 나중에 목록에서 볼 때 "안 적었다"와 "일부러 뺐다"가 구분되게 한다.
   */
  const [situationNone, setSituationNone] = useState(false);
  const [actionNone, setActionNone] = useState(false);

  /*
   * 발생일시는 이 화면을 연 시각으로 미리 채운다 — 고장 보고서는 대개 상황이
   * 벌어진 직후에 쓰므로 그 시각이 맞는 경우가 많고, 아니면 고치면 된다.
   *
   * useState 초기값이 아니라 마운트 뒤에 채우는 이유: 이 페이지는 정적으로 미리
   * 그려져서, 초기값으로 넣으면 빌드 시각이 HTML 에 박히고 브라우저가 계산한 값과
   * 달라 하이드레이션이 어긋난다.
   *
   * prev 가 비어 있을 때만 채운다 — 임시저장 복구가 먼저 값을 넣었다면 덮지 않는다.
   */
  useEffect(() => {
    setOccurredAt((prev) => prev || nowForDateTimeLocal());
  }, []);

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
            {orDash(faultContent)}
          </td>
        </tr>

        {/* 생략하면 행 자체를 만들지 않는다 — 열공급 중단과 달리 '해당없음'을 찍지 않는다 */}
        {!situationNone && (
          <tr>
            <td className="fr-label">{"상황(운전자/목격자\n진술 포함)"}</td>
            <td className="fr-body" colSpan={4}>
              {orDash(situation)}
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

        {!actionNone && (
          <tr>
            <td className="fr-label">조치사항</td>
            <td className="fr-body" colSpan={4}>
              {orDash(actionTaken)}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  return (
    <DocEditor
      mode="fault"
      accent="primary"
      faultSummary={faultSummary}
      // 작성 ↔ 조회를 제목 줄에서 바로 오간다. 반대쪽(조회 화면)의 작성 버튼과
      // 같은 색으로 둬서, 두 화면을 오갈 때 같은 자리의 같은 버튼으로 읽히게 한다.
      headingAction={
        <ButtonLink href="/failure" variant="primary">
          <Icon name="inventory_2" className="text-lg" />
          고장보고서 조회
        </ButtonLink>
      }
      saveMeta={{
        branch,
        field,
        // 날짜 칸은 빈 문자열을 주는데 timestamptz 컬럼은 그걸 거부한다 → null
        occurred_at: occurredAt || null,
        recover_at: recoverAt || null,
        recover_note: recoverNote,
        facility,
        device,
        fault_content: faultContent,
        // 일부러 뺀 항목은 '생략'으로 남긴다 (원본과 같은 값)
        situation: situationNone ? "생략" : situation,
        action_taken: actionNone ? "생략" : actionTaken,
        outage_none: outageNone,
        // 비었으면 null — 0 으로 넣으면 "0세대 중단"으로 읽힌다
        outage_apt: outageApt ? Number(outageApt) : null,
        outage_bldg: outageBldg ? Number(outageBldg) : null,
        outage_at: outageAt || null,
        outage_mins: outageMins,
      }}
      // 임시저장을 되살릴 때 머리말도 함께 돌려받는다 (키는 saveMeta 와 같다).
      // 저장할 때 datetime 은 빈 값을 null 로 바꿔 넣으므로, 되돌릴 때 ?? "" 로 받는다.
      onRestoreMeta={(m) => {
        const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
        const num = (v: unknown) => (typeof v === "number" ? String(v) : "");
        setBranch(str(m.branch));
        setField(str(m.field));
        setOccurredAt(str(m.occurred_at));
        setRecoverAt(str(m.recover_at));
        setRecoverNote(str(m.recover_note));
        setFacility(str(m.facility));
        setDevice(str(m.device));
        setFaultContent(str(m.fault_content));
        // '생략'은 값이 아니라 상태다 — 되살릴 때 입력칸에 그 글자를 넣지 않는다
        const situationValue = str(m.situation);
        setSituationNone(situationValue === "생략");
        setSituation(situationValue === "생략" ? "" : situationValue);
        const actionValue = str(m.action_taken);
        setActionNone(actionValue === "생략");
        setActionTaken(actionValue === "생략" ? "" : actionValue);
        setOutageNone(m.outage_none === true);
        setOutageApt(num(m.outage_apt));
        setOutageBldg(num(m.outage_bldg));
        setOutageAt(str(m.outage_at));
      }}
      // 파일명·작성자는 한 줄씩 따로 선다 (원본 배치)
      renderMeta={({ fileNameField, authorField }) => (
        <div className="flex flex-col gap-4">
          {fileNameField}
          {authorField}
        </div>
      )}
      sections={
        <div className="mt-5 pt-5 border-t border-border-subtle">
          <SectionHeading accent="primary" title="1. 고장 요약" />

          <div className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <DateField
                id="faultOccurredDate"
                label="발생일시"
                value={occurredAt}
                onChange={setOccurredAt}
              />
              <TimeField
                id="faultOccurredTime"
                label="발생시각"
                value={occurredAt}
                onChange={setOccurredAt}
              />
            </div>

            <SortedSelect
              id="faultField"
              label="고장분야"
              values={FAULT_FIELDS}
              value={field}
              onChange={setField}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <SortedSelect
                id="faultBranch"
                label="지사"
                values={BRANCHES}
                value={branch}
                onChange={setBranch}
              />
              <TextField
                id="faultFacility"
                label="설비명"
                value={facility}
                onChange={setFacility}
                placeholder="예: ST 보조 변압기"
              />
            </div>

            <TextField
              id="faultDevice"
              label="기기명(고장위치)"
              value={device}
              onChange={setDevice}
              placeholder="예: ST 보조 변압기 방압변"
            />
          </div>

          {/* 체크가 세부 칸 바로 위에 있어야 무엇을 끄는 스위치인지 읽힌다 */}
          <SectionHeading
            accent="primary"
            title="열공급 중단"
            trailing={
              <InlineCheck
                id="faultOutageNone"
                label="해당없음"
                checked={outageNone}
                onChange={setOutageNone}
              />
            }
          />
          {/* 중단이 없으면 출력물에 세부 칸이 나오지 않으므로 입력도 받지 않는다 */}
          {!outageNone && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <UnitField
                  id="faultOutageApt"
                  label="APT"
                  unit="세대"
                  value={outageApt}
                  onChange={setOutageApt}
                  placeholder="예: 120"
                />
                <UnitField
                  id="faultOutageBldg"
                  label="건물"
                  unit="개소"
                  value={outageBldg}
                  onChange={setOutageBldg}
                  placeholder="예: 3"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <DateField
                  id="faultOutageDate"
                  label="중단일자"
                  value={outageAt}
                  onChange={setOutageAt}
                />
                <TimeField
                  id="faultOutageTime"
                  label="중단시각"
                  value={outageAt}
                  onChange={setOutageAt}
                />
              </div>
              <ComputedField
                id="faultOutageDuration"
                label="기간 (자동 계산)"
                value={minutesText(outageMins)}
                placeholder="중단일시와 복구일시를 입력하면 자동 계산됩니다"
              />
            </div>
          )}

          <div className="mt-6">
            <TextAreaField
              id="faultContent"
              label="고장내용(추정 원인)"
              value={faultContent}
              onChange={setFaultContent}
              placeholder="고장 내용을 입력하세요."
            />
          </div>

          <SectionHeading
            accent="primary"
            title="상황"
            trailing={
              <InlineCheck
                id="faultSituationNone"
                label="생략"
                checked={situationNone}
                onChange={setSituationNone}
              />
            }
          />
          {/* 제목 줄에 괄호까지 넣으면 "해당없음" 체크와 겹쳐 잘려 보인다 — 따로 한 줄로 뺀다 */}
          <p className="text-xs text-on-surface-variant -mt-1 mb-2">운전자·목격자 진술 포함</p>
          {/* 지우지 않고 잠가 둔다 — 체크를 풀면 적어 둔 내용이 그대로 돌아와야 한다 */}
          <div className={situationNone ? "opacity-45 pointer-events-none" : undefined}>
            <TextAreaField
              id="faultSituation"
              value={situation}
              onChange={setSituation}
              minRows={3}
              disabled={situationNone}
              placeholder="상황을 입력하세요."
            />
          </div>

          <div className="mt-6 flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-3">
              <DateField
                id="faultRecoverDate"
                label="복구 일자"
                value={recoverAt}
                onChange={setRecoverAt}
              />
              <TimeField
                id="faultRecoverTime"
                label="복구 시각"
                value={recoverAt}
                onChange={setRecoverAt}
              />
              <TextField
                id="faultRecoverNote"
                label="직접 입력"
                value={recoverNote}
                onChange={setRecoverNote}
                placeholder="예: 미정 / 부품 수급 후"
              />
            </div>
            <ComputedField
              id="faultDownTime"
              label="설비 정지기간 (자동 계산)"
              value={minutesText(downMins)}
              placeholder="발생일시와 복구일시를 입력하면 자동 계산됩니다"
            />
          </div>

          <SectionHeading
            accent="primary"
            title="조치사항"
            trailing={
              <InlineCheck
                id="faultActionNone"
                label="생략"
                checked={actionNone}
                onChange={setActionNone}
              />
            }
          />
          <div className={actionNone ? "opacity-45 pointer-events-none" : undefined}>
            <TextAreaField
              id="faultAction"
              value={actionTaken}
              onChange={setActionTaken}
              minRows={3}
              disabled={actionNone}
              placeholder="조치 사항을 입력하세요."
            />
          </div>

          <SectionHeading accent="primary" title="2. 관련 사진" />
          <p className="text-xs text-on-surface-variant leading-relaxed">
            추가한 사진이 등록 순서대로 출력됩니다.
          </p>
        </div>
      }
    />
  );
}
