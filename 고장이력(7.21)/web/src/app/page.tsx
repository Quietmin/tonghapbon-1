import Link from "next/link";
import Header from "@/components/Header";
import { getDashboardStats } from "@/lib/db";
import { formatDatetimeDisplay } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const DONUT_COLORS = ["#1e3a5f", "#455f87", "#6d87ab", "#8aa4cf", "#adc8f5", "#d5e3fd"];

function statusBadgeClass(status: string | null): string {
  return status === "조치완료" ? "bg-green-100 text-status-success" : "bg-error-container text-error";
}

export default function DashboardPage() {
  const stats = getDashboardStats();

  const resolvedRatio = stats.totalCount > 0 ? Math.round(((stats.totalCount - stats.inProgressCount) / stats.totalCount) * 100) : null;

  const cards = [
    { label: "이번달 고장건수", value: String(stats.thisMonthCount), sub: `전체 누적 ${stats.totalCount}건 중`, icon: "warning", color: "text-status-warning" },
    { label: "조치중 건수", value: String(stats.inProgressCount), sub: resolvedRatio !== null ? `처리율 ${resolvedRatio}%` : "-", icon: "build", color: "text-primary" },
    {
      label: "다발 설비 Top1",
      value: stats.topEquipmentName ?? "데이터 없음",
      sub: stats.topEquipmentName ? `누적 ${stats.topEquipmentCount}건` : "",
      icon: "star",
      color: "text-primary",
    },
    { label: "누적 건수 (YTD)", value: String(stats.ytdCount), sub: `전체 누적 ${stats.totalCount}건`, icon: "analytics", color: "text-primary" },
  ];

  const maxTrend = Math.max(...stats.monthlyTrend.map((t) => t.count), 1);
  const trendPoints = stats.monthlyTrend.map((t, i) => ({
    x: (i / Math.max(stats.monthlyTrend.length - 1, 1)) * 600,
    y: 150 - (t.count / maxTrend) * 130,
    count: t.count,
  }));
  const trendPath = trendPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  const fieldTotal = stats.failureFieldBreakdown.reduce((sum, f) => sum + f.count, 0);
  let cumulative = 0;
  const donutStops = stats.failureFieldBreakdown.map((f, i) => {
    const start = fieldTotal ? (cumulative / fieldTotal) * 360 : 0;
    cumulative += f.count;
    const end = fieldTotal ? (cumulative / fieldTotal) * 360 : 0;
    return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${start}deg ${end}deg`;
  });
  const donutBackground = fieldTotal > 0 ? `conic-gradient(${donutStops.join(", ")})` : undefined;

  const maxBranch = Math.max(...stats.branchBreakdown.map((b) => b.count), 1);

  return (
    <div>
      <Header title="대시보드" />
      <main className="p-container-padding max-w-[1600px] mx-auto w-full flex flex-col gap-gutter">
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
          {cards.map((card) => (
            <div
              key={card.label}
              className="bg-white p-stack-md rounded-xl border border-border-subtle flex flex-col justify-between min-h-[120px]"
            >
              <div className="flex justify-between items-start">
                <p className="text-on-surface-variant font-label-caps text-label-caps uppercase">{card.label}</p>
                <span className={`material-symbols-outlined ${card.color}`}>{card.icon}</span>
              </div>
              <div className="mt-4 flex flex-col">
                <span className={`${card.value.length > 5 ? "text-title-sm" : "text-display-lg"} font-bold text-primary`}>
                  {card.value}
                </span>
                {card.sub && <span className="text-body-sm text-on-surface-variant">{card.sub}</span>}
              </div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
          <div className="bg-white p-gutter rounded-xl border border-border-subtle flex flex-col">
            <div className="flex justify-between items-center mb-stack-md">
              <h3 className="text-title-sm font-title-sm text-primary">월별 고장 추이</h3>
              <span className="text-xs text-on-surface-variant">최근 6개월</span>
            </div>
            <div className="relative h-60 flex items-end justify-between px-4 pb-6 border-b border-border-subtle">
              <div className="absolute inset-x-0 bottom-6 h-[80%]">
                <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 600 160">
                  <path d={trendPath} fill="none" stroke="#1e3a5f" strokeWidth="3" />
                  {trendPoints.map((p) => (
                    <circle key={p.x} cx={p.x} cy={p.y} fill="#1e3a5f" r="4" />
                  ))}
                </svg>
              </div>
              {stats.monthlyTrend.map((t) => (
                <span key={t.month} className="text-[10px] text-on-surface-variant z-10">
                  {t.month}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-gutter">
            <div className="bg-white p-gutter rounded-xl border border-border-subtle">
              <h3 className="text-title-sm font-title-sm text-primary mb-stack-md">분야별 비율</h3>
              {fieldTotal === 0 ? (
                <p className="text-body-sm text-on-surface-variant">데이터가 없습니다.</p>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-28 h-28 rounded-full relative flex items-center justify-center" style={{ background: donutBackground }}>
                    <div className="absolute inset-3 bg-white rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">{fieldTotal}건</span>
                    </div>
                  </div>
                  <ul className="w-full space-y-1">
                    {stats.failureFieldBreakdown.map((f, i) => (
                      <li key={f.field} className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                          {f.field}
                        </span>
                        <span className="font-bold text-on-surface-variant">
                          {f.count}건 ({Math.round((f.count / fieldTotal) * 100)}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="bg-white p-gutter rounded-xl border border-border-subtle">
              <h3 className="text-title-sm font-title-sm text-primary mb-stack-md">지사별 건수</h3>
              {stats.branchBreakdown.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">데이터가 없습니다.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {stats.branchBreakdown.slice(0, 5).map((item) => (
                    <div key={item.branch} className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span>{item.branch}</span>
                        <span>{item.count}건</span>
                      </div>
                      <div className="h-2 bg-surface-container rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${(item.count / maxBranch) * 100}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-gutter mb-8">
          <div className="lg:col-span-5 bg-white rounded-xl border border-border-subtle overflow-hidden flex flex-col">
            <div className="p-gutter border-b border-border-subtle bg-table-header flex justify-between items-center">
              <h3 className="text-title-sm font-title-sm text-primary">다발 설비 Top 10</h3>
            </div>
            {stats.topEquipment.length === 0 ? (
              <p className="p-gutter text-body-sm text-on-surface-variant">데이터가 없습니다.</p>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-table-header/50 text-label-caps text-on-surface-variant">
                  <tr>
                    <th className="px-4 py-3">순위</th>
                    <th className="px-4 py-3">설비명</th>
                    <th className="px-4 py-3 text-right">고장수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {stats.topEquipment.map((row, i) => (
                    <tr key={row.name} className="hover:bg-background transition-colors">
                      <td className="px-4 py-3 font-bold text-primary">{i + 1}</td>
                      <td className="px-4 py-3 text-body-sm font-semibold">{row.name}</td>
                      <td className={`px-4 py-3 text-right font-bold ${i === 0 ? "text-status-critical" : "text-primary"}`}>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="lg:col-span-7 bg-white rounded-xl border border-border-subtle overflow-hidden">
            <div className="p-gutter border-b border-border-subtle bg-table-header flex justify-between items-center">
              <h3 className="text-title-sm font-title-sm text-primary uppercase">최근 등록 고장이력</h3>
              <Link href="/history" className="text-primary hover:underline text-xs font-bold">
                전체보기
              </Link>
            </div>
            <div className="p-gutter flex flex-col gap-4 overflow-y-auto max-h-[400px]">
              {stats.recent.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">등록된 고장이력이 없습니다.</p>
              ) : (
                stats.recent.map((r) => (
                  <Link
                    key={r.id}
                    href={`/history/${r.id}`}
                    className="flex items-start gap-4 p-3 rounded-lg border border-border-subtle hover:bg-background transition-all group"
                  >
                    <div className="w-10 h-10 rounded bg-error-container flex items-center justify-center text-error flex-shrink-0">
                      <span className="material-symbols-outlined">error</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadgeClass(r.status)}`}>{r.status || "-"}</span>
                        <span className="text-xs text-on-surface-variant font-data-mono">{formatDatetimeDisplay(r.occurred_at)}</span>
                      </div>
                      <h4 className="text-body-md font-bold text-primary truncate">{r.title || "(제목 없음)"}</h4>
                      <p className="text-body-sm text-on-surface-variant line-clamp-1">
                        {[r.branch, r.equipment_name].filter(Boolean).join(" · ") || "-"}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
      <Link
        href="/history/new"
        className="fixed bottom-8 right-8 w-14 h-14 bg-primary text-on-primary rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform z-50"
      >
        <span className="material-symbols-outlined scale-125">add</span>
      </Link>
    </div>
  );
}
