"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Icon, RequiredMark } from "./ui";

/**
 * 내 정보(지사·부서) 선택 — 로그인이 없는 동안의 임시 대용.
 *
 * 처음 접속하면(또는 지사·부서 중 하나라도 비어 있으면) 선택 창이 떠서 고르기 전에는 닫을 수
 * 없다. 선택은 쿠키에 담기고(/api/profile), 서버가 getCurrentUser() 로 읽어 현황 등록의
 * 기본 지사·부서와 현황 조회의 기본 필터에 쓴다. 이후에는 헤더의 "강남지사 · 계전부" 칩을 눌러
 * 다시 바꿀 수 있다(그때는 닫기 가능).
 *
 * 업무망에서 실제 로그인이 붙으면 이 창은 필요 없어진다 — 서버의 getCurrentUser() 만 세션으로
 * 바꾸면 되고, 이 컴포넌트는 Shell 에서 떼어 내면 그만이다.
 *
 * ⚠️ 쿠키라서 누구나 바꿀 수 있다 — 보안이 아니라 "내 기준으로 먼저 보여 주기" 위한 편의다.
 */

interface Profile {
  branch: string;
  department: string;
}

interface ProfileApi {
  /** undefined = 아직 조회 전, null = 선택 전 */
  profile: Profile | null | undefined;
  open: () => void;
}

const ProfileContext = createContext<ProfileApi | null>(null);

export function useProfile(): ProfileApi {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile 은 ProfileProvider 안에서만 쓸 수 있습니다.");
  return ctx;
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [branches, setBranches] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  /** 미리 채워 둘 값 — 지사만 이미 골라 둔 사람(설비관리에서)은 지사가 채워져 있다 */
  const [draftBranch, setDraftBranch] = useState("");
  const [draftDept, setDraftDept] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const json = await (await fetch("/api/profile")).json();
        if (!json.ok) throw new Error();
        setBranches([...json.branches].sort((a: string, b: string) => a.localeCompare(b, "ko")));
        setDepartments(json.departments);
        setDraftBranch(json.branch ?? "");
        setDraftDept(json.department ?? "");
        if (json.branch && json.department) {
          setProfile({ branch: json.branch, department: json.department });
        } else {
          setProfile(null);
          setOpen(true);
        }
      } catch {
        // 못 읽어도 앱은 그대로 쓴다 — 창을 띄우지 않고 칩만 숨긴다
        setProfile(undefined);
      }
    })();
  }, []);

  /** 아직 한 번도 고르지 않았으면 닫을 수 없다 */
  const forced = profile === null;

  useEffect(() => {
    if (!open || forced) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, forced]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const json = await (
        await fetch("/api/profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ branch: draftBranch, department: draftDept }),
        })
      ).json();
      if (!json.ok) throw new Error(json.error || "저장하지 못했습니다.");
      // 지사·부서에 매인 화면이 많다 — 서버 데이터와 화면 기본값을 통째로 다시 읽는다
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
      setSaving(false);
    }
  }

  const api = useMemo<ProfileApi>(
    () => ({
      profile,
      open: () => {
        if (profile) {
          setDraftBranch(profile.branch);
          setDraftDept(profile.department);
        }
        setError(null);
        setOpen(true);
      },
    }),
    [profile],
  );

  const SELECT =
    "h-11 px-3 rounded-sm bg-surface-container-low border border-border-subtle text-sm text-on-surface outline-none focus:border-primary focus:bg-surface-container-lowest";

  return (
    <ProfileContext.Provider value={api}>
      {children}
      {open && (
        <div
          className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center bg-black/50 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profileDlgTitle"
          onClick={forced ? undefined : () => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-surface-container-lowest p-6 shadow-xl flex flex-col gap-4"
          >
            <div className="flex items-start gap-3">
              <span className="w-11 h-11 shrink-0 rounded-2xl bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center">
                <Icon name="badge" className="text-2xl" />
              </span>
              <div className="min-w-0">
                <h3 id="profileDlgTitle" className="text-title-sm text-on-surface">
                  {forced ? "지사와 부서를 선택해 주세요" : "내 지사·부서 변경"}
                </h3>
                <p className="text-sm text-on-surface-variant mt-1 break-keep">
                  업무망 로그인이 연결되기 전까지 임시로 쓰는 선택입니다. 고른 지사·부서 기준으로 현황이 먼저
                  보이고, 현황 등록에도 자동으로 채워집니다.
                </p>
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-on-surface-variant">
                지사
                <RequiredMark />
              </span>
              <select
                value={draftBranch}
                onChange={(e) => setDraftBranch(e.target.value)}
                className={SELECT}
                required
                autoFocus={forced}
              >
                <option value="">선택</option>
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-on-surface-variant">
                부서
                <RequiredMark />
              </span>
              <select
                value={draftDept}
                onChange={(e) => setDraftDept(e.target.value)}
                className={SELECT}
                required
              >
                <option value="">선택</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-status-error/10 text-status-error text-sm">
                <Icon name="error" className="text-base" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              {!forced && (
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-sm font-bold text-sm text-on-surface-variant hover:bg-surface-container-high"
                >
                  취소
                </button>
              )}
              <button
                type="submit"
                disabled={saving || !draftBranch || !draftDept}
                className="px-5 py-2.5 rounded-sm font-bold text-sm bg-primary text-on-primary hover:opacity-90 disabled:opacity-40"
              >
                {saving ? "저장 중…" : forced ? "시작하기" : "저장"}
              </button>
            </div>
          </form>
        </div>
      )}
    </ProfileContext.Provider>
  );
}

/** 헤더의 "강남지사 · 계전부" 칩 — 눌러서 다시 고른다. 폰에서는 아이콘만 */
export function ProfileChip() {
  const { profile, open } = useProfile();
  if (!profile) return null;
  const label = `${profile.branch} · ${profile.department}`;
  return (
    <button
      type="button"
      onClick={open}
      aria-label={`내 지사·부서: ${label} (눌러서 변경)`}
      title="내 지사·부서 변경"
      className="h-9 px-2.5 md:px-3 flex items-center gap-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-sm font-bold text-on-surface-variant transition-colors whitespace-nowrap"
    >
      <Icon name="badge" className="text-base" />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
