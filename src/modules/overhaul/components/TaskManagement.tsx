"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  Icon,
  StatusChip,
  ScreenHeader,
  ButtonLink,
  Button,
  FieldChip,
  Avatar,
  EmptyState,
  ProgressBar,
  LoadingState,
} from "@/shared/components/ui";
import { taskProgress } from "../lib/progress";
import TaskEditor from "./TaskEditor";
import EntryDialog from "./EntryDialog";
import { useEntryHistoryHover } from "./EntryHistoryPreview";
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
  const [q, setQ] = useState("");
  const [field, setField] = useState("전체");
  const [equipment, setEquipment] = useState("전체");
  const [onlyReview, setOnlyReview] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditTarget>(null);
  /** 실적 입력 팝업을 띄운 작업 id — null 이면 닫힘 */
  const [entryTaskId, setEntryTaskId] = useState<string | null>(null);
  /** 행에 마우스를 올리면 정비 이력을 먼저 보여 주는 미리보기 */
  const { bind: bindHistory, preview: historyPreview, hide: hideHistory } = useEntryHistoryHover();

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
      <ScreenHeader
        icon="format_list_bulleted"
        title="작업 목록"
        desc={`${data?.project.name ?? "—"} · 전체 ${(s?.taskCount ?? 0).toLocaleString()}개 작업`}
        bullets={[]}
        tone="soft"
        actionOnMobile
        action={
          <>
            <ButtonLink href="/overhaul/tasks/upload" variant="ghost">
              <Icon name="upload_file" className="text-base" />
              엑셀로 일괄 추가
            </ButtonLink>
            <Button onClick={() => setEdit("new")}>
              <Icon name="add" className="text-base" />
              작업 추가
            </Button>
          </>
        }
      />

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

      {historyPreview}

      {entryTaskId && (
        <EntryDialog
          taskId={entryTaskId}
          onClose={() => setEntryTaskId(null)}
          onChanged={() => void load()}
        />
      )}

      <Card lift={false} className="p-card-padding">
        {/* 필터 바 */}
        <div className="flex flex-col lg:flex-row gap-3 mb-5">
          <div className="flex-1 flex items-center gap-2 bg-surface-container-low rounded-xl px-4 h-11 min-h-11 border border-transparent focus-within:border-primary focus-within:bg-surface-container-lowest transition-colors">
            <Icon name="search" className="text-on-surface-variant text-base" />
            <input aria-label="작업명, 규격 검색 (여러 낱말로 좁힐 수 있습니다)"
              value={q}
              onChange={(e) => reset(setQ)(e.target.value)}
              placeholder="작업명, 규격 검색 (여러 낱말로 좁힐 수 있습니다)"
              className="flex-1 self-stretch min-w-0 bg-transparent outline-none text-sm"
            />
          </div>
          <select aria-label="분야"
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
          <select aria-label="설비"
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
                ? "bg-status-warning/15 text-status-warning-text border-status-warning/40"
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
          <LoadingState />
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
          <>
          {/* 폰(md 미만) — 표는 폭이 860px 이상이라 옆으로 밀어야 해서 카드 목록으로 보인다.
              카드를 누르면 같은 실적 입력 팝업이 뜨고, 연필 버튼은 작업 수정 창을 연다 */}
          <ul className="md:hidden flex flex-col divide-y divide-border-subtle -mx-1">
            {rows.map((t) => {
              const p = taskProgress(t);
              const status = p >= 100 ? "완료" : risk.has(t.id) ? "지연" : p > 0 ? "진행중" : "대기";
              const open = () => setEntryTaskId(t.id);
              return (
                <li
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      open();
                    }
                  }}
                  className="py-3 px-1 flex flex-col gap-1.5 text-center cursor-pointer active:bg-surface-container-low focus-visible:bg-surface-container-low outline-none"
                >
                  <div className="flex items-center justify-center gap-2 min-w-0">
                    <FieldChip field={t.field ?? "미분류"} />
                    {t.tag && (
                      <span className="font-mono-data text-xs text-on-surface-variant truncate">{t.tag}</span>
                    )}
                    {t.needs_review && (
                      <span className="text-status-warning-text text-xs font-bold shrink-0">확인 필요</span>
                    )}
                    <span className="shrink-0">
                      <StatusChip status={status} />
                    </span>
                  </div>
                  <p className="font-semibold text-on-surface text-sm break-keep">{t.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {[
                      t.equipment_type ?? "기타",
                      t.sheet_name,
                      t.spec,
                      `계획 ${Number(t.plan_qty).toLocaleString()} ${t.unit ?? ""}`.trim(),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="flex items-center gap-2">
                    <ProgressBar
                      value={p}
                      color={status === "지연" ? "error" : "primary"}
                      height="h-1.5"
                      className="flex-1"
                    />
                    <span className="text-xs font-bold tabular-nums w-10 text-right">{p}%</span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Avatar name={t.assignee} />
                    <span className="text-sm">
                      {t.assignee || <span className="text-on-surface-variant">미지정</span>}
                    </span>
                    <button
                      type="button"
                      aria-label="이 작업 수정·삭제"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEdit(t);
                      }}
                      className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-colors"
                    >
                      <Icon name="edit" className="text-base" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="max-md:hidden overflow-x-auto">
            <table className="w-full text-left min-w-[860px]">
              <thead>
                <tr className="text-on-surface-variant text-[12px] md:text-[13px] font-semibold uppercase tracking-widest border-b border-border-subtle">
                  <th className="pb-3 px-3 text-center text-center">설비 / 작업명</th>
                  <th className="pb-3 px-3 text-center">규격</th>
                  <th className="pb-3 px-3 text-center">계획수량</th>
                  <th className="pb-3 px-3 text-center w-40">진행률</th>
                  <th className="pb-3 px-3 text-center">상태</th>
                  <th className="pb-3 px-3 text-center">담당자</th>
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
                      {...bindHistory(t.id)}
                      onClick={() => {
                        hideHistory();
                        setEntryTaskId(t.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return; // 안쪽 버튼의 키 입력은 제외
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setEntryTaskId(t.id);
                        }
                      }}
                      tabIndex={0}
                      title="눌러서 실적 입력 · 올려 두면 정비 이력"
                      className="group cursor-pointer hover:bg-surface-container-low transition-colors"
                    >
                      <td className="py-3 px-3 text-center text-center">
                        <div className="flex items-center justify-center gap-2 mb-0.5">
                          <FieldChip field={t.field ?? "미분류"} />
                          {t.tag && (
                            <span className="font-mono-data text-xs text-on-surface-variant">
                              {t.tag}
                            </span>
                          )}
                          {t.needs_review && (
                            <span
                              className="text-status-warning-text text-xs font-bold"
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
                      <td className="py-3 px-3 text-center text-sm text-on-surface-variant max-w-[180px]">
                        {t.spec || "—"}
                      </td>
                      <td className="py-3 px-3 text-center font-mono-data text-sm whitespace-nowrap">
                        {Number(t.plan_qty).toLocaleString()} {t.unit ?? ""}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-2">
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
                      <td className="py-3 px-3 text-center">
                        <StatusChip status={status} />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Avatar name={t.assignee} />
                          <span className="text-sm whitespace-nowrap">
                            {t.assignee || <span className="text-on-surface-variant">미지정</span>}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          title="이 작업 수정·삭제"
                          onClick={(e) => {
                            // 행 클릭(실적 입력 팝업)과 겹치지 않게 막는다
                            e.stopPropagation();
                            setEdit(t);
                          }}
                          className="mx-auto w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-colors"
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
          </>
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
                aria-label="이전 쪽"
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-surface-container-high disabled:opacity-30"
              >
                <Icon name="chevron_left" />
              </button>
              <span className="px-3 font-semibold">
                {data.page} / {data.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={data.page >= data.totalPages}
                aria-label="다음 쪽"
                className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-surface-container-high disabled:opacity-30"
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
