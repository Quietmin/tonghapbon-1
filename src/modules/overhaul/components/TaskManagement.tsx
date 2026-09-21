"use client";

import { useCallback, useEffect, useState } from "react";
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
import TaskEditor from "./TaskEditor";
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
    /** 수량·단위·분야가 불명확해 사람이 확인해야 하는 항목 수 (PRD 6.8) */
    reviewCount: number;
    remainingDays: number;
    endDate: string | null;
    expected: number;
  };
}

/** 편집 패널 상태 — null이면 닫힘, "new"면 추가, 그 외는 그 작업 수정 */
type EditTarget = OverhaulTask | "new" | null;

export default function TaskManagement() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [field, setField] = useState("전체");
  const [equipment, setEquipment] = useState("전체");
  const [onlyReview, setOnlyReview] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditTarget>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), field, equipment, q });
    if (onlyReview) sp.set("needsReview", "1");
    const res = await fetch(`/api/overhaul/tasks?${sp}`);
    const json = await res.json();
    if (json.ok) setData(json);
    setLoading(false);
  }, [page, field, equipment, q, onlyReview]);

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
        <div className="flex items-center gap-2">
          <a
            href="/overhaul/upload"
            className="px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-border-subtle transition-colors"
          >
            <Icon name="upload_file" className="text-base" />
            엑셀로 일괄 추가
          </a>
          <button
            onClick={() => setEdit("new")}
            className="px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-primary text-on-primary hover:opacity-90 transition-opacity"
          >
            <Icon name="add" className="text-base" />
            작업 추가
          </button>
        </div>
      </div>

      {edit && (
        <TaskEditor
          task={edit === "new" ? null : edit}
          equipmentOptions={data?.equipmentOptions ?? []}
          onCancel={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            void load();
          }}
          onDeleted={() => {
            setEdit(null);
            void load();
          }}
        />
      )}

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
          <button
            onClick={() => reset(setOnlyReview)(!onlyReview)}
            title="수량·단위·분야가 불명확해 사람이 확인해야 하는 항목만 봅니다"
            className={`h-11 px-4 rounded-xl text-sm font-bold flex items-center gap-1.5 whitespace-nowrap transition-colors border ${
              onlyReview
                ? "bg-status-warning/15 text-status-warning border-status-warning/40"
                : "bg-surface-container-low text-on-surface-variant border-border-subtle hover:bg-surface-container-high"
            }`}
          >
            <Icon name={onlyReview ? "filter_alt" : "filter_alt_off"} className="text-base" />
            확인 필요
            {(s?.reviewCount ?? 0) > 0 && <span className="tabular-nums">{s?.reviewCount}</span>}
          </button>
        </div>

        {/* 테이블 */}
        {loading && !data ? (
          <p className="py-16 text-center text-sm text-on-surface-variant">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={s?.taskCount ? (onlyReview ? "verified" : "search_off") : "table_rows"}
            title={
              !s?.taskCount
                ? "등록된 작업이 없습니다"
                : onlyReview
                  ? "확인이 필요한 항목이 없습니다"
                  : "조건에 맞는 작업이 없습니다"
            }
            desc={
              !s?.taskCount
                ? "업로드 분석에서 설계내역서 엑셀을 넣거나, '작업 추가'로 직접 넣으세요."
                : onlyReview
                  ? "수량·단위·분야가 모두 정상으로 인식됐습니다."
                  : "검색어나 필터를 바꿔 보세요."
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
                  <th className="pb-3 pl-3 w-10" />
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
                      <td className="py-3 pl-3">
                        <button
                          title="이 작업 수정·삭제"
                          onClick={(e) => {
                            // 행 클릭(실적 입력 이동)과 겹치지 않게 막는다
                            e.stopPropagation();
                            setEdit(t);
                          }}
                          className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-colors"
                        >
                          <Icon name="edit" className="text-base" />
                        </button>
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
