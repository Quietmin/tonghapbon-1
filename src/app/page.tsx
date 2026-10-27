import Link from "next/link";
import { ACCENT_STYLE, Card, Icon } from "@/shared/components/ui";
import { HIDDEN_ROUTES, NAV_GROUPS } from "@/shared/lib/nav";

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
};

export default function HomePage() {
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
                <span className="block text-title-sm font-bold text-on-surface">{group.label}</span>
                <span className="block text-xs text-on-surface-variant mt-0.5 truncate">
                  {MOBILE_SUMMARY[group.key]}
                </span>
              </span>
              <Icon name="chevron_right" className="text-xl text-on-surface-variant shrink-0" />
            </Link>
          ))}
        </div>
      </div>

      {/* 데스크톱 첫 화면 — 챕터 카드 + 하위 메뉴 알약 목록이 있는 기존 "중앙 허브" */}
      <div className="hidden md:block">
        <section className="pt-2">
          <h1 className="text-display-lg text-on-surface">중앙 허브</h1>
          <p className="text-body-md text-on-surface-variant mt-2">
            설비관리 · 고장관리 · 매뉴얼관리를 하나의 설비 마스터 위에서 함께 봅니다. 정비 챗봇은 어느
            화면에서나 오른쪽 아래에 떠 있습니다.
          </p>
        </section>

        <section className="grid gap-gutter md:grid-cols-2 xl:grid-cols-3">
          {NAV_GROUPS.map((group) => (
            <Card key={group.key} className="p-card-padding flex flex-col">
              {/* 챕터 색 — 사이드바·각 화면 제목과 같은 색이라 처음 화면부터 같게 읽힌다 */}
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${
                  ACCENT_STYLE[group.accent].soft
                }`}
              >
                <Icon name={group.icon} className="text-2xl" />
              </div>
              <Link href={group.root}>
                <h2
                  className={`text-headline-md text-on-surface transition-colors ${
                    group.accent === "tertiary" ? "hover:text-tertiary" : "hover:text-primary"
                  }`}
                >
                  {group.label}
                </h2>
              </Link>
              <p className="text-sm text-on-surface-variant mt-2 flex-1">{group.desc}</p>
              <div className="flex flex-wrap gap-1.5 mt-4">
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-2.5 py-1 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-xs font-bold text-on-surface-variant transition-colors ${
                      item.desktopOnly ? "hidden md:inline-block" : ""
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </section>

        {/*
          메뉴에서 감춘 화면들. 완전히 지우지 않았으므로 여기 작은 줄로만 남겨
          URL 을 외우지 않고도 들어갈 수 있게 한다.
        */}
        <section className="pt-2">
          <p className="text-xs font-bold text-on-surface-variant mb-2">그 외 화면</p>
          <div className="flex flex-wrap gap-1.5">
            {HIDDEN_ROUTES.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border-subtle hover:bg-surface-container-high text-xs text-on-surface-variant transition-colors"
              >
                <Icon name={r.icon} className="text-sm" />
                {r.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
