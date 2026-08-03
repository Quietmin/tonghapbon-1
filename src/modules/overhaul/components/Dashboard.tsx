"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  ProgressRing,
  ProgressBar,
  StatusChip,
  Icon,
  Button,
  EmptyState,
} from "@/shared/components/ui";
import { fieldColor, type EquipmentProgress } from "../lib/progress";
import type { OverhaulProject } from "../lib/repo";

const FIELD_LABEL_EN: Record<string, string> = {
  기계: "Mechanical",
  전기: "Electrical",
  제어: "Control",
};

interface Payload {
  project: OverhaulProject;
  hasPeriod: boolean;
  overall: number;
  planned: number;
  sched: { elapsed: number; totalDays: number };
  byField: Record<string, number>;
  equipment: EquipmentProgress[];
  riskCount: number;
  riskFirst: string | null;
  taskCount: number;
  doneCount: number;
}

export default function Dashboard() {
  const [m, setM] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const json = await (await fetch("/api/overhaul/dashboard")).json();
      if (json.ok) setM(json);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <p className="py-20 text-center text-sm text-on-surface-variant">불러오는 중…</p>;
  }

  if (!m || m.taskCount === 0) {
    return (
      <>
        <h1 className="text-display-lg text-on-surface pt-2">대시보드</h1>
        <Card lift={false} className="p-0">
          <EmptyState
            icon="analytics"
            title="아직 집계할 작업이 없습니다"
            desc="업로드 분석에서 설계내역서 엑셀을 넣으면 공정률과 지연 위험이 자동으로 산정됩니다."
            action={
              <Link
                href="/overhaul/upload"
                className="px-4 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-2 bg-primary text-on-primary hover:opacity-90"
              >
                <Icon name="upload_file" className="text-base" />
                엑셀 업로드하러 가기
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const onTrack = m.overall >= m.planned - 5;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {/* 알림 배너 — 지연 위험이 있을 때만 */}
      {m.riskCount > 0 && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-error/20">
          <div className="flex items-center gap-3">
            <Icon name="warning" className="text-error" fill />
            <div>
              <p className="font-bold">지연 위험 알림</p>
              <p className="text-sm opacity-90">
                계획 대비 15%p 이상 뒤처진 공정 {m.riskCount}건이 확인되었습니다.
              </p>
            </div>
          </div>
          <Link
            href="/overhaul/tasks"
            className="shrink-0 px-4 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-2 bg-error text-on-error hover:opacity-90"
          >
            작업 확인하기
          </Link>
        </div>
      )}

      {/* 계약기간 미설정 안내 — 없으면 경과일·계획률·지연이 전부 0이 된다 */}
      {!m.hasPeriod && (
        <div className="bg-surface-container-high p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Icon name="event_busy" className="text-status-warning" />
            <div>
              <p className="font-bold text-on-surface">계약기간이 설정되지 않았습니다</p>
              <p className="text-sm text-on-surface-variant">
                착수일과 준공 예정일을 넣어야 경과일·계획 공정률·지연 위험이 계산됩니다.
              </p>
            </div>
          </div>
          <Link
            href="/overhaul/upload"
            className="shrink-0 px-4 py-2.5 rounded-xl font-bold text-sm inline-flex items-center gap-2 bg-surface-container-lowest border border-border-subtle text-on-surface hover:bg-surface-container"
          >
            설정하러 가기
          </Link>
        </div>
      )}

      {/* 타이틀 */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-display-lg text-on-surface">대시보드</h1>
          <p className="text-on-surface-variant text-body-md">
            {m.project.name} 정기 오버홀 공정 현황
          </p>
        </div>
        <div className="flex gap-2">
          <div className="px-4 py-2.5 rounded-xl bg-surface-container-high border border-border-subtle flex items-center gap-2 text-sm font-semibold">
            <Icon name="calendar_month" className="text-base" />
            {today}
          </div>
          <Button variant="ghost" onClick={() => window.print()}>
            <Icon name="print" className="text-base" />
            인쇄 / PDF
          </Button>
        </div>
      </div>

      {/* Bento 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        <Card className="p-card-padding flex items-center gap-6">
          <ProgressRing value={m.overall}>
            <span className="text-xl font-black text-on-surface">{m.overall}%</span>
          </ProgressRing>
          <div>
            <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider">
              전체 공정률
            </p>
            <h4 className={`text-3xl font-black ${onTrack ? "text-primary" : "text-error"}`}>
              {onTrack ? "정상 진행" : "지연 주의"}
            </h4>
            <p
              className={`text-xs mt-1 flex items-center gap-1 ${
                onTrack ? "text-status-success" : "text-error"
              }`}
            >
              <Icon name={onTrack ? "trending_up" : "trending_down"} className="text-sm" />
              계획 대비 {(m.overall - m.planned).toFixed(1)}%p
            </p>
          </div>
        </Card>

        <Card className="p-card-padding">
          <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-4">
            오버홀 경과일
          </p>
          <div className="flex items-end gap-2 mb-2">
            <span className="text-4xl font-black text-on-surface">{m.sched.elapsed}</span>
            <span className="text-on-surface-variant text-xl mb-1">
              / {m.sched.totalDays || "—"}일
            </span>
          </div>
          <ProgressBar
            value={m.sched.totalDays ? (m.sched.elapsed / m.sched.totalDays) * 100 : 0}
            color="info"
            height="h-3"
          />
          <p className="text-xs text-on-surface-variant mt-3">
            목표 완료일: {m.project.end_date ?? "미설정"}
          </p>
        </Card>

        <Card className="p-card-padding">
          <div className="flex justify-between items-start mb-4">
            <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider">
              지연 위험 공정
            </p>
            <span className="w-10 h-10 rounded-full bg-error-container flex items-center justify-center text-error">
              <Icon name="warning" fill />
            </span>
          </div>
          <h4 className="text-4xl font-black text-error">
            {String(m.riskCount).padStart(2, "0")}
          </h4>
          <p className="text-sm text-on-surface-variant mt-1">
            {m.riskFirst ? `${m.riskFirst} 등 즉시 조치 필요` : "지연 위험 공정 없음"}
          </p>
        </Card>
      </div>

      {/* 분야별 진행률 + 설비별 현황 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        <Card className="lg:col-span-4 p-card-padding space-y-6">
          <h2 className="text-title-sm text-on-surface border-b border-border-subtle pb-4">
            분야별 진행률
          </h2>
          {["기계", "전기", "제어"].map((f) => (
            <div key={f} className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="font-semibold text-sm">
                  {f}{" "}
                  <span className="text-on-surface-variant font-normal">{FIELD_LABEL_EN[f]}</span>
                </span>
                <span className="font-bold text-on-surface">{m.byField[f] ?? 0}%</span>
              </div>
              <ProgressBar value={m.byField[f] ?? 0} color={fieldColor(f)} />
            </div>
          ))}
          <div className="pt-4 mt-4 bg-surface-container-low p-4 rounded-xl flex items-center gap-3">
            <Icon name="info" className="text-primary" fill />
            <p className="text-xs text-on-surface-variant leading-relaxed">
              공정률은 물량 기준(Σ완료수량 / Σ계획수량)으로 자동 산정됩니다.
            </p>
          </div>
        </Card>

        <Card className="lg:col-span-8 p-card-padding">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-title-sm text-on-surface">설비별 현황</h2>
            <Link href="/overhaul/tasks" className="text-primary text-sm font-semibold hover:underline">
              전체 작업 보기
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-on-surface-variant text-[12px] font-semibold uppercase tracking-widest border-b border-border-subtle">
                  <th className="pb-4">설비</th>
                  <th className="pb-4">분야</th>
                  <th className="pb-4">작업 수</th>
                  <th className="pb-4">상태</th>
                  <th className="pb-4 text-right">진행률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {m.equipment.slice(0, 7).map((e) => {
                  const status =
                    e.progress >= 100 ? "완료" : e.progress >= m.planned - 15 ? "진행중" : "지연";
                  return (
                    <tr key={e.equipment} className="hover:bg-surface-container-low transition-colors">
                      <td className="py-4 font-mono-data text-on-surface">{e.equipment}</td>
                      <td className="py-4 text-sm text-on-surface-variant">{e.field ?? "미분류"}</td>
                      <td className="py-4 text-sm">{e.count}건</td>
                      <td className="py-4">
                        <StatusChip status={status} />
                      </td>
                      <td className="py-4 text-right font-bold text-on-surface">{e.progress}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* 현장 요약 */}
      <Card className="overflow-hidden h-48 relative p-0">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary-container to-status-info opacity-90" />
        <div className="absolute inset-0 flex flex-col justify-end p-6 text-white">
          <p className="text-xs font-bold uppercase tracking-widest opacity-80 mb-1">Live Site</p>
          <h2 className="text-xl font-bold">{m.project.unit ?? "—"} 오버홀 현장</h2>
          <p className="text-sm opacity-90 mt-1">
            전체 작업 {m.taskCount}건 · 완료 {m.doneCount}건
          </p>
        </div>
      </Card>
    </>
  );
}
