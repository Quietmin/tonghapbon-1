import Link from "next/link";
import { Card, Icon } from "@/shared/components/ui";

/**
 * 문서 자동생성 — 문서 종류 선택.
 * 원본: legacy Photo-Report(뚝 DOC)의 모드 선택 화면(modeSelectScreen).
 * 원본은 한 화면에서 appMode 를 바꿨지만, 통합앱에서는 종류별 경로로 나눈다
 * (사이드바에서 바로 진입할 수 있고, 새로고침해도 상태가 유지된다).
 */
const CHOICES = [
  {
    href: "/docgen/photo-report",
    icon: "photo_library",
    title: "사진대장 만들기",
    desc: "현장 사진과 설명을 정리하는 보고서",
  },
  {
    href: "/docgen/manual",
    icon: "menu_book",
    title: "매뉴얼 만들기",
    desc: "사진마다 순번을 매겨 절차를 안내하는 문서",
  },
  {
    href: "/docgen/fault-report",
    icon: "warning",
    title: "고장 보고서 만들기",
    desc: "고장 요약과 관련 사진을 정리하는 핫라인 메모",
  },
];

export default function DocgenHomePage() {
  return (
    <>
      <section className="pt-2">
        <h1 className="text-display-lg text-on-surface">문서 자동생성</h1>
        <p className="text-body-md text-on-surface-variant mt-2">
          사진과 설명을 넣으면 A4 규격 문서를 자동으로 구성해 PDF로 출력합니다. 만들 문서 종류를
          고르세요.
        </p>
      </section>

      <section className="grid gap-gutter md:grid-cols-3">
        {CHOICES.map((c) => (
          <Link key={c.href} href={c.href} className="block">
            <Card className="p-card-padding flex flex-col h-full">
              <div className="w-12 h-12 rounded-2xl bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center mb-4">
                <Icon name={c.icon} className="text-2xl" />
              </div>
              <h2 className="text-headline-md text-on-surface">{c.title}</h2>
              <p className="text-sm text-on-surface-variant mt-2 flex-1">{c.desc}</p>
              <span className="inline-flex items-center gap-1 text-sm font-bold text-primary mt-4">
                시작하기
                <Icon name="arrow_forward" className="text-base" />
              </span>
            </Card>
          </Link>
        ))}
      </section>

      <section>
        <Link href="/docgen/archive" className="block">
          <Card className="p-card-padding flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary text-on-primary flex items-center justify-center shrink-0">
              <Icon name="inventory_2" className="text-2xl" />
            </div>
            <div className="flex-1">
              <h2 className="text-title-sm text-on-surface">보관함 조회</h2>
              <p className="text-sm text-on-surface-variant mt-1">
                출력한 PDF가 자동 저장됩니다. 로그인하면 지사·연도·종류별로 지난 문서를 찾아볼 수
                있습니다.
              </p>
            </div>
            <Icon name="chevron_right" className="text-on-surface-variant" />
          </Card>
        </Link>
      </section>
    </>
  );
}
