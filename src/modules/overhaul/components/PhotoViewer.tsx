"use client";

import { useEffect, useRef, useState } from "react";
import Dialog from "@/shared/components/Dialog";
import { Icon } from "@/shared/components/ui";

/**
 * 분해 전·후 사진 크게 보기.
 *
 * 한 장씩 넘겨 보는 보기와, 분해 전·후를 나란히 놓는 비교 보기가 있다. 사진은 날짜별 실적에
 * 붙어 저장되지만 같은 작업이면 날짜가 달라도 한데 모아 넘긴다 — 분해 전은 첫날, 분해 후는
 * 며칠 뒤에 찍는 게 보통이라 날짜별로만 보면 둘을 맞대 볼 수 없기 때문이다.
 *
 * 실적 입력 팝업 위에 뜨므로 top 으로 띄운다(Esc 는 이 창만 닫는다).
 * 사진을 누르거나 두 번 누르면 2배로 커지고, 커진 상태에서는 손가락으로 끌어 옮겨 본다.
 */

export interface ViewerPhoto {
  key: string;
  src: string;
  slot: "before" | "after";
  date: string;
}

const SLOT_LABEL = { before: "분해 전", after: "분해 후" } as const;
const SLOT_BORDER = { before: "border-primary", after: "border-status-success" } as const;

const shortDate = (d: string) => d.slice(5).replace("-", ".");

/** 좌우로 밀어 넘기기 — 두 손가락(핀치)은 브라우저 확대에 맡긴다 */
function useSwipe(onPrev: () => void, onNext: () => void, enabled: boolean) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      start.current = enabled && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) (dx > 0 ? onPrev : onNext)();
    },
  };
}

/** 사진 한 장 + 좌우 넘김 화살표. 한 장 보기와 비교 보기의 각 칸이 같이 쓴다 — 사진이 바뀌면 key 로 새로 그려 확대가 풀린다 */
function Stage({
  photo,
  hasMany,
  onPrev,
  onNext,
}: {
  photo: ViewerPhoto | undefined;
  hasMany: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [zoom, setZoom] = useState(false);
  const swipe = useSwipe(onPrev, onNext, hasMany && !zoom);

  if (!photo) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-white/60">
        아직 올린 사진이 없습니다
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0" {...swipe}>
      <div className={`absolute inset-0 ${zoom ? "overflow-auto" : "flex items-center justify-center"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.src}
          alt={`${SLOT_LABEL[photo.slot]} ${photo.date}`}
          onClick={() => setZoom((z) => !z)}
          className={
            zoom ? "max-w-none w-[200%] cursor-zoom-out" : "max-w-full max-h-full object-contain cursor-zoom-in select-none"
          }
          draggable={false}
        />
      </div>
      {hasMany && !zoom && (
        <>
          <button
            type="button"
            onClick={onPrev}
            aria-label="이전 사진"
            className="absolute left-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
          >
            <Icon name="chevron_left" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="다음 사진"
            className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
          >
            <Icon name="chevron_right" />
          </button>
        </>
      )}
    </div>
  );
}

/** 비교 보기의 한 칸 — 분해 전 또는 분해 후 사진만 따로 넘긴다 */
function ComparePane({ slot, photos, startKey }: { slot: "before" | "after"; photos: ViewerPhoto[]; startKey?: string }) {
  const [i, setI] = useState(() => Math.max(0, photos.findIndex((p) => p.key === startKey)));
  const n = photos.length;
  const photo = photos[i];
  return (
    <div className="flex flex-col min-h-0 min-w-0 bg-black/30 rounded-xl overflow-hidden">
      <div className={`px-3 py-2 text-sm font-bold border-l-4 ${SLOT_BORDER[slot]}`}>
        {SLOT_LABEL[slot]}
        {photo && (
          <span className="ml-2 font-normal text-white/70">
            {photo.date} · {i + 1}/{n}
          </span>
        )}
      </div>
      <Stage
        key={photo?.key}
        photo={photo}
        hasMany={n > 1}
        onPrev={() => setI((i - 1 + n) % n)}
        onNext={() => setI((i + 1) % n)}
      />
    </div>
  );
}

export default function PhotoViewer({
  photos,
  startKey,
  startCompare = false,
  onClose,
}: {
  /** 분해 전 → 분해 후, 각각 날짜 순으로 정렬된 목록 */
  photos: ViewerPhoto[];
  startKey?: string;
  startCompare?: boolean;
  onClose: () => void;
}) {
  const [compare, setCompare] = useState(startCompare);
  const [i, setI] = useState(() => Math.max(0, photos.findIndex((p) => p.key === startKey)));
  const n = photos.length;
  const cur = photos[Math.min(i, n - 1)];
  const prev = () => setI((i - 1 + n) % n);
  const next = () => setI((i + 1) % n);

  useEffect(() => {
    if (compare || n < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + n) % n);
      if (e.key === "ArrowRight") setI((x) => (x + 1) % n);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [compare, n]);

  const before = photos.filter((p) => p.slot === "before");
  const after = photos.filter((p) => p.slot === "after");

  return (
    <Dialog onClose={onClose} label="사진 크게 보기" size="viewer" sheet={false} top className="overflow-hidden">
      <div className="h-full flex flex-col bg-neutral-950 text-white">
        <div className="flex items-center justify-between gap-2 px-3 py-2 shrink-0">
          <div className="min-w-0 text-sm">
            {compare ? (
              <span className="font-bold">분해 전 · 후 비교</span>
            ) : (
              cur && (
                <>
                  <span className="font-bold">{SLOT_LABEL[cur.slot]}</span>
                  <span className="ml-2 text-white/70">
                    {cur.date} · {i + 1}/{n}
                  </span>
                </>
              )
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setCompare((c) => !c)}
              className="h-9 px-3 rounded-full bg-white/10 hover:bg-white/20 text-sm font-semibold flex items-center gap-1"
            >
              <Icon name={compare ? "photo" : "compare"} className="text-base" />
              {compare ? "한 장씩" : "전·후 비교"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center"
            >
              <Icon name="close" />
            </button>
          </div>
        </div>

        {compare ? (
          <div className="flex-1 min-h-0 grid grid-rows-2 md:grid-rows-1 md:grid-cols-2 gap-2 p-2 pt-0">
            <ComparePane slot="before" photos={before} startKey={cur?.slot === "before" ? cur.key : undefined} />
            <ComparePane slot="after" photos={after} startKey={cur?.slot === "after" ? cur.key : undefined} />
          </div>
        ) : (
          <>
            <Stage key={cur?.key} photo={cur} hasMany={n > 1} onPrev={prev} onNext={next} />
            {n > 1 && (
              <div className="shrink-0 flex gap-1.5 overflow-x-auto px-3 py-2">
                {photos.map((p, j) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setI(j)}
                    title={`${SLOT_LABEL[p.slot]} ${p.date}`}
                    className={`relative shrink-0 w-16 h-12 rounded-md overflow-hidden border-2 ${SLOT_BORDER[p.slot]} ${
                      j === i ? "opacity-100 ring-2 ring-white" : "opacity-50 hover:opacity-80"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt="" loading="lazy" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[10px] leading-4 text-center">
                      {shortDate(p.date)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
