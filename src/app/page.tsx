import Link from "next/link";
import { Icon } from "@/shared/components/ui";
import { NAV_GROUPS } from "@/shared/lib/nav";
import HomeDashboard from "@/modules/home/components/HomeDashboard";

/* 챕터 왼쪽 세로 바 색 — 모바일 홈 카드는 아이콘 없이 이 선 하나로만 챕터를 구분한다 */
const ACCENT_BAR = {
  primary: "bg-primary",
  tertiary: "bg-tertiary",
} as const;

/**
 * 모바일 홈 카드 전용 한 줄 요약(개조식) — nav.ts 의 group.desc(서술형 문장,
 * 데스크톱 카드가 그대로 씀)는 안 건드리고 여기서만 짧게 줄인다.
 */
const MOBILE_SUMMARY: Record<(typeof NAV_GROUPS)[number]["key"], string> = {
  equipment: "설비 마스터 기반 오버홀 관리",
  manual: "매뉴얼 조회 · 작성",
  failure: "고장보고서 조회 · 작성",
  status: "현황 조회 · 등록",
};

/**
 * 첫 화면 전용 표기 — 사이드바·하단탭·헤더는 "설비관리"처럼 붙여 쓰지만, 첫
 * 화면의 큰 챕터 이름은 "설비 관리"처럼 띄어 써야 읽기 편하다는 요청으로 여기서만
 * 따로 둔다. nav.ts 의 label(다른 화면들이 쓰는 값)은 건드리지 않는다.
 */
const HOME_LABEL: Record<(typeof NAV_GROUPS)[number]["key"], string> = {
  equipment: "설비 관리",
  manual: "매뉴얼 관리",
  failure: "고장 관리",
  status: "현황 관리",
};

export default async function HomePage() {
  return (
    <>
      {/*
        모바일 첫 화면 — 데스크톱의 "중앙 허브" 카드 목록 대신, 로고 + 타이틀을
        가운데 크게 놓고 세 챕터를 깔끔한 세로 목록 하나로 둔다. 아이콘은 하단탭과
        같은 이유로 없앤다: 챕터가 셋뿐이라 글자만으로도 더 또렷하다.
        min-h 로 전체를 세로 가운데 두는 이유: 콘텐츠가 로고+타이틀+카드 3장뿐이라
        위쪽에 그냥 쌓아 두면 아래쪽이 텅 비어 화면 위로 쏠려 보인다.
      */}
      <div className="md:hidden flex flex-col items-center justify-center gap-10 min-h-[75dvh] text-center">
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- public/ 정적 파일이라 최적화 대상이 아니다 */}
          <img src="/pims-icon.png" alt="PIMS" width={239} height={240} className="h-24 w-auto" />
          <h1 className="mt-4 text-2xl font-black text-on-surface tracking-tight">
            플랜트 지능형 관리시스템
          </h1>
          <p className="mt-1 text-xs font-semibold text-on-surface-variant tracking-wide">
            Plant Inteligence Management System
          </p>
        </div>

        <div className="w-full flex flex-col gap-5">
          {NAV_GROUPS.map((group) => (
            <Link
              key={group.key}
              href={group.root}
              className="glass-card rounded-xl flex items-center gap-4 p-4 overflow-hidden"
            >
              <span className={`w-1 self-stretch rounded-full shrink-0 ${ACCENT_BAR[group.accent]}`} />
              <span className="flex-1 min-w-0 text-left">
                <span className="block text-title-sm font-bold text-on-surface">
                  {HOME_LABEL[group.key]}
                </span>
                <span className="block text-xs text-on-surface-variant mt-0.5 truncate">
                  {MOBILE_SUMMARY[group.key]}
                </span>
              </span>
              <Icon name="chevron_right" className="text-xl text-on-surface-variant shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* 데스크톱 첫 화면 — 선택한 지사의 설비관리 현황 대시보드(HomeDashboard) */}
      <div className="hidden md:block">
        <HomeDashboard />
      </div>
    </>
  );
}
