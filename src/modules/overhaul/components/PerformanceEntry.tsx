"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Button, Icon, StatusChip, FieldChip, ProgressBar, EmptyState } from "@/shared/components/ui";
import { taskProgress, taskStatus } from "../lib/progress";
import { compressImage, formatBytes } from "../lib/imageCompress";
import type { OverhaulTask, OverhaulEntry } from "../lib/repo";

/**
 * 실적 입력 — 일자별 완료수량·작업내용·지연사유·분해 전후 사진을 기록하고,
 * 항목별 정비 이력 타임라인으로 되짚어 본다.
 *
 * 원본(legacy/plantsync/src/pages/PerformanceEntry.jsx)은 브라우저 상태에
 * entries 배열을 직접 얹었지만, 여기서는 overhaul_entry 테이블에 날짜별로 저장하고
 * 서버가 task.done_qty(누적 최댓값)를 다시 계산한다.
 */

const DELAY_REASONS = ["지연 없음", "자재/부품 입고 지연", "인력 부족", "선행 공정 지연", "설비 이상 발견", "기상 조건", "기타"];

interface TaskOption {
  id: string;
  name: string;
  equipment_type: string | null;
}

/**
 * 사진 한 장. 이미 저장된 것(id)과 방금 고른 것(dataUrl)이 한 목록에 섞인다.
 *
 * 화면은 저장된 사진의 이미지 데이터를 들고 있지 않다 — 목록 응답에서 뺐기 때문이다.
 * 그래서 "남길 사진"은 id로만 지목하고, 저장할 때 서버에 id 목록 + 새 사진만 보낸다.
 */
interface PhotoItem {
  /** React key (저장된 건 "p12", 새 건 "n3" 꼴) */
  key: string;
  /** 저장된 사진이면 그 id */
  id?: number;
  /** 방금 골라 줄인 사진 (data URL) */
  dataUrl?: string;
  /** "4.2MB → 310KB" 안내 (새 사진만) */
  note?: string;
}

interface FormState {
  date: string;
  doneToday: string;
  cumulative: number;
  notes: string;
  delayReason: string;
  plan: string;
  before: PhotoItem[];
  after: PhotoItem[];
  existing: boolean;
}

/** 저장된 사진 주소. id가 곧 그 사진이라(덮어쓰지 않는다) 캐시 무효화가 필요 없다 */
const savedPhotoUrl = (id: number) => `/api/overhaul/photos/one?id=${id}`;
const thumbOf = (it: PhotoItem) => it.dataUrl ?? savedPhotoUrl(it.id!);

/** 한 슬롯 최대 장수 — 한 번에 저장할 요청 크기를 감당할 만큼만 */
const MAX_PER_SLOT = 8;
/** 새 사진을 한 번에 보낼 수 있는 총량. 넘으면 먼저 저장하라고 안내한다 */
const MAX_NEW_BYTES = 3_500_000;

/**
 * 사진 묶음 한 칸 (분해 전 또는 분해 후).
 *
 * 여러 장을 넣을 수 있다. 고른 사진은 올리기 전에 브라우저에서 줄인다
 * (imageCompress.ts) — 폰 사진을 그대로 보내면 요청 본문 한계에 걸려 저장이 통째로
 * 실패하기 때문이다. 사용자는 아무것도 안 해도 되고, 얼마나 줄었는지만 알려 준다.
 */
function PhotoGroup({
  label,
  items,
  onChange,
  onError,
}: {
  label: string;
  items: PhotoItem[];
  onChange: (next: PhotoItem[]) => void;
  onError: (msg: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState<string | null>(null);

  const pick = async (files: File[]) => {
    onError(null);
    const room = MAX_PER_SLOT - items.length;
    if (room <= 0) {
      onError(`${label}은 최대 ${MAX_PER_SLOT}장까지 넣을 수 있습니다.`);
      return;
    }
    const take = files.slice(0, room);
    if (files.length > room) {
      onError(`${label}은 최대 ${MAX_PER_SLOT}장까지라 ${room}장만 넣었습니다.`);
    }

    const added: PhotoItem[] = [];
    for (let i = 0; i < take.length; i++) {
      setWorking(take.length > 1 ? `사진 줄이는 중… (${i + 1}/${take.length})` : "사진 줄이는 중…");
      try {
        const out = await compressImage(take[i]);
        added.push({
          key: `n${Date.now()}-${i}`,
          dataUrl: out.dataUrl,
          note: `${formatBytes(out.originalBytes)} → ${formatBytes(out.bytes)}`,
        });
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
        break;
      }
    }
    setWorking(null);
    if (added.length) onChange([...items, ...added]);
  };

  const remove = (key: string) => onChange(items.filter((x) => x.key !== key));

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-bold text-on-surface">{label}</span>
        <span className="text-[11px] text-on-surface-variant">
          {items.length}/{MAX_PER_SLOT}장
        </span>
      </div>

      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void pick(files);
        }}
      />

      <div className="grid grid-cols-3 gap-2">
        {items.map((it) => (
          <div key={it.key} className="relative group aspect-[4/3] rounded-lg overflow-hidden bg-surface-container-low">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbOf(it)} alt={label} loading="lazy" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => remove(it.key)}
              title="이 사진 빼기"
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-error transition-colors"
            >
              <Icon name="close" className="text-sm" />
            </button>
            {it.note && (
              <span className="absolute bottom-0 left-0 right-0 bg-black/55 text-white text-[9px] text-center py-0.5">
                {it.note}
              </span>
            )}
          </div>
        ))}

        {items.length < MAX_PER_SLOT && (
          <button
            type="button"
            disabled={!!working}
            onClick={() => ref.current?.click()}
            className="aspect-[4/3] rounded-lg border-2 border-dashed border-outline-variant bg-surface-container-low hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-0.5 disabled:opacity-60"
          >
            <Icon
              name={working ? "hourglass_top" : "add_a_photo"}
              className="text-xl text-on-surface-variant"
            />
            <span className="text-[10px] font-semibold text-on-surface-variant px-1 text-center leading-tight">
              {working ?? "사진 추가"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function HistoryTimeline({
  photoVersion,
  entries,
  unit,
  planQty,
  activeDate,
  onPick,
  onDelete,
}: {
  /** 사진을 덮어썼을 때 썸네일 캐시를 비우기 위한 값 */
  photoVersion: number;
  entries: OverhaulEntry[];
  unit: string;
  planQty: number;
  activeDate: string;
  onPick: (date: string) => void;
  onDelete: (date: string) => void;
}) {
  // 날짜 오름차순으로 훑어야 "그날 증가분"을 직전 누적과의 차이로 구할 수 있다
  const ascending = useMemo(() => [...entries].sort((a, b) => (a.entry_date < b.entry_date ? -1 : 1)), [entries]);
  const withDelta = useMemo(() => {
    let prior = 0;
    return ascending.map((e) => {
      const doneToday = Math.max(0, e.done_qty - prior);
      prior = e.done_qty;
      return { ...e, doneToday };
    });
  }, [ascending]);
  const descending = useMemo(() => [...withDelta].reverse(), [withDelta]);

  if (!entries.length) {
    return (
      <Card lift={false} className="p-card-padding">
        <h2 className="text-title-sm text-on-surface flex items-center gap-2 mb-3">
          <Icon name="history" className="text-base text-primary" /> 정비 이력
        </h2>
        <p className="text-sm text-on-surface-variant py-3 text-center">
          아직 저장된 실적 이력이 없습니다. 위에서 일자별로 실적을 기록하세요.
        </p>
      </Card>
    );
  }

  return (
    <Card lift={false} className="p-card-padding">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-title-sm text-on-surface flex items-center gap-2">
          <Icon name="history" className="text-base text-primary" /> 정비 이력
          <span className="text-xs font-normal text-on-surface-variant">{entries.length}건</span>
        </h2>
        <span className="text-xs text-on-surface-variant">행을 클릭하면 해당 일자를 불러와 수정합니다</span>
      </div>
      <div className="relative pl-5">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border-subtle" />
        <ul className="space-y-1">
          {descending.map((e) => {
            const rate = planQty > 0 ? Math.min(100, Math.round((e.done_qty / planQty) * 1000) / 10) : 0;
            const active = e.entry_date === activeDate;
            const delayed = Boolean(e.delay_reason && e.delay_reason !== "지연 없음");
            return (
              <li key={e.entry_date} className="relative">
                <span
                  className={`absolute -left-5 top-3.5 w-3.5 h-3.5 rounded-full border-2 border-surface ${
                    active ? "bg-primary" : delayed ? "bg-status-error" : "bg-status-success"
                  }`}
                />
                <button
                  onClick={() => onPick(e.entry_date)}
                  className={`w-full text-left rounded-xl p-3 transition-colors border ${
                    active ? "bg-primary/5 border-primary/30" : "border-transparent hover:bg-surface-container-low"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono-data text-sm font-bold text-on-surface">{e.entry_date}</span>
                      {e.doneToday > 0 && (
                        <span className="text-xs font-bold text-primary whitespace-nowrap">
                          +{e.doneToday} {unit}
                        </span>
                      )}
                      <span className="text-xs text-on-surface-variant whitespace-nowrap">
                        누적 {e.done_qty}/{planQty} · {rate}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(e.has_photo_before || e.has_photo_after) && (
                        <Icon name="photo_library" className="text-sm text-on-surface-variant" />
                      )}
                      {delayed && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-status-error/10 text-status-error">
                          지연
                        </span>
                      )}
                      <span
                        role="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (confirm(`${e.entry_date} 실적 이력을 삭제할까요?`)) onDelete(e.entry_date);
                        }}
                        className="text-on-surface-variant hover:text-error p-1 rounded"
                        title="이 이력 삭제"
                      >
                        <Icon name="delete" className="text-sm" />
                      </span>
                    </div>
                  </div>
                  {(e.work_detail || e.next_plan || delayed) && (
                    <div className="mt-1.5 text-xs space-y-0.5">
                      {e.work_detail && (
                        <p className="text-on-surface">
                          <span className="text-on-surface-variant">작업: </span>
                          {e.work_detail}
                        </p>
                      )}
                      {delayed && (
                        <p className="text-error">
                          <span className="text-on-surface-variant">지연사유: </span>
                          {e.delay_reason}
                        </p>
                      )}
                      {e.next_plan && <p className="text-on-surface-variant">익일계획: {e.next_plan}</p>}
                    </div>
                  )}
                  {(e.has_photo_before || e.has_photo_after) && (
                    <div className="flex gap-2 mt-2">
                      {/* 사진은 목록 응답에 없다 — 썸네일이 한 장씩 받아 온다
                          (eslint-disable: 외부 최적화 없이 API가 그대로 내려주는 이미지) */}
                      {e.has_photo_before && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={savedPhotoUrl(e.task_id, e.entry_date, "before", photoVersion)}
                          alt="분해 전"
                          loading="lazy"
                          className="w-16 h-12 object-cover rounded-lg"
                        />
                      )}
                      {e.has_photo_after && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={savedPhotoUrl(e.task_id, e.entry_date, "after", photoVersion)}
                          alt="분해 후"
                          loading="lazy"
                          className="w-16 h-12 object-cover rounded-lg"
                        />
                      )}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * 그 날짜 직전에 보고한 누적 (새 날짜 실적의 기준값).
 *
 * 과거 기록 중 "가장 최근 날짜"의 값을 쓴다. 최댓값이 아니다 —
 * 앞선 날짜의 오입력을 정정해도 기준값이 계속 부풀어 있으면 안 되기 때문이다.
 * (서버의 recomputeTaskDoneQty와 같은 기준이어야 화면과 DB가 어긋나지 않는다)
 *
 * entries를 인자로 받는 순수함수라 클로저 지연 문제가 없다.
 */
function priorCumulativeOf(entries: OverhaulEntry[], dateStr: string): number {
  const prev = entries
    .filter((e) => e.entry_date < dateStr)
    .sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
  return prev.length ? prev[0].done_qty : 0;
}

/** 날짜에 해당하는 폼 구성 — 기록이 있으면 로드, 없으면 빈 폼(누적은 직전일 기준) */
function buildFormOf(entries: OverhaulEntry[], dateStr: string): FormState {
  const ex = entries.find((e) => e.entry_date === dateStr);
  if (ex) {
    const prior = priorCumulativeOf(entries, dateStr);
    return {
      date: dateStr,
      doneToday: String(Math.max(0, ex.done_qty - prior)),
      cumulative: ex.done_qty,
      notes: ex.work_detail ?? "",
      delayReason: ex.delay_reason ?? "지연 없음",
      plan: ex.next_plan ?? "",
      before: ex.has_photo_before ? { kind: "kept" } : { kind: "empty" },
      after: ex.has_photo_after ? { kind: "kept" } : { kind: "empty" },
      existing: true,
    };
  }
  return {
    date: dateStr,
    doneToday: "",
    cumulative: priorCumulativeOf(entries, dateStr),
    notes: "",
    delayReason: "지연 없음",
    plan: "",
    before: { kind: "empty" },
    after: { kind: "empty" },
    existing: false,
  };
}

export default function PerformanceEntry() {
  const router = useRouter();
  const sp = useSearchParams();

  const [options, setOptions] = useState<TaskOption[] | null>(null);
  /** 작업 목록 검색어 — 목록에 상한이 있어 수천 건이면 좁혀서 찾아야 한다 */
  const [optionQuery, setOptionQuery] = useState("");
  const [optionsTruncated, setOptionsTruncated] = useState(false);
  const [task, setTask] = useState<OverhaulTask | null>(null);
  const [entries, setEntries] = useState<OverhaulEntry[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** 사진을 덮어썼을 때 <img> 캐시를 비우기 위한 값 */
  const [photoVersion, setPhotoVersion] = useState(0);

  const selectedId = sp.get("task");

  const priorCumulative = useCallback((dateStr: string) => priorCumulativeOf(entries, dateStr), [entries]);
  const buildForm = useCallback((dateStr: string) => buildFormOf(entries, dateStr), [entries]);

  // 작업 목록 로드. 검색어가 바뀌면 다시 읽는다.
  // 선택된 작업은 검색 결과 밖이어도 서버가 끼워 넣어 준다(include) —
  // 안 그러면 선택칸이 빈 것처럼 보인다.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(
      () => {
        void (async () => {
          const sp = new URLSearchParams();
          if (optionQuery.trim()) sp.set("q", optionQuery.trim());
          if (selectedId) sp.set("include", selectedId);
          const json = await (await fetch(`/api/overhaul/task-options?${sp}`)).json();
          if (!alive || !json.ok) return;
          setOptions(json.options);
          setOptionsTruncated(!!json.truncated);
        })();
      },
      optionQuery ? 250 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [optionQuery, selectedId]);

  // 선택된 작업이 없으면 첫 항목으로 이동
  useEffect(() => {
    if (options && options.length && !selectedId) {
      router.replace(`/overhaul/entry?task=${options[0].id}`);
    }
  }, [options, selectedId, router]);

  // 작업 상세 + 이력 로드
  const initializedTaskId = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const json = await (await fetch(`/api/overhaul/entries?taskId=${selectedId}`)).json();
      if (json.ok) {
        setTask(json.task);
        setEntries(json.entries);
        // 작업을 새로 선택했을 때만 오늘 날짜로 폼을 초기화한다.
        // (저장·삭제로 entries가 갱신될 때마다 폼이 오늘 날짜로 튀면 안 되므로
        //  여기서 한 번만 하고, 저장/삭제 핸들러가 각자 폼을 책임진다.)
        if (initializedTaskId.current !== selectedId) {
          initializedTaskId.current = selectedId;
          setForm(buildFormOf(json.entries, today()));
          setSaved(false);
        }
      }
      setLoading(false);
    })();
  }, [selectedId]);

  const changeDate = useCallback(
    (dateStr: string) => {
      setForm(buildForm(dateStr));
      setSaved(false);
    },
    [buildForm],
  );

  const onDoneToday = useCallback(
    (v: string) => {
      if (!form) return;
      const n = v === "" ? 0 : Number(v);
      const base = priorCumulative(form.date);
      const plan = task?.plan_qty ?? Infinity;
      setForm({ ...form, doneToday: v, cumulative: Math.min(plan, base + n) });
      setSaved(false);
    },
    [form, priorCumulative, task],
  );

  /**
   * 사진 칸 하나를 저장 본문으로 옮긴다.
   *   kept  → 키를 아예 안 넣는다 (서버가 저장된 사진을 그대로 둔다)
   *   new   → 줄인 data URL
   *   그 외 → null (지운다)
   */
  const photoField = (key: string, st: PhotoSlotState) => {
    if (st.kind === "kept") return {};
    return { [key]: st.kind === "new" ? st.dataUrl : null };
  };

  const submit = useCallback(async () => {
    if (!task || !form) return;
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/overhaul/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          date: form.date,
          cumulative: Math.min(task.plan_qty, Number(form.cumulative) || 0),
          workDetail: form.notes,
          delayReason: form.delayReason,
          nextPlan: form.plan,
          ...photoField("photoBefore", form.before),
          ...photoField("photoAfter", form.after),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(
          json.error ??
            (res.status === 413
              ? "사진이 너무 커서 저장하지 못했습니다. 사진을 다시 골라 주세요."
              : "저장에 실패했습니다."),
        );
      }
      setTask(json.task);
      setEntries(json.entries);
      // 방금 바꾼 사진이 저장됐으니 이제 "저장된 사진"으로 본다.
      // photoVersion을 올려야 <img>가 캐시된 옛 사진을 다시 쓰지 않는다.
      setPhotoVersion((v) => v + 1);
      setForm((f) =>
        f
          ? {
              ...f,
              existing: true,
              before: f.before.kind === "new" ? { kind: "kept" } : f.before.kind === "cleared" ? { kind: "empty" } : f.before,
              after: f.after.kind === "new" ? { kind: "kept" } : f.after.kind === "cleared" ? { kind: "empty" } : f.after,
            }
          : f,
      );
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [task, form]);

  const removeEntryDate = useCallback(
    async (date: string): Promise<OverhaulEntry[] | null> => {
      if (!task) return null;
      const json = await (
        await fetch(`/api/overhaul/entries?taskId=${task.id}&date=${date}`, { method: "DELETE" })
      ).json();
      if (json.ok) {
        setTask(json.task);
        setEntries(json.entries);
        return json.entries;
      }
      return null;
    },
    [task],
  );

  if (loading || options === null) {
    return <p className="py-20 text-center text-sm text-on-surface-variant">불러오는 중…</p>;
  }

  if (!options.length) {
    return (
      <>
        <h1 className="text-display-lg text-on-surface pt-2">실적 입력</h1>
        <Card lift={false} className="p-0">
          <EmptyState
            icon="edit_note"
            title="입력할 작업이 없습니다"
            desc="먼저 업로드 분석에서 설계내역서를 올려 작업항목을 만드세요."
          />
        </Card>
      </>
    );
  }

  if (!task || !form) return null;

  const p = taskProgress(task);

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-display-lg text-on-surface">실적 입력</h1>
          <p className="text-on-surface-variant text-body-md">
            일자별로 실적·사진을 기록하면 그날 기록으로 저장됩니다. 다른 날짜를 선택하면 그 날짜의 기록을 불러옵니다.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-surface-container-low rounded-xl px-4 h-11 border border-transparent focus-within:border-primary transition-colors md:max-w-xs">
            <Icon name="search" className="text-on-surface-variant text-base" />
            <input
              value={optionQuery}
              onChange={(e) => setOptionQuery(e.target.value)}
              placeholder="작업 찾기"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm"
            />
          </div>
          <select
            value={task.id}
            onChange={(e) => router.push(`/overhaul/entry?task=${e.target.value}`)}
            className="h-11 px-4 rounded-xl bg-surface-container-low border border-border-subtle text-sm font-semibold outline-none focus:border-primary w-full md:max-w-xs truncate"
          >
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                [{t.equipment_type ?? "기타"}] {t.name}
              </option>
            ))}
          </select>
          {optionsTruncated && (
            <p className="text-[11px] text-on-surface-variant md:max-w-xs">
              작업이 많아 목록을 일부만 보여줍니다 — 위에서 검색해 좁히세요.
            </p>
          )}
        </div>
      </div>

      {/* 작업 헤더 */}
      <Card className="p-card-padding">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FieldChip field={task.field ?? "미분류"} />
              {task.tag && <span className="font-mono-data text-xs text-on-surface-variant">{task.tag}</span>}
            </div>
            <h2 className="text-headline-md-mobile md:text-headline-md text-on-surface">{task.name}</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              {task.equipment_type ?? "기타"} · {task.spec || "—"} · 계획수량{" "}
              <b className="text-on-surface font-mono-data">
                {task.plan_qty.toLocaleString()} {task.unit}
              </b>
            </p>
          </div>
          <div className="text-right shrink-0">
            <StatusChip status={taskStatus(task)} />
            <p className="text-2xl font-black text-primary mt-2">{p}%</p>
          </div>
        </div>
        <ProgressBar value={p} height="h-2" />
      </Card>

      {/* 입력 폼 */}
      <Card className="p-card-padding space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="입력일자">
            <input
              type="date"
              value={form.date}
              onChange={(e) => changeDate(e.target.value)}
              className="input"
            />
          </Field>
          <Field label={`금일 완료 (${task.unit})`}>
            <input
              type="number"
              min="0"
              value={form.doneToday}
              onChange={(e) => onDoneToday(e.target.value)}
              placeholder="0"
              className="input"
            />
          </Field>
          <Field label={`누적 완료수량 (${task.unit})`}>
            <input
              type="number"
              min="0"
              max={task.plan_qty}
              value={form.cumulative}
              onChange={(e) => setForm({ ...form, cumulative: Number(e.target.value) })}
              className="input"
            />
          </Field>
        </div>

        <Field label="금일 작업내용">
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="주요 작업내용, 특이사항 등을 입력하세요."
            className="input resize-none"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="지연 사유 (선택)">
            <select
              value={form.delayReason}
              onChange={(e) => setForm({ ...form, delayReason: e.target.value })}
              className="input"
            >
              {DELAY_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="익일 계획 / 조치계획">
            <input
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
              placeholder="다음 작업 계획을 입력하세요."
              className="input"
            />
          </Field>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            분해 전 / 후 사진
            <span className="ml-2 text-xs font-normal text-on-surface-variant">
              고르면 자동으로 줄여서 올립니다 — 미리 크기를 조절할 필요 없습니다
            </span>
          </label>
          <div className="flex gap-4 mt-2">
            <PhotoSlot
              label="분해 전 (BEFORE)"
              state={form.before}
              savedSrc={savedPhotoUrl(task.id, form.date, "before", photoVersion)}
              onChange={(v) => {
                setForm({ ...form, before: v });
                setSaved(false);
              }}
              onError={setSaveError}
            />
            <PhotoSlot
              label="분해 후 (AFTER)"
              state={form.after}
              savedSrc={savedPhotoUrl(task.id, form.date, "after", photoVersion)}
              onChange={(v) => {
                setForm({ ...form, after: v });
                setSaved(false);
              }}
              onError={setSaveError}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
          <p className="text-sm min-h-[20px]">
            {saveError && (
              <span className="text-error flex items-center gap-1.5">
                <Icon name="error" className="text-base" /> {saveError}
              </span>
            )}
            {!saveError && saved && (
              <span className="text-status-success flex items-center gap-1.5">
                <Icon name="check_circle" className="text-base" fill /> {form.date} 실적이 저장되었습니다.
              </span>
            )}
            {!saved && form.existing && (
              <span className="text-on-surface-variant flex items-center gap-1.5">
                <Icon name="history" className="text-base" /> {form.date} 기록을 불러왔습니다. 수정 시 덮어씁니다.
              </span>
            )}
            {!saved && !form.existing && (
              <span className="text-on-surface-variant flex items-center gap-1.5">
                <Icon name="edit_calendar" className="text-base" /> {form.date} 신규 입력 (직전 누적{" "}
                {priorCumulative(form.date)}
                {task.unit} 기준)
              </span>
            )}
          </p>
          <Button onClick={submit} disabled={saving}>
            <Icon name="save" className="text-base" />{" "}
            {saving ? "저장 중…" : form.existing ? "이 날짜 수정 저장" : "이 날짜로 저장"}
          </Button>
        </div>
      </Card>

      {/* 정비 이력 타임라인 */}
      <HistoryTimeline
        photoVersion={photoVersion}
        entries={entries}
        unit={task.unit ?? ""}
        planQty={task.plan_qty}
        activeDate={form.date}
        onPick={changeDate}
        onDelete={(d) => {
          void (async () => {
            const fresh = await removeEntryDate(d);
            // buildForm(d)는 컴포넌트 state(entries)가 갱신된 뒤에야 최신값을 반영하므로,
            // 삭제 응답으로 받은 fresh 배열을 직접 넣어 방금 지운 값이 잠깐이라도 남아 보이지 않게 한다.
            if (d === form.date && fresh) setForm(buildFormOf(fresh, d));
          })();
        }}
      />

      <p className="text-xs text-on-surface-variant flex items-start gap-2 px-1">
        <Icon name="info" className="text-sm mt-0.5" />
        일자별 기록은 각각 저장되어 <b className="text-on-surface">정비 이력</b>으로 누적됩니다. 누적 완료수량
        기준으로 설비별·분야별 진행률이 재계산됩니다.
      </p>
    </>
  );
}
