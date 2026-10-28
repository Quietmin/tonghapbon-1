import Link from "next/link";
import { Card } from "@/shared/components/ui";
import { STATUS_OPTIONS, type IssueStatus } from "@/modules/status/lib/constants";

/** 상태별 건수 카드 4장 — 누르면 현황 조회로 간다 */
const TONE: Record<IssueStatus, string> = {
  미완료: "text-status-error",
  조치중: "text-status-warning",
  "추후 조치 예정": "text-status-info",
  조치완료: "text-status-success",
};

export default function StatusCountCards({
  counts,
  caption,
}: {
  counts: Record<string, number>;
  /** 카드 아래 한 줄 설명(예: "우리 부서에 배정된 건") */
  caption: string;
}) {
  return (
    <section className="grid gap-gutter grid-cols-2 xl:grid-cols-4">
      {STATUS_OPTIONS.map((s) => (
        <Link key={s} href="/status" className="block h-full">
          <Card className="p-5 h-full flex flex-col gap-1">
            <span className="text-sm font-bold text-on-surface-variant">{s}</span>
            <span className="flex items-baseline gap-1">
              <span className={`text-display-lg tabular-nums ${TONE[s]}`}>{counts[s] ?? 0}</span>
              <span className="text-title-sm text-on-surface-variant">건</span>
            </span>
            <span className="text-xs text-on-surface-variant mt-auto">{caption}</span>
          </Card>
        </Link>
      ))}
    </section>
  );
}
