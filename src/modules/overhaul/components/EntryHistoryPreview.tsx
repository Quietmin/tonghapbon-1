"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/shared/components/ui";
import type { OverhaulEntry, OverhaulTask } from "../lib/repo";

/**
 * 작업 목록에서 행에 마우스를 올리면 그 작업의 정비 이력을 먼저 보여 주는 미리보기.
 *
 * 실적 입력 팝업을 열기 전에 "최근에 어떤 실적이 올라갔는지"만 훑어보려는 용도라, 조금 머문 뒤
 * (HOVER_DELAY) 마우스 옆에 최근 5건을 띄운다. 눌러서 팝업을 열면 사라진다. 마우스가 없는 폰에서는
 * 뜨지 않는다. 데이터는 실적 입력과 같은 /api/overhaul/entries 를 쓰고, 잠깐(TTL) 기억해 같은 행을
 * 다시 올려도 바로 뜬다 — 실적을 저장·삭제하면 invalidateEntryHistory 로 비운다.
 */

const HOVER_DELAY = 350;
const CACHE_TTL = 20_000;
const SHOW_COUNT = 5;
const WIDTH = 340;

interface Loaded {
  task: OverhaulTask;
  entries: OverhaulEntry[];
  at: number;
}

const cache = new Map<string, Loaded>();

/** 실적을 저장·삭제한 뒤 불러, 미리보기가 옛 이력을 보이지 않게 한다 */
export function invalidateEntryHistory(taskId?: string) {
  if (taskId) cache.delete(taskId);
  else cache.clear();
}

async function loadHistory(taskId: string): Promise<Loaded | null> {
  const hit = cache.get(taskId);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit;
  const json = await (await fetch(`/api/overhaul/entries?taskId=${taskId}`)).json();
  if (!json.ok) return null;
  const loaded: Loaded = { task: json.task, entries: json.entries, at: Date.now() };
  cache.set(taskId, loaded);
  return loaded;
}

/** 날짜 오름차순으로 훑어 그날 증가분(직전 누적과의 차이)을 구한 뒤 최근 순으로 */
function recentWithDelta(entries: OverhaulEntry[]) {
  const asc = [...entries].sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1));
  let prior = 0;
  const withDelta = asc.map((e) => {
    const doneToday = Math.max(0, e.done_qty - prior);
    prior = e.done_qty;
    return { ...e, doneToday };
  });
  return withDelta.reverse().slice(0, SHOW_COUNT);
}

function PreviewCard({ taskId, x, y }: { taskId: string; x: number; y: number }) {
  const [data, setData] = useState<Loaded | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    void loadHistory(taskId)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [taskId]);

  // 마우스 오른쪽 아래에 놓되 화면 밖으로 나가면 왼쪽·위로 접는다
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const left = x + 16 + WIDTH > vw - 8 ? Math.max(8, x - 16 - WIDTH) : x + 16;
  const top = Math.min(y + 12, vh - 300);

  const rows = data ? recentWithDelta(data.entries) : [];
  const unit = data?.task.unit ?? "";
  const plan = data?.task.plan_qty ?? 0;

  return createPortal(
    <div
      // 마우스를 따라다니는 안내라 눌리지 않게 한다(행의 클릭·호버를 가리지 않도록)
      style={{ left, top, width: WIDTH }}
      className="pointer-events-none fixed z-[250] rounded-xl border border-border-subtle bg-surface-container-lowest p-4 shadow-xl"
      role="tooltip"
    >
      <p className="text-xs font-bold text-primary flex items-center gap-1.5 mb-2">
        <Icon name="history" className="text-sm" /> 정비 이력
        {data && <span className="font-normal text-on-surface-variant">· 최근 {rows.length}건</span>}
      </p>

      {data === undefined && <p className="text-sm text-on-surface-variant py-2">불러오는 중…</p>}
      {data === null && <p className="text-sm text-on-surface-variant py-2">이력을 불러오지 못했습니다.</p>}
      {data && rows.length === 0 && (
        <p className="text-sm text-on-surface-variant py-2">아직 저장된 실적 이력이 없습니다.</p>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {rows.map((e) => {
            const rate = plan > 0 ? Math.min(100, Math.round((e.done_qty / plan) * 1000) / 10) : 0;
            const delayed = Boolean(e.delay_reason && e.delay_reason !== "지연 없음");
            return (
              <li key={e.entry_date} className="text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono-data font-bold text-on-surface">{e.entry_date}</span>
                  {e.doneToday > 0 && (
                    <span className="font-bold text-primary whitespace-nowrap">
                      +{e.doneToday} {unit}
                    </span>
                  )}
                  <span className="text-on-surface-variant whitespace-nowrap">누적 {rate}%</span>
                  {delayed && (
                    <span className="ml-auto px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-status-error/10 text-status-error-text">
                      지연
                    </span>
                  )}
                  {e.photos.length > 0 && (
                    <span className="ml-auto text-on-surface-variant flex items-center gap-0.5">
                      <Icon name="photo_library" className="text-sm" />
                      {e.photos.length}
                    </span>
                  )}
                </div>
                {e.work_detail && (
                  <p className="mt-0.5 text-on-surface line-clamp-2 break-keep">{e.work_detail}</p>
                )}
                {delayed && <p className="text-error break-keep">지연사유: {e.delay_reason}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 pt-2 border-t border-border-subtle text-[11px] text-on-surface-variant">
        눌러서 실적 입력
      </p>
    </div>,
    document.body,
  );
}

/**
 * 행에 붙여 쓴다.
 *   const { bind, preview, hide } = useEntryHistoryHover();
 *   <tr {...bind(task.id)} onClick={() => { hide(); open(task.id); }}>
 *   … 컴포넌트 어딘가에 {preview}
 */
export function useEntryHistoryHover() {
  const [shown, setShown] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pos = useRef({ x: 0, y: 0 });

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const hide = useCallback(() => {
    clear();
    setShown(null);
  }, [clear]);

  useEffect(() => clear, [clear]);

  const bind = useCallback(
    (taskId: string) => ({
      onMouseEnter: (e: MouseEvent) => {
        // 터치 기기에서 흉내 내 불리는 호버는 무시한다
        if (typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches) return;
        pos.current = { x: e.clientX, y: e.clientY };
        clear();
        timer.current = setTimeout(() => setShown({ taskId, ...pos.current }), HOVER_DELAY);
      },
      // 머무는 동안 마우스가 조금 움직여도 따라가지는 않고, 뜨기 직전 위치만 갱신한다
      onMouseMove: (e: MouseEvent) => {
        pos.current = { x: e.clientX, y: e.clientY };
      },
      onMouseLeave: hide,
    }),
    [clear, hide],
  );

  const preview = shown ? <PreviewCard taskId={shown.taskId} x={shown.x} y={shown.y} /> : null;

  return { bind, preview, hide };
}
