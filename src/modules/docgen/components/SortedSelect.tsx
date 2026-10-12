"use client";

import { sortKorean } from "../lib/constants";
import { joinLocal, splitLocal } from "../lib/faultFormat";
import AutoTextarea from "./AutoTextarea";
import { ACCENT_STYLE, Icon, type Accent } from "@/shared/components/ui";

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

/* ---- 고장 보고서 머리말에 쓰는 칸들 ------------------------------------- */

/**
 * 묶음 제목 한 줄. 오른쪽에 체크박스 같은 것을 끼울 수 있다.
 * 매뉴얼의 "1. 목적"과 고장 보고서의 "1. 고장 요약"이 같은 모양이어야 하므로
 * 치수를 한 곳에만 둔다.
 */
export function SectionHeading({
  title,
  trailing,
  accent = "primary",
}: {
  title: string;
  trailing?: React.ReactNode;
  accent?: Accent;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mt-6 mb-2 first:mt-0">
      {/*
        제목 앞 색 막대. 고장 보고서 작성처럼 칸이 스무 개 넘게 이어지는 화면에서
        묶음이 어디서 바뀌는지 글자만으로는 잘 안 보인다. 색은 챕터 색이라
        "지금 고장 보고서를 쓰는 중"이라는 것도 같이 말해 준다.
      */}
      <span className="flex items-center gap-2.5 min-w-0">
        <span className={`w-1 h-4 rounded-full shrink-0 ${ACCENT_STYLE[accent].bar}`} />
        <span className="text-title-sm text-on-surface truncate">{title}</span>
      </span>
      {trailing}
    </div>
  );
}

/** 제목 줄 오른쪽에 붙는 "해당없음"·"생략" 같은 체크 (원본 .check-inline) */
export function InlineCheck({
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
    <label
      htmlFor={id}
      className="shrink-0 flex items-center gap-2 text-xs font-bold text-on-surface-variant cursor-pointer"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 accent-primary"
      />
      {label}
    </label>
  );
}

const BOX =
  "px-3 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle text-sm text-on-surface outline-none focus:border-primary disabled:cursor-not-allowed";

/**
 * 날짜 칸. 값은 "YYYY-MM-DDTHH:mm" 한 덩어리로 들고 다니고 여기서는 날짜만 만진다 —
 * 그래야 저장·출력 쪽(formatDateTime·spanMinutes·saveMeta)이 그대로 쓰인다.
 * 원본도 화면에서는 날짜와 시각을 나눠 받고 저장할 때 하나로 합친다.
 */
export function DateField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { date, time } = splitLocal(value);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-on-surface-variant">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={date}
        disabled={disabled}
        onChange={(e) => onChange(joinLocal(e.target.value, time))}
        className={BOX}
      />
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/** 시·분 두 셀렉트. 날짜가 비어 있으면 고를 수 없다 (날짜 없는 시각은 뜻이 없다) */
export function TimeField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { date, time } = splitLocal(value);
  const [hh = "", mm = ""] = time ? time.split(":") : [];
  // 한쪽만 고른 상태는 두지 않는다 — 둘이 다 차야 시각이 된다
  const set = (nextH: string, nextM: string) =>
    onChange(joinLocal(date, nextH && nextM ? `${nextH}:${nextM}` : ""));

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-on-surface-variant">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <select
          id={id}
          value={hh}
          disabled={disabled || !date}
          onChange={(e) => set(e.target.value, mm || "00")}
          aria-label={`${label} 시`}
          className={`${BOX} flex-1 min-w-0 text-center`}
        >
          <option value="">시</option>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="text-on-surface-variant">:</span>
        <select
          value={mm}
          disabled={disabled || !date}
          onChange={(e) => set(hh || "00", e.target.value)}
          aria-label={`${label} 분`}
          className={`${BOX} flex-1 min-w-0 text-center`}
        >
          <option value="">분</option>
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** 칸 안 오른쪽에 단위를 붙인 숫자 칸 (원본 .unit-field — "120 세대") */
export function UnitField({
  id,
  label,
  unit,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-on-surface-variant">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${BOX} w-full pr-12`}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant pointer-events-none">
          {unit}
        </span>
      </div>
    </div>
  );
}

/** 자동 계산 값 — 읽기 전용. 비어 있으면 무엇을 채워야 하는지 자리글씨로 알린다 */
export function ComputedField({
  id,
  label,
  value,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-on-surface-variant">
        {label}
      </label>
      {/* 점선 테두리 + 자물쇠 — 비어 있을 때 "왜 못 쓰지?"가 아니라
          "채워지면 나온다"로 읽히게 한다 */}
      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          readOnly
          className="w-full px-3 py-2.5 pr-10 rounded-xl bg-surface-container border border-dashed border-outline-variant text-sm text-on-surface-variant outline-none"
        />
        <Icon
          name="lock"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant/60 pointer-events-none"
        />
      </div>
    </div>
  );
}

/** 여러 줄 입력 — 내용에 따라 늘어난다 */
export function TextAreaField({
  id,
  label,
  value,
  onChange,
  placeholder,
  minRows = 2,
  disabled,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-bold text-on-surface-variant">
          {label}
        </label>
      )}
      <AutoTextarea
        id={id}
        value={value}
        onChange={onChange}
        minRows={minRows}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full ${BOX}`}
      />
    </div>
  );
}
