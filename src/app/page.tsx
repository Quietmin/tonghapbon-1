import Link from "next/link";
import { Card, Icon } from "@/shared/components/ui";
import { HIDDEN_ROUTES, NAV_GROUPS } from "@/shared/lib/nav";

export default function HomePage() {
  return (
    <>
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
            <div className="w-12 h-12 rounded-2xl bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center mb-4">
              <Icon name={group.icon} className="text-2xl" />
            </div>
            <Link href={group.root}>
              <h2 className="text-headline-md text-on-surface hover:text-primary transition-colors">
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
    </>
  );
}
