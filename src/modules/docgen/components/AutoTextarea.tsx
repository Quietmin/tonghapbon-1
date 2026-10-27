"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/*
 * 이 페이지들은 서버에서 미리 그려진다. useLayoutEffect 는 서버에 없는 레이아웃을
 * 만지는 훅이라 React 가 경고를 찍으므로, 서버에서는 useEffect 로 바꿔 둔다.
 * 브라우저에서는 그대로 useLayoutEffect 라 첫 높이 조절이 화면에 그려지기 전에 끝난다.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * 내용 높이에 맞춰 스스로 늘고 줄어드는 textarea.
 *
 * 고정 rows 를 쓰면 한 줄만 적어도 큰 칸이 자리를 차지하고, 길게 적으면 칸 안에서
 * 스크롤이 생겨 적은 내용을 한눈에 볼 수 없다. 사진 설명은 한 줄짜리와 여러 줄짜리가
 * 뒤섞이므로 칸이 내용을 따라가야 한다. 처음엔 minRows(기본 1줄)로 시작한다.
 *
 * 높이를 재기 전에 height 를 auto 로 되돌리는 게 핵심이다 — 그러지 않으면 scrollHeight 가
 * 현재 높이보다 작아지지 않아서 글자를 지워도 칸이 줄어들지 않는다.
 */
export default function AutoTextarea({
  value,
  onChange,
  minRows = 1,
  className = "",
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  /** 비어 있을 때 최소로 유지할 줄 수 */
  minRows?: number;
} & Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "rows" | "style"
>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // 그려지기 전에 맞춘다 — 나중에 맞추면 기본 높이가 한 번 보였다가 줄어들어 깜빡인다
  useIsomorphicLayoutEffect(() => {
    fit();
  }, [value, fit]);

  /*
   * 칸 너비가 바뀌면 같은 글이라도 줄 수가 달라진다(창 크기 조절, 사진 목록이
   * 3열→2열→1열로 접힐 때). 그때 다시 재지 않으면 글자가 잘리거나 빈 자리가 남는다.
   * 폰트가 늦게 로드돼 글자 폭이 변하는 경우도 여기서 함께 잡힌다.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={(e) => {
        // 네이티브 input 이벤트라 DOM 에는 이미 새 값이 들어 있다 — 리렌더를 기다리지
        // 않고 바로 재도 정확하다. 타이핑 중 높이가 한 박자 늦게 따라오지 않게 한다.
        onChange(e.target.value);
        fit();
      }}
      // resize-none — 직접 끌어서 늘리면 내용에 맞추는 동작과 충돌한다.
      // overflow-hidden — 스크롤바가 생기면 scrollHeight 가 흔들린다.
      className={`resize-none overflow-hidden ${className}`}
      {...rest}
    />
  );
}
