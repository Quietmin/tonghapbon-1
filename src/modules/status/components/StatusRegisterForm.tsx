"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Icon } from "@/shared/components/ui";
import { BRANCHES } from "@/shared/lib/branches";
import { DEPARTMENTS } from "../lib/constants";

const SORTED_BRANCHES = [...BRANCHES].sort((a, b) => a.localeCompare(b, "ko"));

interface FormState {
  branch: string;
  equipmentName: string;
  content: string;
  department: string;
  reporter: string;
}

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
 * 지사는 설비관리·처음 화면에서 고른 지사(쿠키)로 미리 채운다 — 매번 다시 고르지 않게.
 */
export default function StatusRegisterForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<FormState | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const json = await (await fetch("/api/overhaul/branch")).json();
        if (json.ok && json.branch) {
          setForm((f) => (f.branch ? f : { ...f, branch: json.branch }));
        }
      } catch {
        /* 지사를 못 읽어도 직접 고르면 된다 */
      }
    })();
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/status/issues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "등록하지 못했습니다.");
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
        <Icon name="check_circle" className="text-4xl text-status-success" />
        <p className="text-title-sm font-bold text-on-surface">현황이 등록되었습니다</p>
        <p className="text-sm text-on-surface-variant">
          {done.branch} · {done.equipmentName} · {done.department}
        </p>
        <p className="text-sm text-on-surface-variant">
          현황 조회에 &lsquo;미완료&rsquo;로 올라가며, 유지보수 담당자가 조치 상태를 갱신합니다.
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-2">
          <Button
            variant="ghost"
            onClick={() => {
              // 지사·부서·작성자는 같은 근무자가 이어서 등록하는 경우가 많아 남겨 둔다
              setForm({ ...EMPTY, branch: done.branch, department: done.department, reporter: done.reporter });
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
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Card lift={false} className="p-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-on-surface-variant">지사</span>
            <select
              value={form.branch}
              onChange={(e) => set("branch", e.target.value)}
              className="input"
              required
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
            <span className="text-xs font-bold text-on-surface-variant">담당부서</span>
            <select
              value={form.department}
              onChange={(e) => set("department", e.target.value)}
              className="input"
              required
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
            <span className="text-xs font-bold text-on-surface-variant">설비명</span>
            <input
              value={form.equipmentName}
              onChange={(e) => set("equipmentName", e.target.value)}
              placeholder="예: 1호기 순환펌프"
              className="input"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-on-surface-variant">작성자</span>
            <input
              value={form.reporter}
              onChange={(e) => set("reporter", e.target.value)}
              placeholder="이름을 입력하세요."
              className="input"
              required
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-on-surface-variant">이슈 내용</span>
          <textarea
            value={form.content}
            onChange={(e) => set("content", e.target.value)}
            rows={5}
            placeholder="어떤 설비에서 무슨 일이 있었는지 적어 주세요."
            className="input"
            required
          />
        </label>
      </Card>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-status-error/10 text-status-error text-sm">
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
