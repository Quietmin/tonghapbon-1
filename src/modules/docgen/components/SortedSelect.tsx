"use client";

import { sortKorean } from "../lib/constants";

/**
 * 가나다순 셀렉트. 원본 fillSortedSelect() 대응.
 * localeCompare(…,'ko')에 정렬을 맡기면 한글 자모 순서를 직접 계산할 필요가 없고,
 * 목록에 항목을 추가할 때 순서를 신경 쓰지 않아도 된다. (원본 주석)
 */
export default function SortedSelect({
  id,
  label,
  values,
  value,
  onChange,
  placeholder = "선택",
}: {
  id: string;
  label: string;
  values: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-on-surface-variant">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary"
      >
        <option value="">{placeholder}</option>
        {sortKorean(values).map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}

/** 체크 한 칸 — 고장 보고서의 "열공급 중단 없음"처럼 켜고 끄는 값에 쓴다 */
export function CheckField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 self-end pb-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-primary"
      />
      <label htmlFor={id} className="text-xs font-bold text-on-surface-variant">
        {label}
      </label>
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-on-surface-variant">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary"
      />
    </div>
  );
}
