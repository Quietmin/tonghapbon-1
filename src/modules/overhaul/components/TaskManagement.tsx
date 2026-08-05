"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  Icon,
  StatusChip,
  FieldChip,
  Avatar,
  EmptyState,
  ProgressBar,
} from "@/shared/components/ui";
import { taskProgress } from "../lib/progress";
import type { OverhaulTask, OverhaulProject } from "../lib/repo";

/**
 * 작업 관리 — 검색·필터·페이지네이션.
 * 원본(legacy/plantsync/src/pages/TaskManagement.jsx)은 브라우저 메모리의 배열을
 * 걸러냈지만, 여기서는 서버에서 SQL로 걸러 페이지 단위로 받는다.
 */

interface Payload {
  project: OverhaulProject;
  rows: OverhaulTask[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  riskIds: string[];
  equipmentOptions: string[];
  summary: {
    taskCount: number;
    overall: number;
    riskCount: number;
    personnel: number;
    remainingDays: number;
    endDate: string | null;
    expected: number;
  };
}

export default function TaskManagement() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [field, setField] = useState("전체");
  const [equipment, setEquipment] = useState("전체");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), field, equipment, q });
    const res = await fetch(`/api/overhaul/tasks?${sp}`);
    const json = await res.json();
    if (json.ok) setData(json);
    setLoading(false);
  }, [page, field, equipment, q]);

  // 검색어는 타이핑이 멈춘 뒤에 보낸다
  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setPage(1);
    setter(v);
  };

  const rows = data?.rows ?? [];
  const risk = new Set(data?.riskIds ?? []);
  const s = data?.summary;
  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-display-lg text-on-surface">작업 관리</h1>
          <p className="text-on-surface-variant text-body-md">
            {data?.project.name ?? "—"} · 전체 {(s?.taskCount ?? 0).toLocaleString()}개 작업
          </p>
        </div>
        <Link
          href="/overhaul/upload"
          className="px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-primary text-on-primary hover:opacity-90 transition-opacity"
        >
          <Icon name="add" className="text-base" />
          작업 추가
        </Link>
      </div>

      <Card lift={false} className="p-card-padding">
        {/* 필터 바 */}
        <div className="flex flex-col lg:flex-row gap-3 mb-5">
          <div className="flex-1 flex items-center gap-2 bg-surface-container-low rounded-xl px-4 h-11 border border-transparent focus-within:border-primary focus-within:bg-surface-container-lowest transition-colors">
            <Icon name="search" className="text-on-surface-variant text-base" />
            <input
              value={q}
              onChange={(e) => reset(setQ)(e.target.value)}
              placeholder="작업명, 규격 검색 (여러 낱말로 좁힐 수 있습니다)"
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </div>
          <select
            value={field}
            onChange={(e) => reset(setField)(e.target.value)}
            className="h-11 px-4 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-semibold outline-none focus:border-primary"
          >
            {["전체", "기계", "전기", "제어"].map((f) => (
              <option key={f} value={f}>
                {f === "전체" ? "분야: 전체" : f}
              </option>
            ))}
          </select>
          <select
            value={equipment}
            onChange={(e) => reset(setEquipment)(e.target.value)}
            className="h-11 px-4 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-semibold outline-none focus:border-primary"
          >
            {["전체", ...(data?.equipmentOptions ?? [])].map((eq) => (
              <option key={eq} value={eq}>
                {eq === "전체" ? "설비: 전체" : eq}
              </option>
            ))}
          </select>
        </div>

        {/* 테이블 */}
        {loading && !data ? (
          <p className="py-16 text-center text-sm text-on-surface-variant">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={s?.taskCount ? "search_off" : "table_rows"}
            title={s?.taskCount ? "조건에 맞는 작업이 없습니다" : "등록된 작업이 없습니다"}
            desc={
              s?.taskCount
                ? "검색어나 필터를 바꿔 보세요."
                : "업로드 분석에서 설계내역서 엑셀을 넣으면 작업항목이 여기에 쌓입니다."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[860px]">
              <thead>
                <tr className="text-on-surface-variant text-[12px] font-semibold uppercase tracking-widest border-b border-border-subtle">
                  <th className="pb-3 pr-3">설비 / 작업명</th>
                  <th className="pb-3 px-3">규격</th>
                  <th className="pb-3 px-3">계획수량</th>
                  <th className="pb-3 px-3 w-40">진행률</th>
                  <th className="pb-3 px-3">상태</th>
                  <th className="pb-3 px-3">담당자</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((t) => {
                  const p = taskProgress(t);
                  const status =
                    p >= 100 ? "완료" : risk.has(t.id) ? "지연" : p > 0 ? "진행중" : "대기";
                  return (
                    <tr
                      key={t.id}
                      onClick={() => router.push(`/overhaul/entry?task=${t.id}`)}
                      title="눌러서 실적 입력으로 이동"
                      className="group cursor-pointer hover:bg-surface-container-low transition-colors"
                    >
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-2 mb-0.5">
                          <FieldChip field={t.field ?? "미분류"} />
                          {t.tag && (
                            <span className="font-mono-data text-xs text-on-surface-variant">
                              {t.tag}
                            </span>
                          )}
                          {t.needs_review && (
                            <span
                              className="text-status-warning text-xs font-bold"
                              title="수량·단위·분야가 불명확해 확인이 필요한 항목"
                            >
                              확인 필요
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-on-surface text-sm group-hover:text-primary transition-colors">
                          {t.name}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          {t.equipment_type ?? "기타"}
                          {t.sheet_name ? ` · ${t.sheet_name}` : ""}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-sm text-on-surface-variant max-w-[180px]">
                        {t.spec || "—"}
                      </td>
                      <td className="py-3 px-3 font-mono-data text-sm whitespace-nowrap">
                        {Number(t.plan_qty).toLocaleString()} {t.unit ?? ""}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            value={p}
                            color={status === "지연" ? "error" : "primary"}
                            height="h-1.5"
                            className="flex-1"
                          />
                          <span className="text-xs font-bold tabular-nums w-10 text-right">
                            {p}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <StatusChip status={status} />
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={t.assignee} />
                          <span className="text-sm whitespace-nowrap">
                            {t.assignee || <span className="text-on-surface-variant">미지정</span>}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border-subtle text-sm">
            <span className="text-on-surface-variant">
              {from}–{to} / 총 {data.total}건
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page === 1}
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-surface-container-high disabled:opacity-30"
              >
                <Icon name="chevron_left" />
              </button>
              <span className="px-3 font-semibold">
                {data.page} / {data.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={data.page >= data.totalPages}
                className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-surface-container-high disabled:opacity-30"
              >
                <Icon name="chevron_right" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* 하단 요약 지표 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter">
        <Card className="p-card-padding">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">
            전체 완료율
          </p>
          <p className="text-2xl font-black text-primary">{s?.overall ?? 0}%</p>
          <ProgressBar value={s?.overall ?? 0} className="mt-2" height="h-1.5" />
        </Card>
        <Card className="p-card-padding">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">
            지연 위험
          </p>
          <p className="text-2xl font-black text-error">
            {String(s?.riskCount ?? 0).padStart(2, "0")}
          </p>
          <p className="text-xs text-error mt-1">즉시 조치 필요</p>
        </Card>
        <Card className="p-card-padding">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">
            투입 인원
          </p>
          <p className="text-2xl font-black text-on-surface">{s?.personnel ?? 0}명</p>
          <p className="text-xs text-on-surface-variant mt-1">담당 지정 기준</p>
        </Card>
        <Card className="p-card-padding">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-2">
            잔여 기간
          </p>
          <p className="text-2xl font-black text-on-surface">{s?.remainingDays ?? 0}일</p>
          <p className="text-xs text-on-surface-variant mt-1">
            {s?.endDate ? `~ ${s.endDate}` : "계약기간 미설정"}
          </p>
        </Card>
      </div>
    </>
  );
}
