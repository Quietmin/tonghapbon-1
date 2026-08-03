import Link from "next/link";
import { Card, Icon } from "@/shared/components/ui";
import { NAV_GROUPS } from "@/shared/lib/nav";

const GROUP_DESC: Record<string, string> = {
  overhaul:
    "설계내역서 엑셀을 업로드하면 작업항목을 자동 추출하고, 물량 기준 공정률·지연 위험·입력 누락을 산정합니다.",
  failure:
    "열원설비 고장 이력을 등록·검색하고, 설비별·분야별·월별 통계를 확인합니다.",
  chatbot:
    "태그명이나 고장 증상으로 준공도서·벤더프린트를 검색해 근거 문서와 원문 발췌를 그대로 보여줍니다.",
};

export default function HomePage() {
  return (
    <>
      <section className="pt-2">
        <h1 className="text-display-lg text-on-surface">중앙 허브</h1>
        <p className="text-body-md text-on-surface-variant mt-2">
          오버홀 공정관리 · 고장이력 관리 · 정비 챗봇을 하나의 설비 마스터 위에서 함께 봅니다.
        </p>
      </section>

      <section className="grid gap-gutter md:grid-cols-3">
        {NAV_GROUPS.map((group) => (
          <Card key={group.key} className="p-card-padding flex flex-col">
            <div className="w-12 h-12 rounded-2xl bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center mb-4">
              <Icon name={group.icon} className="text-2xl" />
            </div>
            <h2 className="text-headline-md text-on-surface">{group.label}</h2>
            <p className="text-sm text-on-surface-variant mt-2 flex-1">{GROUP_DESC[group.key]}</p>
            <div className="flex flex-wrap gap-1.5 mt-4">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-2.5 py-1 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-xs font-bold text-on-surface-variant transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </section>

      <section>
        <Link href="/equipment" className="block">
          <Card className="p-card-padding flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary text-on-primary flex items-center justify-center shrink-0">
              <Icon name="precision_manufacturing" className="text-2xl" />
            </div>
            <div className="flex-1">
              <h2 className="text-title-sm text-on-surface">설비 마스터</h2>
              <p className="text-sm text-on-surface-variant mt-1">
                설비 하나를 열면 진행 중인 오버홀 작업, 과거 고장 이력, 관련 준공도서가 한 화면에
                모입니다. 세 모듈이 공통으로 참조하는 기준 데이터입니다.
              </p>
            </div>
            <Icon name="chevron_right" className="text-on-surface-variant" />
          </Card>
        </Link>
      </section>
    </>
  );
}
