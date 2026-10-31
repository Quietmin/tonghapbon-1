"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/shared/components/ui";
import { compressImage, formatBytes } from "@/modules/overhaul/lib/imageCompress";
import { MAX_ISSUE_PHOTOS } from "../lib/constants";
import { faultReportHref } from "../lib/faultLink";
import type { StatusIssueRow } from "../lib/repo";

/** 등록 화면에서 고른 사진 한 장(아직 저장 전 — 브라우저에서 줄인 data URL) */
export interface PickedPhoto {
  key: string;
  dataUrl: string;
  /** "4.2MB → 310KB" */
  note: string;
}

/** 현황 사진은 한 장씩 가볍게 — 현장 폰 사진을 줄여(긴 변 1400px) 한 장에 보통 200~400KB 로 만든다 */
const COMPRESS = { maxEdge: 1400, quality: 0.8, targetBytes: 600_000, hardLimitBytes: 1_200_000 };
/** 한 번에 보낼 사진 합계(문자 수) — 서버 상한(3.8M)보다 조금 낮게 */
export const MAX_TOTAL_PHOTO_CHARS = 3_500_000;

/**
 * 현황 등록 화면의 사진 첨부 — 고르면 브라우저에서 바로 줄이고 썸네일로 보여 준다. 폰에서는 사진 추가를
 * 누르면 카메라나 앨범을 고를 수 있다. 사진은 선택 사항이다(없어도 등록된다).
 */
export function PhotoPicker({
  photos,
  onChange,
  onError,
}: {
  photos: PickedPhoto[];
  onChange: (next: PickedPhoto[]) => void;
  onError: (msg: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState<string | null>(null);

  async function pick(files: File[]) {
    onError(null);
    const room = MAX_ISSUE_PHOTOS - photos.length;
    if (room <= 0) {
      onError(`사진은 최대 ${MAX_ISSUE_PHOTOS}장까지 넣을 수 있습니다.`);
      return;
    }
    if (files.length > room) onError(`사진은 최대 ${MAX_ISSUE_PHOTOS}장까지라 ${room}장만 넣었습니다.`);

    const added: PickedPhoto[] = [];
    let total = photos.reduce((n, p) => n + p.dataUrl.length, 0);
    const take = files.slice(0, room);
    for (let i = 0; i < take.length; i++) {
      setWorking(take.length > 1 ? `사진 줄이는 중… (${i + 1}/${take.length})` : "사진 줄이는 중…");
      try {
        const out = await compressImage(take[i], COMPRESS);
        if (total + out.dataUrl.length > MAX_TOTAL_PHOTO_CHARS) {
          onError("사진 용량이 너무 큽니다. 몇 장을 빼고 올려 주세요.");
          break;
        }
        total += out.dataUrl.length;
        added.push({
          key: `n${Date.now()}-${i}`,
          dataUrl: out.dataUrl,
          note: `${formatBytes(out.originalBytes)} → ${formatBytes(out.bytes)}`,
        });
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
        break;
      }
    }
    setWorking(null);
    if (added.length) onChange([...photos, ...added]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-on-surface-variant">
          사진 <span className="font-normal">(선택 · 현장 상태를 찍어 올리면 담당자가 미리 볼 수 있어요)</span>
        </span>
        <span className="text-xs text-on-surface-variant">
          {photos.length}/{MAX_ISSUE_PHOTOS}장
        </span>
      </div>

      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void pick(files);
        }}
      />

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {photos.map((p) => (
          <div key={p.key} className="relative aspect-[4/3] rounded-lg overflow-hidden bg-surface-container-low">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.dataUrl} alt="첨부 사진" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((x) => x.key !== p.key))}
              aria-label="이 사진 빼기"
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-error transition-colors"
            >
              <Icon name="close" className="text-sm" />
            </button>
            <span className="absolute bottom-0 left-0 right-0 bg-black/55 text-white text-[10px] text-center py-0.5">
              {p.note}
            </span>
          </div>
        ))}

        {photos.length < MAX_ISSUE_PHOTOS && (
          <button
            type="button"
            disabled={!!working}
            onClick={() => ref.current?.click()}
            className="aspect-[4/3] rounded-lg border-2 border-dashed border-outline-variant bg-surface-container-low hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-0.5 disabled:opacity-60"
          >
            <Icon name={working ? "hourglass_top" : "add_a_photo"} className="text-xl text-on-surface-variant" />
            <span className="text-[11px] font-semibold text-on-surface-variant px-1 text-center leading-tight">
              {working ?? "사진 추가"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 현황 팝업의 사진 — 열릴 때 그 이슈의 사진 id 를 불러와 썸네일로 보여 준다. 사진이 없으면 아무것도 그리지 않는다.
 * 누르면 원본(줄인 사진)을 새 탭에서 크게 본다.
 */
export function IssuePhotos({ issueId }: { issueId: string }) {
  const [ids, setIds] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const json = await (await fetch(`/api/status/issues/${issueId}/photos`)).json();
        if (alive && json.ok) setIds(json.ids as number[]);
      } catch {
        /* 사진을 못 읽어도 팝업은 그대로 쓴다 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [issueId]);

  if (ids.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold text-on-surface-variant flex items-center gap-1">
        <Icon name="photo_library" className="text-sm" /> 현장 사진 {ids.length}장
      </span>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {ids.map((id) => (
          <a
            key={id}
            href={`/api/status/photos/one?id=${id}`}
            target="_blank"
            rel="noreferrer"
            className="block aspect-[4/3] rounded-lg overflow-hidden bg-surface-container-low hover:opacity-90"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/status/photos/one?id=${id}`}
              alt="현장 사진"
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </a>
        ))}
      </div>
    </div>
  );
}

/** 현황 팝업의 "고장보고서 등록" 바로가기 — 설비·내용·지사·발생일시가 채워진 채 등록 화면이 열린다 */
export function FaultReportLink({ row }: { row: StatusIssueRow }) {
  return (
    <Link
      href={faultReportHref(row)}
      className="px-4 py-2.5 rounded-sm font-bold text-sm text-primary hover:bg-surface-container-high inline-flex items-center gap-1.5"
    >
      <Icon name="edit_note" className="text-base" />
      고장보고서 등록
    </Link>
  );
}
