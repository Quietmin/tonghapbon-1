"use client";

import type { KeyboardEvent } from "react";
import type { BranchOverviewRow } from "@/modules/equipment/lib/overviewRepo";
import {
  BRANCH_COORDS,
  CANVAS,
  CAPITAL_VIEW,
  NATIONAL_VIEW,
  capitalPath,
  outlinePath,
  project,
  provincePath,
  shortName,
} from "@/modules/equipment/lib/koreaMap";

const FONT = 12;
const PILL_H = 19;
/** 핀 머리 중심이 끝점(지사 위치)보다 위로 떨어진 높이 */
const PIN_LIFT = 13;
const PIN_PATH = "M0,0 C-3,-5 -7,-8.5 -7,-13 A7,7 0 0 1 7,-13 C7,-8.5 3,-5 0,0 Z";

/** 핀·이름표가 찍힐 그림 — 수도권 지사는 확대 그림, 나머지는 전국 지도 */
function viewOf(branch: string) {
  return BRANCH_COORDS[branch]?.capital ? CAPITAL_VIEW : NATIONAL_VIEW;
}

interface VisualProps {
  branch: string;
  hasData: boolean;
  active: boolean;
  hot: boolean;
}

/**
 * 핀 + 이름표의 모양만 그린다(누르기·마우스 처리는 Marker). 마우스를 올린 지사는 확실히 눈에 띈다:
 * 핀이 커지고 옅은 후광이 생기며, 이름표가 남색 바탕의 흰 글자로 바뀐다.
 */
function PinVisual({ branch, hasData, active, hot }: VisualProps) {
  const meta = BRANCH_COORDS[branch];
  const [x, y] = project(viewOf(branch), meta.lonlat);
  const text = shortName(branch);
  const w = text.length * FONT + 14;
  const { dx, dy, anchor } = meta.label;
  const left = anchor === "start" ? x + dx : anchor === "end" ? x + dx - w : x + dx - w / 2;
  const top = y - PIN_LIFT + dy - PILL_H / 2;
  const scale = hot ? 1.35 : active ? 1.15 : 1;

  return (
    <g>
      {/* 이름표 — 보통은 흰 알약, 올리면 남색 */}
      <rect
        x={left}
        y={top}
        width={w}
        height={PILL_H}
        rx={PILL_H / 2}
        className={
          hot
            ? "fill-primary stroke-primary"
            : active
              ? "fill-surface-container-lowest stroke-primary"
              : "fill-surface-container-lowest stroke-primary/40"
        }
        strokeWidth={hot ? 2 : active ? 1.8 : 1}
      />
      <text
        x={left + w / 2}
        y={top + PILL_H / 2 + 4.2}
        textAnchor="middle"
        fontSize={FONT}
        className={`${hot ? "fill-on-primary" : "fill-on-surface"} ${hot || active ? "font-bold" : "font-medium"}`}
      >
        {text}
      </text>

      {/* 핀 — 설비 데이터가 있으면 남색, 없으면 회색 */}
      <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale})`}>
        {hot && <circle cy={-PIN_LIFT} r={15} className="fill-primary" opacity={0.2} />}
        <path
          d={PIN_PATH}
          className={hasData ? "fill-primary stroke-surface-container-lowest" : "fill-outline stroke-surface-container-lowest"}
          strokeWidth={1.3}
        />
        <circle cy={-PIN_LIFT} r={2.7} className="fill-surface-container-lowest" />
      </g>
    </g>
  );
}

interface MarkerProps {
  branch: string;
  row: BranchOverviewRow | undefined;
  current: string | null;
  hovered: string | null;
  busy: boolean;
  onHover: (branch: string | null) => void;
  onPick: (branch: string) => void;
}

/**
 * 지도의 핀 하나(눌러서 지사 선택). BranchMap 밖에 둔다 — 안에 정의하면 마우스를 올릴 때마다
 * 다른 컴포넌트로 취급돼 핀이 새로 만들어지고 키보드 포커스가 풀려 버린다.
 * 올린 지사가 아닌 핀은 흐려져 대비가 생긴다.
 */
function Marker({ branch, row, current, hovered, busy, onHover, onPick }: MarkerProps) {
  if (!BRANCH_COORDS[branch] || !row) return null;
  const hasData = row.equipmentCount > 0 || row.latestProject !== null;
  const active = branch === current;
  const hot = branch === hovered;
  const dim = hovered !== null && !hot;

  const pick = () => !busy && onPick(branch);
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick();
    }
  };

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${branch}${hasData ? "" : " (등록된 데이터 없음)"}${active ? " — 보는 중" : ""}`}
      onClick={pick}
      onKeyDown={onKey}
      onMouseEnter={() => onHover(branch)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(branch)}
      onBlur={() => onHover(null)}
      opacity={dim ? 0.35 : 1}
      className="cursor-pointer outline-none transition-opacity"
    >
      <PinVisual branch={branch} hasData={hasData} active={active} hot={hot} />
    </g>
  );
}

/**
 * 지사 선택용 약식 지도 — 전국 지도 한 장에 모든 지사가 보인다. 외부 지도 없이 SVG 로 그린다(koreaMap.ts 참고).
 *
 * 지사가 몰린 수도권은 왼쪽 위에 확대해 보여 주고 전국 지도의 수도권 영역과 띠로 잇는다(전국 지도의
 * 수도권에는 작은 점만). 핀을 누르면 그 지사가 선택되고, 왼쪽 네모 박스와 같은 hovered 상태를 공유해
 * 마우스를 올린 지사가 박스와 지도에서 함께 강조된다. 위치는 개략도라 정확한 주소가 아니다.
 */
export default function BranchMap({
  items,
  current,
  hovered,
  busy,
  onHover,
  onPick,
}: {
  items: BranchOverviewRow[];
  current: string | null;
  hovered: string | null;
  busy: boolean;
  onHover: (branch: string | null) => void;
  onPick: (branch: string) => void;
}) {
  const byBranch = new Map(items.map((r) => [r.branch, r]));
  const hasData = (b: string) => {
    const r = byBranch.get(b);
    return !!r && (r.equipmentCount > 0 || r.latestProject !== null);
  };
  const names = Object.keys(BRANCH_COORDS);

  // 확대 그림과 전국 지도의 수도권 영역을 잇는 띠의 네 모서리
  const [insetRight, insetTop] = project(CAPITAL_VIEW, [127.75, 38.1]);
  const [, insetBottom] = project(CAPITAL_VIEW, [127.75, 36.95]);
  const [mapRight, mapTop] = project(NATIONAL_VIEW, [127.5, 38.05]);
  const [, mapBottom] = project(NATIONAL_VIEW, [127.5, 36.97]);

  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`}
        className="w-full max-w-[700px] mx-auto max-md:pointer-events-none"
        role="group"
        aria-label="지사 위치"
      >
        <defs>
          <clipPath id="kmap-korea">
            <path d={outlinePath(NATIONAL_VIEW)} />
          </clipPath>
        </defs>

        {/* 확대 그림 ↔ 수도권 영역을 잇는 띠 */}
        <polygon
          points={`${insetRight},${insetTop} ${mapRight},${mapTop} ${mapRight},${mapBottom} ${insetRight},${insetBottom}`}
          className="fill-primary/12 stroke-primary/30"
          strokeDasharray="4 3"
        />

        {/* 전국 지도 — 회색 바탕에 시도 경계(흰 선), 수도권은 색을 달리 */}
        <path
          d={outlinePath(NATIONAL_VIEW)}
          className="fill-outline-variant stroke-surface-container-lowest"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <g clipPath="url(#kmap-korea)">
          <path
            d={provincePath(NATIONAL_VIEW)}
            fill="none"
            className="stroke-surface-container-lowest"
            strokeWidth={1.4}
          />
        </g>
        <path
          d={capitalPath(NATIONAL_VIEW, 1)}
          className="fill-primary/55 stroke-surface-container-lowest"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />

        {/* 수도권 확대 */}
        <path
          d={capitalPath(CAPITAL_VIEW, 2)}
          className="fill-primary/30 stroke-primary/60"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* 전국 지도의 수도권 지사는 작은 점만 */}
        {names
          .filter((b) => BRANCH_COORDS[b].capital)
          .map((b) => {
            const [x, y] = project(NATIONAL_VIEW, BRANCH_COORDS[b].lonlat);
            const hot = b === hovered;
            return (
              <circle
                key={b}
                cx={x}
                cy={y}
                r={hot ? 4.5 : 2.4}
                className={hot ? "fill-primary stroke-surface-container-lowest" : hasData(b) ? "fill-primary" : "fill-outline"}
                strokeWidth={hot ? 1.5 : 0}
                pointerEvents="none"
              />
            );
          })}

        {names.map((b) => (
          <Marker
            key={b}
            branch={b}
            row={byBranch.get(b)}
            current={current}
            hovered={hovered}
            busy={busy}
            onHover={onHover}
            onPick={onPick}
          />
        ))}

        {/* 올린 지사는 이웃 핀·이름표에 가려지지 않도록 맨 위에 한 번 더 그린다(누르기는 아래 핀이 받는다) */}
        {hovered && byBranch.get(hovered) && BRANCH_COORDS[hovered] && (
          <g pointerEvents="none" aria-hidden>
            <PinVisual branch={hovered} hasData={hasData(hovered)} active={hovered === current} hot />
          </g>
        )}
      </svg>

      <p className="text-[12px] text-on-surface-variant text-center">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary align-middle mr-1" /> 설비 등록됨
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-outline align-middle ml-3 mr-1" />{" "}
        데이터 없음 · 위치는 개략도
      </p>
    </div>
  );
}
