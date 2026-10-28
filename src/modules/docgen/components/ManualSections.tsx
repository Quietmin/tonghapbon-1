"use client";

import AutoTextarea from "./AutoTextarea";
import { SectionHeading } from "./SortedSelect";
import { Icon } from "@/shared/components/ui";

/**
 * 매뉴얼 1~4번 항목 — 목적 · 준비물 · 주의 사항 · 내용.
 *
 * 원본(legacy Photo-Report) 사진대장.html 의 #manualSections 블록과
 * MANUAL_SECTION_DEFS / buildManualSummarySections() 를 그대로 옮긴 것이다.
 *
 * 생략한 항목은 출력물에서 통째로 빠지고 남은 항목끼리 번호를 1부터 다시 매긴다 —
 * 그래서 입력 화면의 "3. 주의 사항"이 출력물에서는 "2. 주의 사항"이 될 수 있다
 * (원본과 같은 동작이다).
 *
 * 4번 '내용'에는 입력란이 없다. 바로 아래에서 추가하는 사진·텍스트가 곧 그 항목의
 * 내용이라 따로 적을 것이 없고, 사진이 필수인 이상 생략도 의미가 없다.
 */

export interface ManualSectionsValue {
  purpose: string;
  prep: string;
  caution: string;
  /** 생략한 항목 */
  skip: { purpose: boolean; prep: boolean; caution: boolean };
  /** 준비물 표 — [+ 표 추가] 를 누르기 전에는 null. 첫 줄이 머리글이다. */
  prepTable: string[][] | null;
}

type SkipKey = keyof ManualSectionsValue["skip"];

export const EMPTY_MANUAL_SECTIONS: ManualSectionsValue = {
  purpose: "",
  prep: "",
  caution: "",
  skip: { purpose: false, prep: false, caution: false },
  prepTable: null,
};

/** [+ 표 추가] 가 처음 만드는 표 (원본 defaultManualPrepTable) */
const DEFAULT_PREP_TABLE: string[][] = [
  ["구분", "위치", "수량(EA)"],
  ["", "", ""],
];

/**
 * 임시저장에서 돌아온 값을 믿지 않고 모양을 맞춘다.
 * IndexedDB 에 들어 있던 예전 판(이 항목이 없던 시절)도 그냥 열려야 한다.
 */
export function normalizeManualSections(raw: unknown): ManualSectionsValue {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const skip = (o.skip ?? {}) as Record<string, unknown>;
  const table = Array.isArray(o.prepTable)
    ? (o.prepTable as unknown[])
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) => row.map((cell) => str(cell)))
    : null;
  return {
    purpose: str(o.purpose),
    prep: str(o.prep),
    caution: str(o.caution),
    skip: {
      purpose: skip.purpose === true,
      prep: skip.prep === true,
      caution: skip.caution === true,
    },
    prepTable: table && table.length > 0 ? table : null,
  };
}

const TEXTAREA_CLASS =
  "w-full px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary md:rounded-sm md:bg-surface-container-low md:focus:bg-surface-container-lowest disabled:cursor-not-allowed";

/* ---- 입력 화면 ----------------------------------------------------------- */

function SectionHead({
  number,
  label,
  skipped,
  onToggleSkip,
}: {
  number: number;
  label: string;
  skipped?: boolean;
  /** 없으면 생략 버튼을 그리지 않는다 (4번 '내용') */
  onToggleSkip?: () => void;
}) {
  return (
    <SectionHeading
      title={`${number}. ${label}`}
      trailing={
        onToggleSkip && (
          <button
            type="button"
            onClick={onToggleSkip}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              skipped
                ? "bg-primary text-on-primary border-primary"
                : "bg-surface-container border-border-subtle text-on-surface-variant hover:bg-surface-container-highest"
            }`}
          >
            {skipped ? "생략 취소" : "생략"}
          </button>
        )
      }
    />
  );
}

/** 생략한 항목은 흐리게 두고 손이 닿지 않게 한다 — 지우지 않아야 다시 풀 수 있다 */
function SectionBody({ skipped, children }: { skipped?: boolean; children: React.ReactNode }) {
  return <div className={skipped ? "opacity-45 pointer-events-none" : undefined}>{children}</div>;
}

export function ManualSectionsFields({
  value,
  onChange,
}: {
  value: ManualSectionsValue;
  onChange: (next: ManualSectionsValue) => void;
}) {
  const patch = (p: Partial<ManualSectionsValue>) => onChange({ ...value, ...p });
  const toggleSkip = (key: SkipKey) => patch({ skip: { ...value.skip, [key]: !value.skip[key] } });

  const table = value.prepTable;
  /** 행마다 열 수가 어긋나지 않도록 첫 줄을 기준으로 삼는다 */
  const columns = table?.[0]?.length ?? 0;

  function setCell(ri: number, ci: number, v: string) {
    if (!table) return;
    patch({
      prepTable: table.map((row, r) => (r === ri ? row.map((c, i) => (i === ci ? v : c)) : row)),
    });
  }

  /** ri 행 바로 아래에 빈 행을 끼워 넣는다 — 맨 아래 행에서 누르면 결과적으로 끝에 추가하는 것과 같다 */
  function insertRowAfter(ri: number) {
    if (!table) return;
    const row = new Array(columns).fill("");
    patch({ prepTable: [...table.slice(0, ri + 1), row, ...table.slice(ri + 1)] });
  }

  function deleteRow(ri: number) {
    if (!table || table.length <= 1) return;
    patch({ prepTable: table.filter((_, r) => r !== ri) });
  }

  /** ci 열 바로 오른쪽에 빈 열을 끼워 넣는다 — 모든 행에 같은 자리로 넣는다 */
  function insertColAfter(ci: number) {
    if (!table) return;
    patch({ prepTable: table.map((row) => [...row.slice(0, ci + 1), "", ...row.slice(ci + 1)]) });
  }

  function deleteCol(ci: number) {
    if (!table || columns <= 1) return;
    patch({ prepTable: table.map((row) => row.filter((_, c) => c !== ci)) });
  }

  return (
    <div className="mt-5 pt-5 border-t border-border-subtle">
      <SectionHead
        number={1}
        label="목적"
        skipped={value.skip.purpose}
        onToggleSkip={() => toggleSkip("purpose")}
      />
      <SectionBody skipped={value.skip.purpose}>
        <AutoTextarea
          value={value.purpose}
          onChange={(v) => patch({ purpose: v })}
          minRows={2}
          disabled={value.skip.purpose}
          placeholder="문서의 목적을 입력하세요."
          className={TEXTAREA_CLASS}
        />
      </SectionBody>

      <SectionHead
        number={2}
        label="준비물"
        skipped={value.skip.prep}
        onToggleSkip={() => toggleSkip("prep")}
      />
      <SectionBody skipped={value.skip.prep}>
        <AutoTextarea
          value={value.prep}
          onChange={(v) => patch({ prep: v })}
          minRows={2}
          disabled={value.skip.prep}
          placeholder="준비물을 입력하세요."
          className={TEXTAREA_CLASS}
        />

        {table ? (
          <div className="mt-2.5">
            {/* 각 칸 옆·머리글 칸 아래에 그 행/열을 겨눈 추가·삭제 버튼을 둔다 —
                "마지막 행/열"만 건드리던 예전과 달리 원하는 자리를 직접 고를 수 있다.
                맨 아래 행·맨 오른쪽 열에서 [+]를 누르면 결과적으로 끝에 추가하는
                것과 같아서, 끝에 추가하는 용도도 따로 안 둬도 된다. */}
            <p className="text-[11px] text-on-surface-variant mb-1.5">
              칸 오른쪽 [+ / −]는 그 행을, 머리글 칸 아래 [+ / −]는 그 열을 겨눕니다.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse mb-2">
                <tbody>
                  {table.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className={`border border-border-subtle p-0 align-top ${
                            ri === 0 ? "bg-surface-container-high" : ""
                          }`}
                        >
                          <input
                            type="text"
                            value={cell}
                            onChange={(e) => setCell(ri, ci, e.target.value)}
                            disabled={value.skip.prep}
                            aria-label={`준비물 표 ${ri + 1}행 ${ci + 1}열`}
                            className={`w-full px-2.5 py-2 bg-transparent text-sm text-on-surface outline-none focus:bg-surface-container-highest ${
                              ri === 0 ? "font-bold text-center" : ""
                            }`}
                          />
                          {/* 열 조작 — 머리글 칸(첫 행)에만 둔다. 열 하나당 자리는 하나뿐이라 */}
                          {ri === 0 && (
                            <div className="flex items-center justify-center gap-1 pb-1">
                              <CellOpButton
                                icon="add"
                                title={`${ci + 1}열 오른쪽에 열 추가`}
                                onClick={() => insertColAfter(ci)}
                                disabled={value.skip.prep}
                              />
                              <CellOpButton
                                icon="remove"
                                title={`${ci + 1}열 삭제`}
                                onClick={() => deleteCol(ci)}
                                disabled={value.skip.prep || columns <= 1}
                              />
                            </div>
                          )}
                        </td>
                      ))}
                      {/* 행 조작 — 표 바깥에 붙는 제어용 칸이라 테두리 없이 둔다 */}
                      <td className="p-0 pl-1 align-top">
                        <div className="flex items-center gap-1 h-full py-2">
                          <CellOpButton
                            icon="add"
                            title={`${ri + 1}행 아래에 행 추가`}
                            onClick={() => insertRowAfter(ri)}
                            disabled={value.skip.prep}
                          />
                          <CellOpButton
                            icon="remove"
                            title={`${ri + 1}행 삭제`}
                            onClick={() => deleteRow(ri)}
                            disabled={value.skip.prep || table.length <= 1}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2">
              <TableButton
                label="표 삭제"
                danger
                onClick={() => {
                  if (!window.confirm("표를 삭제하시겠습니까?")) return;
                  patch({ prepTable: null });
                }}
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => patch({ prepTable: DEFAULT_PREP_TABLE.map((row) => [...row]) })}
            disabled={value.skip.prep}
            className="mt-2 w-full px-3.5 py-2 rounded-xl border border-dashed border-outline-variant text-sm font-medium text-on-surface-variant hover:bg-surface-container-high disabled:cursor-not-allowed"
          >
            + 표 추가
          </button>
        )}
      </SectionBody>

      <SectionHead
        number={3}
        label="주의 사항"
        skipped={value.skip.caution}
        onToggleSkip={() => toggleSkip("caution")}
      />
      <SectionBody skipped={value.skip.caution}>
        <AutoTextarea
          value={value.caution}
          onChange={(v) => patch({ caution: v })}
          minRows={2}
          disabled={value.skip.caution}
          placeholder="주의 사항을 입력하세요."
          className={TEXTAREA_CLASS}
        />
      </SectionBody>

      <SectionHead number={4} label="내용" />
      <p className="text-xs text-on-surface-variant leading-relaxed">
        사진·텍스트를 등록 순서대로 출력합니다.
      </p>
    </div>
  );
}

function TableButton({
  label,
  onClick,
  danger = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? "border-error text-error hover:bg-error/10"
          : "border-on-surface text-on-surface hover:bg-surface-container-high"
      }`}
    >
      {label}
    </button>
  );
}

/** 표 칸 옆에 붙는 작은 아이콘 버튼 — 행/열 추가(add)·삭제(remove)에 쓴다 */
function CellOpButton({
  icon,
  title,
  onClick,
  disabled = false,
}: {
  icon: "add" | "remove";
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`w-5 h-5 rounded flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        icon === "remove"
          ? "text-error hover:bg-error/10"
          : "text-on-surface-variant hover:bg-surface-container-high"
      }`}
    >
      <Icon name={icon} className="text-xs" />
    </button>
  );
}

/* ---- 출력물 (A4 첫 장) --------------------------------------------------- */

/**
 * 출력물 첫 장의 1~N번 항목. 생략한 항목은 빼고 번호를 다시 매긴다
 * (원본 buildManualSummarySections).
 */
export function ManualSectionsPrint({ value }: { value: ManualSectionsValue }) {
  const defs: { key: SkipKey | "detail"; label: string; body?: string; table?: boolean }[] = [
    { key: "purpose", label: "목적", body: value.purpose },
    { key: "prep", label: "준비물", body: value.prep, table: true },
    { key: "caution", label: "주의 사항", body: value.caution },
    { key: "detail", label: "내용" },
  ];

  let n = 0;
  return (
    <>
      {defs.map((def) => {
        if (def.key !== "detail" && value.skip[def.key]) return null;
        n += 1;
        return (
          <div key={def.key} className="man-sec">
            <div className="man-sec-heading">
              {n}. {def.label}
            </div>
            {def.body !== undefined && <div className="man-sec-body">{def.body}</div>}
            {def.table && value.prepTable && (
              <table className="man-prep-table">
                <tbody>
                  {value.prepTable.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </>
  );
}
