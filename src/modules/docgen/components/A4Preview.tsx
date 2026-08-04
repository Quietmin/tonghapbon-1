"use client";

import { forwardRef } from "react";
import { FAULT_PHOTOS_FIRST_PAGE, FAULT_PHOTOS_PER_PAGE, PHOTOS_PER_PAGE } from "../lib/constants";
import { isTextItem, type DocItem, type PhotoItem } from "../lib/types";
import { FaultLetterhead } from "./Letterhead";
import "../print.css";

/**
 * A4 세로 페이지 미리보기. 화면에 실제 mm 크기로 그리고, 그 DOM 을 그대로 PDF 로 만든다.
 * 치수·테두리·머리 모양은 원본(legacy Photo-Report) 을 print.css 로 1:1 이식했다.
 */
export function chunkPages<T>(items: T[], perPage = PHOTOS_PER_PAGE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages.length > 0 ? pages : [[]];
}

/**
 * 고장 보고서는 첫 장에 고장 요약 표가 들어가므로 그 아래로 사진이 한 줄(3장)만 들어가고,
 * 이어지는 장은 세 줄(9장)이 들어간다. (원본 computeFaultPages 와 동일)
 */
export function chunkFaultPages(items: PhotoItem[]): PhotoItem[][] {
  if (items.length === 0) return [[]];
  const pages = [items.slice(0, FAULT_PHOTOS_FIRST_PAGE)];
  for (let i = FAULT_PHOTOS_FIRST_PAGE; i < items.length; i += FAULT_PHOTOS_PER_PAGE) {
    pages.push(items.slice(i, i + FAULT_PHOTOS_PER_PAGE));
  }
  return pages;
}

interface A4PageProps {
  /** 사진대장의 가운데 큰 제목. 매뉴얼처럼 표제부가 제목을 품는 모드에서는 비운다 */
  title?: string;
  items: DocItem[];
  /** 매뉴얼 모드는 사진마다 순번을 매긴다 */
  numbered?: boolean;
  /** 이 페이지 첫 항목의 전체 순번 (numbered 일 때 배지 숫자용) */
  startIndex?: number;
  /** 페이지 맨 위 — 사진대장의 배너 줄, 매뉴얼의 표제부 표 */
  letterhead?: React.ReactNode;
}

export const A4Page = forwardRef<HTMLDivElement, A4PageProps>(function A4Page(
  { title, items, numbered = false, startIndex = 0, letterhead },
  ref,
) {
  return (
    <div ref={ref} className="a4-page">
      {letterhead}
      {title && <div className="page-title">{title}</div>}

      <div className="page-grid">
        {items.map((item, i) => (
          <div key={item.id} className="photo-set">
            {numbered && <div className="set-number-badge">{startIndex + i + 1}</div>}

            {isTextItem(item) ? (
              <div className="text-box">
                <div className="text-body">{item.body}</div>
              </div>
            ) : (
              <>
                <div className="photo-box">
                  {/* eslint-disable-next-line @next/next/no-img-element -- object URL 이라 next/image 대상이 아니고, html2canvas 가 그려야 한다 */}
                  <img
                    src={item.previewUrl ?? item.url}
                    alt=""
                    style={{
                      transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
                    }}
                  />
                </div>
                <div className="desc-box">
                  <div className="desc-text">{item.desc}</div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

interface FaultA4PageProps {
  title: string;
  /** 이 장에 들어갈 사진 (고장 보고서는 텍스트 칸을 쓰지 않는다) */
  items: PhotoItem[];
  /** 0 이면 첫 장 — 고장 요약 표가 들어간다 */
  pageIndex: number;
  /** 첫 장에 들어가는 고장 요약 표 */
  summary?: React.ReactNode;
}

/**
 * 고장 보고서 한 장. 사진대장·매뉴얼과 격자 규격이 달라(3열·62mm) 별도 컴포넌트로 둔다.
 * 원본 buildFaultPageElement 와 같은 구성이다.
 */
export const FaultA4Page = forwardRef<HTMLDivElement, FaultA4PageProps>(function FaultA4Page(
  { title, items, pageIndex, summary },
  ref,
) {
  return (
    <div ref={ref} className="a4-page">
      {/* 머리(로고·배너·제목)는 이어지는 장에도 그대로 들어간다 — 원본과 동일 */}
      <FaultLetterhead title={title} />

      {pageIndex === 0 && summary && (
        <>
          <div className="fr-heading">1. 고장 요약</div>
          {summary}
        </>
      )}

      {items.length > 0 && (
        <>
          <div className="fr-heading">
            {pageIndex === 0 ? "2. 관련 사진" : "2. 관련 사진 (계속)"}
          </div>
          <div className="fr-photo-grid">
            {items.map((item) => (
              <div key={item.id} className="fr-photo-cell">
                <div className="fr-photo-box">
                  {/* eslint-disable-next-line @next/next/no-img-element -- object URL */}
                  <img
                    src={item.previewUrl ?? item.url}
                    alt=""
                    style={{
                      transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
                    }}
                  />
                </div>
                <div className="fr-photo-cap">{item.desc}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});
