"use client";

import { useEffect, useState } from "react";
import {
  Card,
  Button,
  Icon,
  EmptyState,
  ScreenHeader,
  LoadingState,
} from "@/shared/components/ui";
import { exportTasksToExcel, type ExportTaskRow } from "../lib/exporter";
import type { PlanRow, ReportData, ReportSection } from "../lib/report";
import type { OverhaulProject } from "../lib/repo";

/**
 * 보고서 — 일일보고서(전일 실적·금일 계획) / 주간보고서(전주 실적·금주 계획).
 * 집계는 서버(/api/overhaul/report)가 기준일 시점으로 계산해 내려준다.
 *
 * 화면이 곧 인쇄본이다. 카드 대신 표로 짜서 A4 한두 장에 촘촘히 들어가게 하고,
 * 보고서라 글자를 자르지 않는다(말줄임·개수 제한 없음 — 길면 줄을 바꾼다).
 * 인쇄용 글자 크기·여백은 globals.css 의 .report-doc 규칙이 맡는다.
 */

interface Payload {
  project: OverhaulProject;
  hasPeriod: boolean;
  report: ReportData;
  exportRows: ExportTaskRow[];
}

const shortDate = (d: string) => d.slice(5).replace("-", ".");
const rangeText = (r: { start: string; end: string }) =>
  r.start === r.end ? r.start : `${r.start} ~ ${shortDate(r.end)}`;
const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

function DocSection({
  no,
  title,
  sub,
  children,
}: {
  no: number;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="report-section">
      <h3 className="text-sm font-bold text-on-surface mb-1.5 flex items-baseline gap-2">
        <span>
          {no}. {title}
        </span>
        {sub && (
          <span className="text-xs font-normal text-on-surface-variant">
            {sub}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

/** 열 너비(%)를 고정해 긴 글자가 표를 밀어내지 않고 칸 안에서 줄을 바꾸게 한다 */
function DocTable({
  cols,
  empty,
  children,
}: {
  cols: { label: string; w: string; right?: boolean }[];
  empty: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="report-table-wrap">
      <table className="report-table">
        <colgroup>
          {cols.map((c) => (
            <col key={c.label} style={{ width: c.w }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.label} className={c.right ? "text-right" : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td
                colSpan={cols.length}
                className="text-center text-on-surface-variant"
              >
                {empty}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

function PlanTable({
  rows,
  withText,
  half,
}: {
  rows: PlanRow[];
  withText: boolean;
  half: boolean;
}) {
  return (
    <DocTable
      cols={[
        { label: "분야", w: half ? "9%" : "7%" },
        { label: "설비", w: half ? "17%" : "10%" },
        { label: "작업명", w: half ? "41%" : withText ? "30%" : "60%" },
        { label: "계획일정", w: half ? "19%" : "15%" },
        { label: "진행률", w: half ? "14%" : "8%", right: true },
        ...(withText ? [{ label: "계획 내용", w: "30%" }] : []),
      ]}
      empty={rows.length ? null : "계획일정상 진행할 작업이 없습니다."}
    >
      {rows.map((r) => (
        <tr key={r.taskId}>
          <td>{r.field ?? "-"}</td>
          <td>{r.equipment}</td>
          <td>{r.name}</td>
          <td className="whitespace-nowrap">
            {shortDate(r.plannedStartStr)}~{shortDate(r.plannedEndStr)}
          </td>
          <td className="text-right whitespace-nowrap">{pct(r.actual)}</td>
          {withText && <td className="whitespace-pre-wrap">{r.plan ?? "-"}</td>}
        </tr>
      ))}
    </DocTable>
  );
}

function ReportDoc({
  project,
  report: d,
  section: s,
}: {
  project: OverhaulProject;
  report: ReportData;
  section: ReportSection;
}) {
  const daily = s.kind === "daily";
  const prevLabel = daily ? "전일 실적" : "전주 실적";
  const curLabel = daily ? "금일 계획" : "금주 계획";
  // 계획 내용은 실적 입력의 "익일 계획" 칸에서 온다 — 아무도 안 적었으면 빈 열로 자리만 차지하므로 뺀다
  const hasPlanText = s.plans.some((r) => r.plan);
  // 계획 내용 열이 없으면 표가 좁아 반으로 나눠 두 줄로 세운다 — 주간 계획이 길어도 두 장 안에 들게
  // 사유도 조치도 없는 지연은 넓은 글자 칸이 비므로 따로 촘촘한 표로 모은다
  const explained = d.delayed.filter((r) => r.delayReason || r.nextPlan);
  const unexplained = d.delayed.filter((r) => !r.delayReason && !r.nextPlan);
  const twoUp = !hasPlanText && s.plans.length > 12;
  const halfAt = Math.ceil(s.plans.length / 2);

  const kpis = [
    { label: "전체 공정률", value: pct(d.overall), tone: "text-primary" },
    { label: "계획 공정률", value: pct(d.planned), tone: "" },
    {
      label: "계획 대비",
      value: `${d.diff >= 0 ? "+" : ""}${d.diff}%p`,
      tone: d.diff >= 0 ? "text-status-success-text" : "text-error",
    },
    {
      label: "지연 공정",
      value: `${d.delayed.length}건`,
      tone: d.delayed.length ? "text-error" : "",
    },
    {
      label: `${prevLabel} 미입력`,
      value: `${s.missingCount}건`,
      tone: s.missingCount ? "text-error" : "",
    },
    { label: "완료 설비", value: `${d.completedEquipCount}개`, tone: "" },
    {
      label: "분해 전/후 사진",
      value: `${d.withBefore} / ${d.withAfter}`,
      tone: "",
    },
  ];

  return (
    <article className="report-doc">
      {/* 머리말 */}
      <div className="flex items-end justify-between gap-4 border-b-2 border-on-surface pb-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-primary tracking-widest">
            {daily ? "일일 공정 보고서" : "주간 공정 보고서"}
          </p>
          <h2 className="text-xl font-bold text-on-surface break-keep">
            {project.name}
          </h2>
        </div>
        <dl className="text-xs text-on-surface-variant text-right shrink-0 leading-5">
          {project.branch && (
            <div>
              <dt className="inline">지사 </dt>
              <dd className="inline font-semibold text-on-surface">
                {project.branch}
              </dd>
            </div>
          )}
          <div>
            <dt className="inline">{daily ? "기준일 " : "금주 "}</dt>
            <dd className="inline font-semibold text-on-surface">
              {daily ? d.baseDate : rangeText(s.cur)}
            </dd>
          </div>
          <div>
            <dt className="inline">오버홀 기간 </dt>
            <dd className="inline font-semibold text-on-surface">
              {project.start_date ?? "미설정"} ~ {project.end_date ?? "미설정"}
            </dd>
          </div>
        </dl>
      </div>

      {/* 핵심 지표 */}
      <div className="grid grid-cols-4 sm:grid-cols-7 border border-border-subtle rounded-md overflow-hidden">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="px-2 py-1.5 text-center border-r border-b sm:border-b-0 border-border-subtle last:border-r-0"
          >
            <p className="text-[11px] text-on-surface-variant leading-tight">
              {k.label}
            </p>
            <p
              className={`text-base font-bold leading-tight ${k.tone || "text-on-surface"}`}
            >
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* 분야·설비별 공정률 */}
      <div className="report-chips text-xs leading-6 flex flex-wrap gap-x-1.5 gap-y-1">
        <span className="font-bold text-on-surface mr-1">분야별</span>
        {(["기계", "전기", "제어"] as const).map((f) => (
          <span
            key={f}
            className="px-1.5 rounded border border-border-subtle whitespace-nowrap"
          >
            {f} <b>{pct(d.byField[f] ?? 0)}</b>
          </span>
        ))}
        <span className="font-bold text-on-surface ml-2 mr-1">설비별</span>
        {d.byEquip.map((e) => (
          <span
            key={e.equipment}
            className="px-1.5 rounded border border-border-subtle whitespace-nowrap"
          >
            {e.equipment} <b>{pct(e.progress)}</b>
          </span>
        ))}
      </div>

      <DocSection
        no={1}
        title={prevLabel}
        sub={`${rangeText(s.prev)} · ${s.results.length}건`}
      >
        <DocTable
          cols={[
            { label: "분야", w: "7%" },
            { label: "설비", w: "10%" },
            { label: "작업명", w: "27%" },
            { label: "실적", w: "10%", right: true },
            { label: "진행률", w: "8%", right: true },
            { label: "작업내용", w: "38%" },
          ]}
          empty={
            s.results.length
              ? null
              : `${daily ? "전일" : "전주"} 입력된 실적이 없습니다.`
          }
        >
          {s.results.map((r) => (
            <tr key={r.taskId}>
              <td>{r.field ?? "-"}</td>
              <td>{r.equipment}</td>
              <td>{r.name}</td>
              <td className="text-right whitespace-nowrap">
                {r.qty > 0 ? `+${r.qty.toLocaleString()} ${r.unit ?? ""}` : "-"}
              </td>
              <td className="text-right whitespace-nowrap">
                {pct(r.progress)}
              </td>
              <td>
                {r.notes.length === 0
                  ? "-"
                  : r.notes.map((n, i) => (
                      <p key={i} className="whitespace-pre-wrap">
                        {n}
                      </p>
                    ))}
              </td>
            </tr>
          ))}
        </DocTable>
      </DocSection>

      <DocSection
        no={2}
        title={curLabel}
        sub={`${rangeText(s.cur)} · ${s.plans.length}건 (계획일정 기준 진행 대상)`}
      >
        {s.plans.length === 0 ? (
          <PlanTable rows={[]} withText={false} half={false} />
        ) : twoUp ? (
          <div className="report-two-up">
            <PlanTable rows={s.plans.slice(0, halfAt)} withText={false} half />
            <PlanTable rows={s.plans.slice(halfAt)} withText={false} half />
          </div>
        ) : (
          <PlanTable rows={s.plans} withText={hasPlanText} half={false} />
        )}
      </DocSection>

      <DocSection
        no={3}
        title="지연 공정 및 사유"
        sub={`계획 대비 15%p 이상 뒤처진 작업 · ${d.delayed.length}건`}
      >
        {d.delayed.length === 0 || explained.length > 0 ? (
          <DocTable
            cols={[
              { label: "설비", w: "9%" },
              { label: "작업명", w: "20%" },
              { label: "계획 / 실적", w: "14%", right: true },
              { label: "지연 사유", w: "30%" },
              { label: "조치 계획", w: "27%" },
            ]}
            empty={d.delayed.length ? null : "지연 공정이 없습니다."}
          >
            {explained.map((r) => (
              <tr key={r.taskId}>
                <td>{r.equipment}</td>
                <td>{r.name}</td>
                <td className="text-right whitespace-nowrap">
                  {pct(r.planned)} /{" "}
                  <b className="text-error">{pct(r.actual)}</b>
                </td>
                <td className="whitespace-pre-wrap">
                  {r.delayReason ? (
                    <>
                      {r.delayReason}
                      {r.reasonDate && (
                        <span className="text-on-surface-variant">
                          {" "}
                          ({shortDate(r.reasonDate)})
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-on-surface-variant">사유 미입력</span>
                  )}
                </td>
                <td className="whitespace-pre-wrap">{r.nextPlan ?? "-"}</td>
              </tr>
            ))}
          </DocTable>
        ) : null}
        {unexplained.length > 0 && (
          <>
            <p className="report-subhead text-xs font-semibold text-on-surface mt-2 mb-1">
              사유·조치 미입력 {unexplained.length}건 — 실적 입력에서 지연
              사유를 적어 주세요
            </p>
            <div
              className={unexplained.length > 6 ? "report-two-up" : undefined}
            >
              {(unexplained.length > 6
                ? [
                    unexplained.slice(0, Math.ceil(unexplained.length / 2)),
                    unexplained.slice(Math.ceil(unexplained.length / 2)),
                  ]
                : [unexplained]
              ).map((rows, i) => (
                <DocTable
                  key={i}
                  cols={[
                    { label: "설비", w: "20%" },
                    { label: "작업명", w: "50%" },
                    { label: "계획 / 실적", w: "30%", right: true },
                  ]}
                  empty={null}
                >
                  {rows.map((r) => (
                    <tr key={r.taskId}>
                      <td>{r.equipment}</td>
                      <td>{r.name}</td>
                      <td className="text-right whitespace-nowrap">
                        {pct(r.planned)} /{" "}
                        <b className="text-error">{pct(r.actual)}</b>
                      </td>
                    </tr>
                  ))}
                </DocTable>
              ))}
            </div>
          </>
        )}
      </DocSection>
    </article>
  );
}

export default function Reports() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"daily" | "weekly">("daily");
  const [date, setDate] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      const json = await (
        await fetch(`/api/overhaul/report${date ? `?date=${date}` : ""}`)
      ).json();
      if (!alive) return;
      if (json.ok) {
        setData(json);
        if (!date) setDate(json.report.baseDate);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [date]);

  if (loading && !data) {
    return <LoadingState />;
  }

  if (!data || data.exportRows.length === 0) {
    return (
      <>
        <ScreenHeader
          icon="summarize"
          title="보고서"
          desc="일일·주간 공정 보고서를 자동 생성합니다."
          bullets={[]}
          tone="soft"
        />
        <Card lift={false} className="p-0">
          <EmptyState
            icon="summarize"
            title="보고서를 생성할 작업이 없습니다"
            desc="먼저 작업·공정의 엑셀 등록 탭에서 설계내역서를 올려 작업항목을 만드세요."
          />
        </Card>
      </>
    );
  }

  const { project, report } = data;
  const section = tab === "daily" ? report.daily : report.weekly;

  return (
    <>
      <div className="no-print">
        <ScreenHeader
          icon="summarize"
          title="보고서"
          desc="공정회의용 일일·주간 보고서를 자동 생성합니다. 기준일을 바꾸면 그날 시점으로 다시 계산합니다."
          bullets={[]}
          tone="soft"
          action={
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() =>
                  exportTasksToExcel(data.exportRows, project, {
                    overall: report.overall,
                    byField: report.byField,
                    riskCount: report.delayed.length,
                    missingCount: report.daily.missingCount,
                  })
                }
              >
                <Icon name="table_view" className="text-base" /> 엑셀
              </Button>
              <Button onClick={() => window.print()}>
                <Icon name="print" className="text-base" /> 인쇄 / PDF
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 no-print">
        <div className="flex gap-1 p-1 bg-surface-container-high rounded-xl w-full sm:w-fit">
          {(
            [
              { key: "daily", label: "일일보고서", icon: "description" },
              { key: "weekly", label: "주간보고서", icon: "date_range" },
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
        <label className="flex items-center gap-2 text-sm text-on-surface-variant">
          기준일
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="input !w-auto !py-2"
          />
        </label>
        {loading && (
          <span className="text-xs text-on-surface-variant">
            다시 계산하는 중…
          </span>
        )}
      </div>

      <ReportDoc project={project} report={report} section={section} />
    </>
  );
}
