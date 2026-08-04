"use client";

/**
 * 출력물 머리(표제부) — legacy Photo-Report(뚝 DOC) 의 buildManualHeader /
 * buildFaultPageElement / buildPageElement 머리 부분을 그대로 옮긴 것.
 *
 * 모드마다 머리 모양이 다르다:
 *   사진대장   — 오른쪽 위 배너 + 가운데 제목
 *   매뉴얼     — 왼쪽 위 공사 로고가 들어간 표제부 표 (문서종류·분야·개정번호·페이지)
 *   고장 보고서 — 왼쪽 위 공사 로고 + 오른쪽 배너, 그 아래 괘선으로 감싼 제목
 *
 * next/image 를 쓰지 않는다 — html2canvas 가 그려야 하는데 srcset·lazy 로딩이 붙으면
 * 캡처 시점에 아직 비어 있을 수 있다. 정적 규격 이미지라 최적화 이득도 없다.
 */

/** "업무 매뉴얼" -> "업 무 매 뉴 얼" — 표제부의 자간 벌린 문서종류 표기 (원본과 동일) */
export function spaceOutChars(text: string): string {
  return String(text || "")
    .replace(/\s+/g, "")
    .split("")
    .join(" ");
}

/** 사진대장: 오른쪽 위 "깨끗한 에너지로 세상을 따뜻하게" 배너 한 줄 */
export function PageBanner() {
  return (
    <div className="page-banner-row">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="page-banner" src="/banner.png" alt="" />
    </div>
  );
}

export interface ManualHeaderProps {
  /** 매뉴얼 종류 — "업무 매뉴얼" 처럼 자간을 벌려 크게 찍는다 */
  docType: string;
  branch: string;
  field: string;
  revision: string;
  title: string;
  pageNo: number;
  pageCount: number;
}

/**
 * 매뉴얼 표제부. 원본 buildManualHeader 의 3행 표를 그대로 옮겼다.
 *   1행: [로고(3행 병합)] [문서종류(2행 병합)] [분야(2칸 병합)]
 *   2행:                                       [개정번호] [값]
 *   3행:                  [제목]                [페이지]  [n/N]
 */
export function ManualHeader({
  docType,
  branch,
  field,
  revision,
  title,
  pageNo,
  pageCount,
}: ManualHeaderProps) {
  return (
    <table className="manual-header">
      <tbody>
        <tr>
          <td className="mh-logo" rowSpan={3}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/manual-logo.gif" alt="" />
            <div className="mh-org">한국지역난방공사</div>
            {branch && <div className="mh-branch">{branch}</div>}
          </td>
          <td className="mh-doctype" rowSpan={2}>
            {spaceOutChars(docType)}
          </td>
          <td className="mh-field" colSpan={2}>
            {/* 위 오른쪽 칸은 두 칸을 합쳐 "기계분야" 하나로 읽히게 한다 */}
            {field ? `${field}분야` : ""}
          </td>
        </tr>
        <tr>
          <td className="mh-label">개정번호</td>
          <td className="mh-value">{revision.trim()}</td>
        </tr>
        <tr>
          <td className="mh-title">{title || "매뉴얼"}</td>
          <td className="mh-label">페이지</td>
          <td className="mh-value">
            {pageNo}/{pageCount}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * 고장 보고서 머리: 왼쪽 공사 로고 + 오른쪽 배너, 그 아래 위아래 괘선으로 감싼 제목.
 * 첫 장뿐 아니라 이어지는 장에도 똑같이 들어간다(원본과 동일).
 */
export function FaultLetterhead({ title }: { title: string }) {
  return (
    <>
      <div className="fr-head-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="fr-head-logo" src="/manual-logo.gif" alt="" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="page-banner" src="/banner.png" alt="" />
      </div>
      <div className="fr-title-block">
        <div className="fr-title-rule" />
        <div className="fr-title">{title || "고장 보고서"}</div>
        <div className="fr-title-rule" />
      </div>
    </>
  );
}
