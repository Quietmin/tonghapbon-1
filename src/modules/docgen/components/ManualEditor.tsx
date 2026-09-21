"use client";

import { useState } from "react";
import DocEditor from "./DocEditor";
import SortedSelect, { TextField } from "./SortedSelect";
import { ManualHeader } from "./Letterhead";
import {
  BRANCHES,
  DEFAULT_BRANCH,
  MANUAL_FIELDS,
  MANUAL_TYPES,
} from "../lib/constants";

/**
 * 매뉴얼 — 사진마다 순번을 매겨 절차를 안내하는 문서.
 * 원본과 동일하게 사진 순번 배지를 붙이고, 텍스트 전용 칸을 허용한다
 * (커밋 2fa4cc7 "매뉴얼에 텍스트 칸 추가").
 */
export default function ManualEditor() {
  const [manualType, setManualType] = useState("");
  const [field, setField] = useState("");
  // 지사는 대부분 양산지사에서 작성하므로 기본값을 넣어 둔다. 분야는 기본값을 두지
  // 않는다 — 고르지 않고 지나쳐도 그 값이 조용히 문서에 찍히기 때문. (원본 주석)
  const [branch, setBranch] = useState(DEFAULT_BRANCH);
  const [revision, setRevision] = useState("");

  return (
    <DocEditor
      mode="manual"
      numbered
      allowTextItems
      // 표제부는 장마다 다시 그린다 — "페이지 n/N"이 들어가기 때문
      renderLetterhead={(pageNo, pageCount, title) => (
        <ManualHeader
          docType={manualType}
          branch={branch}
          field={field}
          revision={revision}
          title={title}
          pageNo={pageNo}
          pageCount={pageCount}
        />
      )}
      saveMeta={{ manual_type: manualType, field, branch, revision }}
      // 임시저장을 되살릴 때 머리말도 함께 돌려받는다 (키는 saveMeta 와 같다)
      onRestoreMeta={(m) => {
        setManualType(typeof m.manual_type === "string" ? m.manual_type : "");
        setField(typeof m.field === "string" ? m.field : "");
        setBranch(typeof m.branch === "string" ? m.branch : DEFAULT_BRANCH);
        setRevision(typeof m.revision === "string" ? m.revision : "");
      }}
      metaFields={
        <>
          <SortedSelect
            id="manualType"
            label="매뉴얼 종류"
            values={MANUAL_TYPES}
            value={manualType}
            onChange={setManualType}
          />
          <SortedSelect
            id="manualField"
            label="분야"
            values={MANUAL_FIELDS}
            value={field}
            onChange={setField}
          />
          <SortedSelect
            id="manualBranch"
            label="지사"
            values={BRANCHES}
            value={branch}
            onChange={setBranch}
          />
          <TextField
            id="manualRevision"
            label="개정번호"
            value={revision}
            onChange={setRevision}
            placeholder="예: Rev.1"
          />
        </>
      }
    />
  );
}
