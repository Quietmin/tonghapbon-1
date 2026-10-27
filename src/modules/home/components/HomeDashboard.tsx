import Link from "next/link";
import { Card, EmptyState, FieldChip, Icon, ProgressBar } from "@/shared/components/ui";
import { NAV_GROUPS, HIDDEN_ROUTES } from "@/shared/lib/nav";
import { fieldColor } from "@/modules/overhaul/lib/progress";
import {
  getHomeDashboard,
  type DashboardStats,
  type RecentEntry,
  type RiskItem,
} from "../lib/dashboard";
import { BranchGrid, BranchSelect } from "./BranchControls";

/**
 * PC 처음 화면 — 선택한 지사의 설비관리 현황 대시보드.
 *
 * 구성: 머리줄(지사·회차·기간·D-day) → 지표 카드 4개 → 분야별 진척 / 지연 위험 작업 →
 * 최근 실적 입력 / 챕터 바로가기. 폰 첫 화면은 page.tsx 의 별도 레이아웃이 맡는다.
 * 서버 컴포넌트라 DB 를 직접 읽고, 지사를 바꾸는 셀렉트만 클라이언트다.
 */

const fmt = (n: number) => `${Math.round(n * 10) / 10}`;

function periodLabel(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const short = (d: string) => d.slice(5).replace("-", ".");
  return `${short(start)} ~ ${short(end)}`;
}

function ddayLabel(daysLeft: number | null): string | null {
  if (daysLeft === null) return null;
  if (daysLeft > 0) return `D-${daysLeft}`;
  if (daysLeft === 0) return "D-day";
  return `종료 ${Math.abs(daysLeft)}일 경과`;
}

/** 지표 카드 하나 — 누르면 해당 화면으로 */
function Kpi({
  href,
  icon,
  label,
  value,
  unit,
  sub,
  tone = "default",
}: {
  href: string;
  icon: string;
  label: string;
  value: string;
  unit?: string;
  sub?: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <Link href={href} className="block h-full">
      <Card className="p-5 h-full flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-sm font-bold text-on-surface-variant">
          <Icon name={icon} className="text-base" />
          {label}
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className={`text-display-lg tabular-nums ${tone === "danger" ? "text-status-error" : "text-on-surface"}`}
          >
            {value}
          </span>
          {unit && <span className="text-title-sm text-on-surface-variant">{unit}</span>}
        </div>
        {sub && <div className="text-sm text-on-surface-variant mt-auto">{sub}</div>}
      </Card>
    </Link>
  );
}

function FieldProgress({ byField }: { byField: Record<string, number> }) {
  return (
    <Card lift={false} className="p-5">
      <h2 className="text-title-sm text-on-surface mb-4">분야별 진척</h2>
      <div className="flex flex-col gap-4">
        {Object.entries(byField).map(([field, value]) => (
          <div key={field} className="grid grid-cols-[56px_1fr_52px] items-center gap-3">
            <FieldChip field={field} />
            <ProgressBar value={value} color={fieldColor(field)} />
            <span className="text-sm font-bold text-on-surface tabular-nums text-right">{fmt(value)}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RiskList({ risk, total }: { risk: RiskItem[]; total: number }) {
  return (
    <Card lift={false} className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-title-sm text-on-surface">지연 위험 작업</h2>
        {total > 0 && (
          <Link href="/overhaul/tasks/schedule" className="text-sm font-bold text-primary hover:underline">
            공정표 보기
          </Link>
        )}
      </div>
      {risk.length === 0 ? (
        <p className="py-6 text-center text-sm text-on-surface-variant">
          지금 지연 위험으로 잡힌 작업이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col">
          {risk.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 py-2.5 border-b border-border-subtle last:border-0"
            >
              <span className="min-w-0">
                <span className="block text-sm font-bold text-on-surface truncate">{r.name}</span>
                <span className="block text-xs text-on-surface-variant truncate">
                  {[r.equipment, r.field].filter(Boolean).join(" · ") || "-"} · 공정률 {fmt(r.progress)}%
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold text-status-error tabular-nums">
                {r.overdueDays > 0 ? `지연 ${r.overdueDays}일` : `계획 대비 -${fmt(r.gap)}%p`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentList({ recent }: { recent: RecentEntry[] }) {
  return (
    <Card lift={false} className="p-5 lg:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-title-sm text-on-surface">최근 실적 입력</h2>
        <Link href="/overhaul/entry" className="text-sm font-bold text-primary hover:underline">
          실적 입력하기
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="py-6 text-center text-sm text-on-surface-variant">
          아직 입력된 실적이 없습니다. 실적 입력에서 오늘 한 작업을 남겨 보세요.
        </p>
      ) : (
        <ul className="flex flex-col">
          {recent.map((r, i) => (
            <li
              key={`${r.date}-${i}`}
              className="grid grid-cols-[64px_1fr_auto] items-center gap-3 py-2.5 border-b border-border-subtle last:border-0"
            >
              <span className="text-sm text-on-surface-variant tabular-nums">{r.date.slice(5).replace("-", ".")}</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-on-surface truncate">{r.taskName}</span>
                <span className="block text-xs text-on-surface-variant truncate">
                  {[r.equipment, r.field].filter(Boolean).join(" · ") || "-"} · 이날 {fmt(r.doneQty)}
                  {r.unit ?? ""}
                </span>
              </span>
              <span className="text-sm font-bold text-on-surface tabular-nums">누계 {fmt(r.progress)}%</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** 챕터 바로가기 — 예전 "중앙 허브" 카드가 하던 길 안내를 작게 옮긴 것 */
function Shortcuts() {
  return (
    <Card lift={false} className="p-5">
      <h2 className="text-title-sm text-on-surface mb-3">바로가기</h2>
      <div className="flex flex-col gap-4">
        {NAV_GROUPS.map((g) => (
          <div key={g.key}>
            <Link
              href={g.root}
              className={`inline-flex items-center gap-1.5 text-sm font-bold hover:underline ${
                g.accent === "tertiary" ? "text-tertiary" : "text-primary"
              }`}
            >
              <Icon name={g.icon} className="text-base" />
              {g.label}
            </Link>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {g.items.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  className="px-2.5 py-1 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-xs font-bold text-on-surface-variant transition-colors"
                >
                  {it.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
        {HIDDEN_ROUTES.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-3 border-t border-border-subtle">
            {HIDDEN_ROUTES.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border-subtle hover:bg-surface-container-high text-xs text-on-surface-variant transition-colors"
              >
                <Icon name={r.icon} className="text-sm" />
                {r.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function Header({
  title,
  sub,
  branch,
}: {
  title: string;
  sub?: React.ReactNode;
  branch?: string;
}) {
  return (
    <section className="pt-2 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-display-lg text-on-surface">{title}</h1>
        {sub && <p className="text-body-md text-on-surface-variant mt-2">{sub}</p>}
      </div>
      {branch && <BranchSelect branch={branch} />}
    </section>
  );
}

function Kpis({
  stats,
  equipmentCount,
  deviceCount,
}: {
  stats: DashboardStats;
  equipmentCount: number;
  deviceCount: number;
}) {
  const gap = Math.round((stats.overall - stats.planned) * 10) / 10;
  return (
    <section className="grid gap-gutter grid-cols-2 xl:grid-cols-4">
      <Kpi
        href="/overhaul/dashboard"
        icon="donut_large"
        label="전체 공정률"
        value={fmt(stats.overall)}
        unit="%"
        sub={
          stats.hasPeriod ? (
            <>
              계획 {fmt(stats.planned)}% ·{" "}
              <span className={gap >= 0 ? "text-status-success font-bold" : "text-status-error font-bold"}>
                {gap >= 0 ? `+${fmt(gap)}` : fmt(gap)}%p
              </span>
            </>
          ) : (
            "계약기간 미설정"
          )
        }
      />
      <Kpi
        href="/overhaul/tasks/schedule"
        icon="warning"
        label="지연 위험"
        value={String(stats.riskCount)}
        unit="건"
        tone={stats.riskCount > 0 ? "danger" : "default"}
        sub={stats.riskCount > 0 ? `가장 급한 작업: ${stats.risk[0]?.name ?? "-"}` : "지연 위험 없음"}
      />
      <Kpi
        href="/overhaul/tasks"
        icon="task_alt"
        label="작업 완료"
        value={`${stats.doneCount} / ${stats.taskCount}`}
        sub={`진행 중 ${stats.inProgressCount}건`}
      />
      <Kpi
        href="/equipment"
        icon="precision_manufacturing"
        label="설비 마스터"
        value={String(equipmentCount)}
        unit="개"
        sub={`기기 ${deviceCount}개`}
      />
    </section>
  );
}

export default async function HomeDashboard() {
  const data = await getHomeDashboard();

  if (data.kind === "no-branch") {
    return (
      <div className="space-y-gutter">
        <Header
          title="지사 선택"
          sub="유지보수 업무는 지사별로 따로 운영됩니다. 소속 지사를 고르면 그 지사의 설비관리 현황이 처음 화면에 보입니다. 한 번 고르면 기억되고, 언제든 바꿀 수 있습니다."
        />
        <BranchGrid />
        <Shortcuts />
      </div>
    );
  }

  if (data.kind === "error") {
    return (
      <div className="space-y-gutter">
        <Header title="처음 화면" />
        <Card lift={false} className="p-0">
          <EmptyState
            icon="error"
            title="현황을 불러오지 못했습니다"
            desc={`${data.message} — 잠시 뒤 새로고침해 보세요. 아래 바로가기로는 계속 이동할 수 있습니다.`}
          />
        </Card>
        <Shortcuts />
      </div>
    );
  }

  const { branch, project, stats, equipmentCount, deviceCount, recent } = data;

  if (!project || !stats || stats.taskCount === 0) {
    return (
      <div className="space-y-gutter">
        <Header
          title={`${branch} 현황`}
          sub={project ? `${project.name} · 아직 등록된 작업이 없습니다` : "아직 등록된 회차가 없습니다"}
          branch={branch}
        />
        <Card lift={false} className="p-0">
          <EmptyState
            icon="analytics"
            title="집계할 작업이 아직 없어요"
            desc="작업·공정의 엑셀 등록에서 수량산출서를 올리면 공정률과 지연 위험이 이 화면에 자동으로 나타납니다."
            action={
              <Link
                href="/overhaul/tasks/upload"
                className="px-4 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-2 bg-primary text-on-primary hover:opacity-90"
              >
                <Icon name="upload_file" className="text-base" />
                엑셀 등록하러 가기
              </Link>
            }
          />
        </Card>
        <div className="grid gap-gutter grid-cols-2 xl:grid-cols-4">
          <Kpi
            href="/equipment"
            icon="precision_manufacturing"
            label="설비 마스터"
            value={String(equipmentCount)}
            unit="개"
            sub={`기기 ${deviceCount}개`}
          />
        </div>
        <Shortcuts />
      </div>
    );
  }

  const period = periodLabel(project.start_date, project.end_date);
  const dday = ddayLabel(stats.daysLeft);

  return (
    <div className="space-y-gutter">
      <Header
        title={`${branch} 현황`}
        sub={[project.name, period, dday].filter(Boolean).join(" · ")}
        branch={branch}
      />
      <Kpis stats={stats} equipmentCount={equipmentCount} deviceCount={deviceCount} />
      <section className="grid gap-gutter lg:grid-cols-2">
        <FieldProgress byField={stats.byField} />
        <RiskList risk={stats.risk} total={stats.riskCount} />
      </section>
      <section className="grid gap-gutter lg:grid-cols-3">
        <RecentList recent={recent} />
        <Shortcuts />
      </section>
    </div>
  );
}
