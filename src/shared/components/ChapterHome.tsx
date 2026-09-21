import Link from "next/link";
import { Card, Icon } from "./ui";

/**
 * 챕터(대메뉴) 첫 화면의 공통 골격.
 *
 * 고장관리·매뉴얼관리는 "작성"과 "조회"가 한 챕터 안에 나란히 서는 같은 모양이다.
 * 두 화면을 따로 쓰면 카드 크기나 문구가 조금씩 어긋나므로 골격을 한 벌만 둔다.
 * 앱(PWA/네이티브)으로 옮길 때도 챕터 화면이 하나의 패턴이라 그대로 대응된다.
 */
export interface ChapterAction {
  href: string;
  icon: string;
  title: string;
  desc: string;
}

export default function ChapterHome({
  title,
  desc,
  actions,
  children,
}: {
  title: string;
  desc: string;
  actions: ChapterAction[];
  /** 카드 아래에 붙는 내용 (보통 최근 문서 요약) */
  children?: React.ReactNode;
}) {
  return (
    <>
      <section className="pt-2">
        <h1 className="text-display-lg text-on-surface">{title}</h1>
        <p className="text-body-md text-on-surface-variant mt-2">{desc}</p>
      </section>

      <section className="grid gap-gutter md:grid-cols-2">
        {actions.map((a) => (
          <Link key={a.href} href={a.href} className="block">
            {/* h-full — 두 카드 설명 길이가 달라도 높이가 어긋나지 않게 */}
            <Card className="p-card-padding flex flex-col h-full">
              <div className="w-12 h-12 rounded-2xl bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center mb-4">
                <Icon name={a.icon} className="text-2xl" />
              </div>
              <h2 className="text-headline-md text-on-surface">{a.title}</h2>
              <p className="text-sm text-on-surface-variant mt-2 flex-1">{a.desc}</p>
              <span className="inline-flex items-center gap-1 text-sm font-bold text-primary mt-4">
                열기
                <Icon name="arrow_forward" className="text-base" />
              </span>
            </Card>
          </Link>
        ))}
      </section>

      {children}
    </>
  );
}
