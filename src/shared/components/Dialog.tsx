"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./ui";

/**
 * 앱 전체의 팝업 — 현황 상세·조치 갱신, 실적 입력, 계정 설정, 삭제 확인, PDF 미리보기 등이 모두 이 부품 하나를 쓴다.
 * (예전에는 팝업마다 틀을 따로 만들어 Esc·스크롤 잠금·포커스 처리가 제각각이었다.)
 *
 * 하는 일
 *  - body 로 포털한다. 카드(backdrop-filter) 안에서 fixed 로 그리면 창이 카드에 갇혀 뒤따르는 카드에 가려진다.
 *  - Esc·바깥 클릭으로 닫는다(여러 개가 겹치면 맨 위 창만 Esc 에 닫힌다).
 *  - 열려 있는 동안 뒤 화면이 같이 스크롤되지 않게 잠근다(겹쳐도 마지막 창이 닫힐 때 풀린다).
 *  - 열릴 때 창 안으로 포커스를 옮기고(이미 안에 있으면 그대로), Tab 이 창 밖으로 나가지 않게 가두고,
 *    닫히면 열기 전에 포커스가 있던 곳으로 돌려준다.
 *  - 폰에서는 아래에서 올라오는 시트, 넓은 화면에서는 가운데 창이다(sheet=false 면 폰에서도 가운데).
 */

type DialogSize = "sm" | "md" | "lg" | "xl" | "viewer";

/** viewer = 문서를 보는 창(화면을 최대한 쓴다). 나머지는 폭만 다르다 */
const PANEL_SIZE: Record<DialogSize, string> = {
  sm: "sm:max-w-sm max-h-[92vh]",
  md: "sm:max-w-lg max-h-[92vh]",
  lg: "sm:max-w-2xl max-h-[92vh]",
  xl: "sm:max-w-4xl max-h-[92vh]",
  viewer: "h-full sm:max-w-5xl max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)]",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 열려 있는 창들(맨 뒤가 맨 위) — Esc 를 맨 위 창만 처리하게 한다 */
const stack: symbol[] = [];

let scrollLocks = 0;
let savedOverflow = "";
function lockScroll() {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  return () => {
    if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
  };
}

export default function Dialog({
  onClose,
  label,
  labelledBy,
  size = "md",
  sheet = true,
  top = false,
  dismissible = true,
  tone = "card",
  className = "p-6 flex flex-col gap-4",
  children,
}: {
  onClose: () => void;
  /** 스크린리더가 읽을 창 이름(labelledBy 가 없을 때) */
  label?: string;
  /** 창 안 제목 요소의 id */
  labelledBy?: string;
  size?: DialogSize;
  /** 폰에서 아래 시트로 보일지(기본) — false 면 폰에서도 가운데 창 */
  sheet?: boolean;
  /** 다른 창보다 위에 떠야 할 때(계정 설정처럼 어느 화면에서나 뜨는 창) */
  top?: boolean;
  /** false 면 Esc·바깥 클릭으로 닫히지 않는다(반드시 눌러야 하는 창) */
  dismissible?: boolean;
  /** card = 흰 카드 바탕, page = 화면 바탕색(카드가 여러 장 들어가는 창) */
  tone?: "card" | "page";
  /** 창 안쪽 여백·배치. 주면 기본값(p-6 flex flex-col gap-4)을 대신한다 */
  className?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const id = useRef(Symbol("dialog")).current;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    stack.push(id);
    const unlock = lockScroll();

    // 이미 창 안(autoFocus 등)에 포커스가 있으면 건드리지 않고, 없으면 첫 입력·버튼으로
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      (panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      unlock();
      // 열기 전에 있던 자리로 돌려준다(그 사이 사라졌으면 그냥 둔다)
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [id, dismissible]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${top ? "z-[500]" : "z-[300]"} flex ${
        sheet ? "items-end sm:items-center" : "items-center"
      } justify-center ${size === "viewer" ? "p-2 sm:p-4 bg-black/60" : sheet ? "sm:p-4 bg-black/40" : "p-4 bg-black/40"} print:hidden`}
      onClick={dismissible ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${PANEL_SIZE[size]} ${
          size === "viewer" ? "" : "overflow-y-auto"
        } ${sheet ? "rounded-t-2xl sm:rounded-2xl" : "rounded-2xl"} ${
          tone === "page" ? "bg-surface" : "bg-surface-container-lowest"
        } shadow-xl outline-none ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * 창 맨 위 줄 — 제목(과 그 위의 칩 등)은 왼쪽, 닫기 버튼은 오른쪽. 닫기 버튼은 손가락으로 누르기 좋게 40px.
 * title 은 labelledBy 와 같은 id 를 가진 요소로 그려 Dialog 의 이름이 된다.
 */
export function DialogHeader({
  id,
  title,
  above,
  onClose,
}: {
  id: string;
  title: ReactNode;
  /** 제목 위에 얹을 것(상태 칩 등) */
  above?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {above && <div className="mb-2">{above}</div>}
        <h3 id={id} className="text-title-sm text-on-surface break-keep">
          {title}
        </h3>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="w-10 h-10 shrink-0 -mr-1 -mt-1 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
