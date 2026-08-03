"use client";

import { useEffect, useState } from "react";
import { Card, Button, Icon, FieldChip, ProgressBar, ProgressRing, EmptyState } from "@/shared/components/ui";
import { exportTasksToExcel, type ExportTaskRow } from "../lib/exporter";
import type { ReportData } from "../lib/report";
import type { OverhaulProject } from "../lib/repo";

/**
 * 보고서 — 일일보고서 / 경영진 요약 보고서.
 * 원본(legacy/plantsync/src/pages/Reports.jsx)의 화면 구성을 그대로 옮기고,
 * 집계는 서버(/api/overhaul/report)가 미리 계산해 내려준 값을 쓴다.
 */

interface Payload {
  project: OverhaulProject;
  hasPeriod: boolean;
  report: ReportData;
  exportRows: ExportTaskRow[];
}

const FIELD_COLOR = { 기계: "primary", 전기: "success", 제어: "info" } as const;

function Section({
  icon,
  title,
  right,
  children,
}: {
  icon: string;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-title-sm text-on-surface flex items-center gap-2">
          <Icon name={icon} className="text-base text-primary" /> {title}
        </h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function DailyReport({ project, report: d }: { project: OverhaulProject; report: ReportData }) {
  return (
    <div className="report-page space-y-gutter">
      {/* 표지 */}
      <Card className="p-card-padding">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary font-bold">일일 공정 보고서</p>
            <h2 className="text-headline-md text-on-surface">{project.name}</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {project.plant} · {project.unit} · 기준일 {d.today}
            </p>
          </div>
          <div className="flex gap-6">
            {[
              { label: "전체 공정률", value: `${d.overall}%`, color: "text-primary" },
              { label: "계획 공정률", value: `${d.planned}%`, color: "text-on-surface" },
              {
                label: "계획 대비",
                value: `${d.diff >= 0 ? "+" : ""}${d.diff}%p`,
                color: d.diff >= 0 ? "text-status-success" : "text-error",
              },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">
                  {s.label}
                </p>
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
        <Card className="p-card-padding">
          <Section icon="donut_small" title="분야별 공정률">
            <div className="space-y-3">
              {(["기계", "전기", "제어"] as const).map((f) => (
                <div key={f} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <FieldChip field={f} />
                    <span className="font-bold">{d.byField[f] ?? 0}%</span>
                  </div>
                  <ProgressBar value={d.byField[f] ?? 0} color={FIELD_COLOR[f]} height="h-2" />
                </div>
              ))}
            </div>
          </Section>
        </Card>
        <Card className="p-card-padding">
          <Section icon="precision_manufacturing" title="설비별 공정률">
            <div className="grid grid-cols-2 gap-2">
              {d.byEquip.slice(0, 8).map((e) => (
                <div
                  key={e.equipment}
                  className="flex items-center justify-between text-sm bg-surface-container-low rounded-lg px-3 py-2"
                >
                  <span className="font-mono-data truncate">{e.equipment}</span>
                  <span className="font-bold text-on-surface">{e.progress}%</span>
                </div>
              ))}
            </div>
          </Section>
        </Card>
      </div>

      <Card className="p-card-padding">
        <Section
          icon="checklist"
          title="금일 주요 실적"
          right={<span className="text-xs text-on-surface-variant">{d.todayResults.length}건</span>}
        >
          {d.todayResults.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-2">금일 입력된 실적이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {d.todayResults.slice(0, 10).map((r) => (
                <li key={r.taskId} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-surface truncate">
                      [{r.equipment}] {r.name}
                    </p>
                    {r.notes && <p className="text-xs text-on-surface-variant truncate">{r.notes}</p>}
                  </div>
                  <span className="text-sm font-mono-data text-primary whitespace-nowrap">
                    +{r.doneToday} {r.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
        <Card className="p-card-padding">
          <Section
            icon="event_upcoming"
            title="익일 주요 예정작업"
            right={<span className="text-xs text-on-surface-variant">{d.tomorrow}</span>}
          >
            {d.upcoming.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-2">예정된 작업이 없습니다.</p>
            ) : (
              <ul className="space-y-1.5">
                {d.upcoming.slice(0, 8).map((r) => (
                  <li key={r.taskId} className="flex items-center gap-2 text-sm">
                    <FieldChip field={r.field ?? "미분류"} />
                    <span className="truncate flex-1">
                      [{r.equipment}] {r.name}
                    </span>
                    <span className="text-xs text-on-surface-variant font-mono-data">{r.actual}%</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Card>
        <Card className="p-card-padding">
          <Section
            icon="warning"
            title="지연 공정 및 사유"
            right={<span className="text-xs font-bold text-error">{d.delayed.length}건</span>}
          >
            {d.delayed.length === 0 ? (
              <p className="text-sm text-status-success py-2 flex items-center gap-1.5">
                <Icon name="verified" className="text-base" /> 지연 공정이 없습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {d.delayed.slice(0, 6).map((r) => (
                  <li key={r.taskId} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">
                        [{r.equipment}] {r.name}
                      </span>
                      <span className="text-xs text-error whitespace-nowrap">
                        계획{r.planned}% / 실적{r.actual}%
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      사유: {r.delayReason ?? "사유 미입력"}
                      {r.nextPlan ? ` · 조치: ${r.nextPlan}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-gutter">
        <Card className="p-card-padding text-center">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1">
            입력 누락
          </p>
          <p className={`text-2xl font-black ${d.missingCount ? "text-error" : "text-status-success"}`}>
            {d.missingCount}건
          </p>
          <p className="text-xs text-on-surface-variant mt-1">금일 미입력 (미완료 작업)</p>
        </Card>
        <Card className="p-card-padding text-center">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1">
            사진 등록
          </p>
          <p className="text-2xl font-black text-on-surface">
            전 {d.withBefore} / 후 {d.withAfter}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">분해 전 / 후 등록 작업 수</p>
        </Card>
        <Card className="p-card-padding text-center">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-1">
            완료 설비
          </p>
          <p className="text-2xl font-black text-status-success">{d.completedEquipCount}개</p>
          <p className="text-xs text-on-surface-variant mt-1">진행률 100% 도달</p>
        </Card>
      </div>
    </div>
  );
}

function ExecutiveReport({ project, report: d }: { project: OverhaulProject; report: ReportData }) {
  const behindFields = (["기계", "전기", "제어"] as const).filter((f) => (d.byField[f] ?? 0) < d.planned - 5);
  const focus = d.byEquip.filter((e) => e.progress < d.planned - 10).slice(0, 3);

  return (
    <div className="report-page">
      <Card className="p-card-padding md:p-8 space-y-6">
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle pb-5">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary font-bold">경영진 요약 보고</p>
            <h2 className="text-headline-md text-on-surface">{project.name} 정기 오버홀</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {project.plant} · {project.unit} · 기준일 {d.today}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">
              오버홀 기간
            </p>
            <p className="text-sm font-semibold text-on-surface">
              {project.start_date ?? "미설정"} ~ {project.end_date ?? "미설정"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          <div className="flex items-center gap-4">
            <ProgressRing value={d.overall} size={104}>
              <span className="text-2xl font-black text-on-surface">{d.overall}%</span>
              <span className="text-[10px] text-on-surface-variant">전체</span>
            </ProgressRing>
          </div>
          <div className="md:col-span-2 grid grid-cols-2 gap-4">
            <div className="bg-surface-container-low rounded-xl p-4">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                계획 대비 실적
              </p>
              <p className={`text-2xl font-black ${d.diff >= 0 ? "text-status-success" : "text-error"}`}>
                {d.diff >= 0 ? "선행 +" : "지연 "}
                {d.diff}%p
              </p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                계획 {d.planned}% / 실적 {d.overall}%
              </p>
            </div>
            <div className="bg-surface-container-low rounded-xl p-4">
              <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                준공 예정일 영향
              </p>
              {d.finish.date && d.finish.deltaDays != null ? (
                <>
                  <p
                    className={`text-2xl font-black ${
                      d.finish.deltaDays > 0 ? "text-error" : "text-status-success"
                    }`}
                  >
                    {d.finish.deltaDays > 0
                      ? `+${d.finish.deltaDays}일 지연`
                      : d.finish.deltaDays < 0
                        ? `${-d.finish.deltaDays}일 단축`
                        : "정시"}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-0.5">예상 준공 {d.finish.date}</p>
                </>
              ) : (
                <p className="text-lg font-bold text-on-surface-variant mt-1">산정 불가</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-title-sm text-on-surface mb-2 flex items-center gap-2">
              <Icon name="task_alt" className="text-base text-status-success" /> 주요 완료 공정
            </h2>
            {d.completedEquipCount === 0 ? (
              <p className="text-sm text-on-surface-variant">
                완료된 설비가 아직 없습니다. 최고 진척: {d.byEquip[0]?.equipment} {d.byEquip[0]?.progress}%
              </p>
            ) : (
              <ul className="text-sm space-y-1">
                {d.byEquip
                  .filter((e) => e.progress >= 100)
                  .slice(0, 5)
                  .map((e) => (
                    <li key={e.equipment} className="flex justify-between">
                      <span>{e.equipment}</span>
                      <span className="text-status-success font-bold">{e.progress}%</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="text-title-sm text-on-surface mb-2 flex items-center gap-2">
              <Icon name="warning" className="text-base text-error" /> 주요 지연 공정
            </h2>
            {d.delayed.length === 0 ? (
              <p className="text-sm text-status-success">지연 공정이 없습니다.</p>
            ) : (
              <ul className="text-sm space-y-1">
                {d.delayed.slice(0, 5).map((r) => (
                  <li key={r.taskId} className="flex justify-between gap-2">
                    <span className="truncate">
                      [{r.equipment}] {r.name}
                    </span>
                    <span className="text-error font-bold whitespace-nowrap">{r.actual}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border-subtle pt-5">
          <div>
            <h2 className="text-title-sm text-on-surface mb-2 flex items-center gap-2">
              <Icon name="flag" className="text-base text-primary" /> 중점 관리사항
            </h2>
            <ul className="text-sm text-on-surface-variant space-y-1 list-disc pl-5">
              {behindFields.length > 0 && (
                <li>
                  <b className="text-on-surface">{behindFields.join("·")}</b> 분야 진척 부진 — 인력·자재 투입
                  점검 필요
                </li>
              )}
              {focus.map((e) => (
                <li key={e.equipment}>
                  {e.equipment} 공정({e.progress}%) 계획 대비 지연 관리
                </li>
              ))}
              {behindFields.length === 0 && focus.length === 0 && <li>전 분야 계획 대비 정상 진행 중</li>}
            </ul>
          </div>
          <div>
            <h2 className="text-title-sm text-on-surface mb-2 flex items-center gap-2">
              <Icon name="build" className="text-base text-tertiary" /> 조치 필요사항
            </h2>
            <ul className="text-sm text-on-surface-variant space-y-1 list-disc pl-5">
              {d.missingCount > 0 && (
                <li>
                  금일 실적 미입력 <b className="text-error">{d.missingCount}건</b> — 담당자 입력 독려
                </li>
              )}
              {d.delayed.length > 0 && (
                <li>
                  지연 위험 공정 <b className="text-error">{d.delayed.length}건</b> 대응 계획 수립
                </li>
              )}
              {d.withBefore + d.withAfter === 0 && <li>분해 전/후 사진 등록 관리 필요</li>}
              {d.missingCount === 0 && d.delayed.length === 0 && <li>특이 조치사항 없음</li>}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function Reports() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"daily" | "exec">("daily");

  useEffect(() => {
    void (async () => {
      const json = await (await fetch("/api/overhaul/report")).json();
      if (json.ok) setData(json);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <p className="py-20 text-center text-sm text-on-surface-variant">불러오는 중…</p>;
  }

  if (!data || data.exportRows.length === 0) {
    return (
      <>
        <h1 className="text-display-lg text-on-surface pt-2">보고서</h1>
        <Card lift={false} className="p-0">
          <EmptyState
            icon="summarize"
            title="보고서를 생성할 작업이 없습니다"
            desc="먼저 업로드 분석에서 설계내역서를 올려 작업항목을 만드세요."
          />
        </Card>
      </>
    );
  }

  const { project, report } = data;

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 no-print">
        <div>
          <h1 className="text-display-lg text-on-surface">보고서</h1>
          <p className="text-on-surface-variant text-body-md">
            현장 공정회의·경영진 보고용 자료를 자동 생성합니다. (기준일 {report.today})
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              exportTasksToExcel(data.exportRows, project, {
                overall: report.overall,
                byField: report.byField,
                riskCount: report.delayed.length,
                missingCount: report.missingCount,
              })
            }
          >
            <Icon name="table_view" className="text-base" /> 엑셀
          </Button>
          <Button onClick={() => window.print()}>
            <Icon name="print" className="text-base" /> 인쇄 / PDF
          </Button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 p-1 bg-surface-container-high rounded-xl w-full sm:w-fit no-print">
        {(
          [
            { key: "daily", label: "일일보고서", icon: "description" },
            { key: "exec", label: "경영진 보고서", icon: "summarize" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
              tab === t.key
                ? "bg-surface-container-lowest text-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <Icon name={t.icon} className="text-base" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "daily" ? (
        <DailyReport project={project} report={report} />
      ) : (
        <ExecutiveReport project={project} report={report} />
      )}
    </>
  );
}
