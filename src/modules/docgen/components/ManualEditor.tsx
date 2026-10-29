"use client";

import { useState } from "react";
import DocEditor from "./DocEditor";
import SortedSelect, { PlainSelect, TextField } from "./SortedSelect";
import { ManualHeader } from "./Letterhead";
import { ButtonLink, Icon } from "@/shared/components/ui";
import {
  ManualSectionsFields,
  ManualSectionsPrint,
  EMPTY_MANUAL_SECTIONS,
  normalizeManualSections,
  type ManualSectionsValue,
} from "./ManualSections";
import { BRANCHES, MANUAL_FIELDS, MANUAL_TYPES } from "../lib/constants";

/** 개정번호 — 1~10번 중에서 고른다 (원본은 자유 입력이었지만, 값이 흩어지지 않도록 묶었다) */
const REVISIONS = Array.from({ length: 10 }, (_, i) => String(i + 1));
/** 11번 이상은 목록에 없으니 이 항목을 고르면 아래에 직접 입력 칸이 뜬다 */
const REVISION_CUSTOM = "직접 입력";

/**
 * 매뉴얼 — 사진마다 순번을 매겨 절차를 안내하는 문서.
 * 원본과 동일하게 사진 순번 배지를 붙이고, 텍스트 전용 칸을 허용한다
 * (커밋 2fa4cc7 "매뉴얼에 텍스트 칸 추가").
 *
 * 머리말 배치도 원본(legacy Photo-Report)과 같다 —
 * 종류·분야·지사 한 줄 → 파일명 한 줄 → 작성자·개정번호 한 줄 → 1~4번 항목.
 * 그래서 다른 모드처럼 metaFields 에 칸만 넘기지 않고 renderMeta 로 줄을 직접 나눈다.
 */
export default function ManualEditor() {
  const [manualType, setManualType] = useState("");
  const [field, setField] = useState("");
  // 지사·분야 모두 기본값을 두지 않는다 — 기본값이 들어가 있으면 고르지 않고
  // 지나쳐도 그 값이 조용히 문서에 찍혀, 틀린 지사가 출력될 수 있다.
  const [branch, setBranch] = useState("");
  const [revision, setRevision] = useState("");
  // "직접 입력"을 고르면 켠다 — 10 넘는 개정번호는 목록에 없어 직접 써야 한다
  const [revisionCustom, setRevisionCustom] = useState(false);
  // 1~4번 항목(목적·준비물·주의 사항·내용)
  const [sections, setSections] = useState<ManualSectionsValue>(EMPTY_MANUAL_SECTIONS);

  return (
    <DocEditor
      mode="manual"
      numbered
      allowTextItems
      // 작성 ↔ 조회를 제목 줄에서 바로 오간다. 반대쪽(조회 화면)의 작성 버튼과
      // 같은 색으로 둬서, 두 화면을 오갈 때 같은 자리의 같은 버튼으로 읽히게 한다.
      headingAction={
        <ButtonLink href="/manual">
          <Icon name="inventory_2" className="text-lg" />
          매뉴얼 조회
        </ButtonLink>
      }
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
      // 1~4번 항목은 첫 장 사진 격자 위에만 들어간다 (원본과 동일)
      firstPageSummary={<ManualSectionsPrint value={sections} />}
      saveMeta={{ manual_type: manualType, field, branch, revision }}
      // 1~4번 항목은 docgen_documents 에 들어갈 컬럼이 없다 — 임시저장에만 싣는다
      draftExtra={{ sections }}
      // 임시저장을 되살릴 때 머리말도 함께 돌려받는다 (키는 saveMeta·draftExtra 와 같다)
      onRestoreMeta={(m) => {
        setManualType(typeof m.manual_type === "string" ? m.manual_type : "");
        setField(typeof m.field === "string" ? m.field : "");
        setBranch(typeof m.branch === "string" ? m.branch : "");
        const rev = typeof m.revision === "string" ? m.revision : "";
        setRevision(rev);
        setRevisionCustom(rev !== "" && !REVISIONS.includes(rev));
        setSections(normalizeManualSections(m.sections));
      }}
      renderMeta={({ fileNameField, authorField }) => (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-3">
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
          </div>

          {fileNameField}

          {/* 보관함이 꺼져 있으면 작성자 칸이 없다 — 그때는 개정번호가 한 줄을 다 쓴다 */}
          <div className={`grid gap-4 ${authorField ? "md:grid-cols-2" : ""}`}>
            {authorField}
            <div className="flex flex-col gap-4">
              <PlainSelect
                id="manualRevision"
                label="개정번호"
                values={[...REVISIONS, REVISION_CUSTOM]}
                value={revisionCustom ? REVISION_CUSTOM : revision}
                onChange={(v) => {
                  if (v === REVISION_CUSTOM) {
                    setRevisionCustom(true);
                    setRevision("");
                  } else {
                    setRevisionCustom(false);
                    setRevision(v);
                  }
                }}
              />
              {revisionCustom && (
                <TextField
                  id="manualRevisionCustomValue"
                  label="개정번호 직접 입력"
                  value={revision}
                  onChange={setRevision}
                  placeholder="예: 11"
                />
              )}
            </div>
          </div>
        </div>
      )}
      sections={<ManualSectionsFields value={sections} onChange={setSections} />}
    />
  );
}
