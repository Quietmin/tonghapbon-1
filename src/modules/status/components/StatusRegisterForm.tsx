"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Icon, RequiredMark } from "@/shared/components/ui";
import { BRANCHES } from "@/shared/lib/branches";
import { DEPARTMENTS } from "../lib/constants";
import { PhotoPicker, type PickedPhoto } from "./StatusPhotos";

const SORTED_BRANCHES = [...BRANCHES].sort((a, b) => a.localeCompare(b, "ko"));

interface FormState {
  branch: string;
  equipmentName: string;
  content: string;
  department: string;
  reporter: string;
}

/** 모두 필수 — 화면에 보이는 이름(빈 칸 안내에 쓴다) */
const LABELS: Record<keyof FormState, string> = {
  branch: "지사",
  equipmentName: "설비명",
  content: "이슈 내용",
  department: "담당부서",
  reporter: "작성자",
};

const EMPTY: FormState = {
  branch: "",
  equipmentName: "",
  content: "",
  department: "",
  reporter: "",
};

/**
 * 현황 등록 — 운영 근무자가 이슈가 생긴 설비를 알리는 화면.
 * 설비명·이슈 내용·담당부서·작성자(+지사)를 적어 등록하면 현황 조회에 '미완료'로
 * 올라가고, 유지보수 담당자가 거기서 조치 상태를 갱신한다. 폰에서도 쓰므로 한 열로 쌓는다.
 *
 * 지사·담당부서는 내 지사·부서(처음 접속 시 고른 값)로 미리 채운다 — 매번 다시 고르지 않게.
 */
export default function StatusRegisterForm({
  initialBranch,
  initialDepartment,
}: {
  /** 내 지사·부서(처음 접속 시 고른 값) — 지사·담당부서를 미리 채운다 */
  initialBranch: string;
  initialDepartment: string;
}) {
  const [form, setForm] = useState<FormState>({
    ...EMPTY,
    branch: initialBranch,
    department: initialDepartment,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<FormState | null>(null);
  /** 첨부 사진(선택) — 브라우저에서 줄인 data URL */
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  /** 이슈는 저장됐지만 사진만 못 저장했을 때의 안내(예: 배포 DB 에 사진 테이블이 아직 없음) */
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);
  const [donePhotoCount, setDonePhotoCount] = useState(0);
  /** 등록을 한 번이라도 시도했는지 / 한 번 거쳐 간 칸 — 비어 있는 필수 칸을 붉게 표시하는 기준 */
  const [attempted, setAttempted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});

  const empty = (k: keyof FormState) => form[k].trim() === "";
  const invalid = (k: keyof FormState) => (attempted || !!touched[k]) && empty(k);
  const touch = (k: keyof FormState) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    // 브라우저 기본 말풍선 대신 직접 검사한다 — 비어 있는 칸을 모두 붉게 보이고 첫 칸으로 이동한다
    const missing = (Object.keys(LABELS) as (keyof FormState)[]).filter(empty);
    if (missing.length > 0) {
      setAttempted(true);
      setError(`필수 항목을 입력해 주세요: ${missing.map((k) => LABELS[k]).join(", ")}`);
      setTimeout(() => document.querySelector<HTMLElement>('form [aria-invalid="true"]')?.focus(), 0);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/status/issues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, photos: photos.map((p) => p.dataUrl) }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "등록하지 못했습니다.");
      setPhotoWarning(typeof json.photoWarning === "string" ? json.photoWarning : null);
      setDonePhotoCount(typeof json.photosSaved === "number" ? json.photosSaved : 0);
      setDone(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Card lift={false} className="p-8 flex flex-col items-center text-center gap-3">
        <Icon name="check_circle" className="text-4xl text-status-success-text" />
        <p className="text-title-sm font-bold text-on-surface">현황이 등록되었습니다</p>
        <p className="text-sm text-on-surface-variant">
          {done.branch} · {done.equipmentName} · {done.department}
          {donePhotoCount > 0 && ` · 사진 ${donePhotoCount}장`}
        </p>
        {photoWarning && (
          <p className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-status-warning/10 text-status-warning-text text-sm font-bold">
            <Icon name="warning" className="text-base" />
            {photoWarning}
          </p>
        )}
        <p className="text-sm text-on-surface-variant">
          현황 조회에 &lsquo;미완료&rsquo;로 올라가며, 유지보수 담당자가 조치 상태를 갱신합니다.
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-2">
          <Button
            variant="ghost"
            onClick={() => {
              // 지사·부서·작성자는 같은 근무자가 이어서 등록하는 경우가 많아 남겨 둔다
              setForm({ ...EMPTY, branch: done.branch, department: done.department, reporter: done.reporter });
              setAttempted(false);
              setTouched({});
              setPhotos([]);
              setPhotoWarning(null);
              setDone(null);
            }}
          >
            <Icon name="add" className="text-base" /> 이어서 등록
          </Button>
          <Link
            href="/status"
            className="px-4 py-2.5 rounded-sm font-bold text-sm inline-flex items-center gap-2 bg-primary text-on-primary hover:opacity-90"
          >
            현황 조회로
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Card lift={false} className="p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-on-surface-variant">
              지사
              <RequiredMark />
            </span>
            <select
              value={form.branch}
              onChange={(e) => set("branch", e.target.value)}
              className="input"
              onBlur={() => touch("branch")}
              aria-invalid={invalid("branch")}
            >
              <option value="">선택</option>
              {SORTED_BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-on-surface-variant">
              담당부서
              <RequiredMark />
            </span>
            <select
              value={form.department}
              onChange={(e) => set("department", e.target.value)}
              className="input"
              onBlur={() => touch("department")}
              aria-invalid={invalid("department")}
            >
              <option value="">선택</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-on-surface-variant">
              설비명
              <RequiredMark />
            </span>
            <input
              value={form.equipmentName}
              onChange={(e) => set("equipmentName", e.target.value)}
              placeholder="예: 1호기 순환펌프"
              className="input"
              onBlur={() => touch("equipmentName")}
              aria-invalid={invalid("equipmentName")}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-on-surface-variant">
              작성자
              <RequiredMark />
            </span>
            <input
              value={form.reporter}
              onChange={(e) => set("reporter", e.target.value)}
              placeholder="이름을 입력하세요."
              className="input"
              onBlur={() => touch("reporter")}
              aria-invalid={invalid("reporter")}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-on-surface-variant">
              이슈 내용
              <RequiredMark />
            </span>
          <textarea
            value={form.content}
            onChange={(e) => set("content", e.target.value)}
            rows={5}
            placeholder="어떤 설비에서 무슨 일이 있었는지 적어 주세요."
            className="input"
            onBlur={() => touch("content")}
            aria-invalid={invalid("content")}
          />
        </label>

        <PhotoPicker photos={photos} onChange={setPhotos} onError={setError} />
      </Card>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-status-error/10 text-status-error-text text-sm">
          <Icon name="error" className="text-base" />
          {error}
        </div>
      )}

      <div className="flex justify-end pb-6">
        <Button type="submit" variant="primary" disabled={saving} className="max-sm:w-full">
          {saving ? "등록 중…" : "현황 등록"}
        </Button>
      </div>
    </form>
  );
}
