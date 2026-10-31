"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Dialog, { DialogHeader } from "./Dialog";
import { Icon, RequiredMark, InlineError } from "./ui";

/**
 * 내 정보(지사·부서) 선택 — 로그인이 없는 동안의 임시 대용.
 *
 * 처음 접속하면(또는 지사·부서 중 하나라도 비어 있으면) PIMS 마크와 함께 계정 설정 화면이 전체 화면으로
 * 뜨고, 고르고 [시작하기]를 누르면 홈 화면(/)으로 이동한다 — 어느 주소로 처음 들어왔든 같다. 고르기
 * 전에는 다른 화면을 쓸 수 없다. 선택은 쿠키에 담기고(/api/profile), 서버가 getCurrentUser() 로 읽어 현황 등록의
 * 기본 지사·부서와 현황 조회의 기본 필터에 쓴다. 이후에는 헤더의 "강남지사 · 계전부" 칩을 눌러
 * 다시 바꿀 수 있다(그때는 작은 창이고 닫기 가능).
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
    // 지사·부서 쿠키가 없으면 첫 접속이다 — 서버 응답(/api/profile)을 기다리지 않고 바로 화면을 띄워
    // 뒤의 일반 화면이 잠깐 비치지 않게 한다. 쿠키가 있어도 값이 틀렸을 수 있으니 아래 응답이 최종이다.
    const hasCookie = (name: string) =>
      document.cookie.split("; ").some((c) => c.startsWith(`${name}=`) && c.length > name.length + 1);
    if (!hasCookie("oh_branch") || !hasCookie("oh_dept")) {
      setProfile(null);
      setOpen(true);
    }
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

  // 첫 접속 화면이 뜨면 지사 선택칸에 바로 포커스를 준다 — 뒤 화면이 inert 라 Tab 이 이 화면 안에서만 돈다
  useEffect(() => {
    if (!(open && forced)) return;
    // 화면이 막 그려진 직후라 칸이 아직 없을 수 있다 — 한 박자 늦춰 준다
    const t = setTimeout(() => document.getElementById("profileBranchSelect")?.focus(), 50);
    return () => clearTimeout(t);
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
      // 지사·부서에 매인 화면이 많다 — 서버 데이터와 화면 기본값을 통째로 다시 읽는다.
      // 처음 고른 것이면(= 첫 접속 화면) 어느 주소로 들어왔든 홈 화면으로 보낸다.
      if (forced) window.location.assign("/");
      else window.location.reload();
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

  const fields = (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-on-surface-variant">
          지사
          <RequiredMark />
        </span>
        <select
          id="profileBranchSelect"
          value={draftBranch}
          onChange={(e) => setDraftBranch(e.target.value)}
          className={SELECT}
          required
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
        <select aria-label="부서"
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
        <InlineError>{error}</InlineError>
      )}
    </>
  );

  return (
    <ProfileContext.Provider value={api}>
      {/* 첫 접속 화면이 떠 있는 동안은 뒤의 화면 전체를 inert 로 둔다 — 눈에만 가려질 뿐 Tab 키로 사이드바·버튼에
          닿거나 스크린리더가 읽는 일이 없게 한다. display: contents 라 레이아웃에는 영향이 없다. */}
      <div style={{ display: "contents" }} inert={open && forced}>
        {children}
      </div>
      {open && forced && (
        // 첫 접속 — PIMS 마크와 계정 설정을 전체 화면으로. 뒤의 화면은 완전히 가려 쓸 수 없다.
        <div
          className="fixed inset-0 z-[500] overflow-y-auto bg-surface print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profileDlgTitle"
        >
          <div className="min-h-full flex flex-col items-center justify-center gap-8 px-6 py-10">
            <div className="flex flex-col items-center text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- public/ 정적 파일이라 최적화 대상이 아니다 */}
              <img src="/pims-icon.png" alt="PIMS" width={239} height={240} className="h-40 md:h-48 w-auto" />
              <h1 className="mt-5 text-[26px] md:text-4xl font-black text-on-surface tracking-tight">
                플랜트 지능형 관리시스템
              </h1>
              <p className="mt-1.5 text-xs md:text-sm font-semibold text-on-surface-variant tracking-wide">
                Plant Inteligence Management System
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-xl border border-border-subtle flex flex-col gap-4"
            >
              <div>
                <h2 id="profileDlgTitle" className="text-title-sm text-on-surface flex items-center gap-2">
                  <Icon name="manage_accounts" className="text-primary" /> 계정 설정
                </h2>
                <p className="text-sm text-on-surface-variant mt-1 break-keep">
                  지사와 부서를 선택해 주세요. 고른 지사·부서 기준으로 현황이 먼저 보이고, 현황 등록에도
                  자동으로 채워집니다. (업무망 로그인이 연결되기 전까지 임시로 쓰는 선택입니다.)
                </p>
              </div>
              {fields}
              <button
                type="submit"
                disabled={saving || !draftBranch || !draftDept}
                className="mt-1 px-5 py-3 rounded-sm font-bold text-sm bg-primary text-on-primary hover:opacity-90 disabled:opacity-40"
              >
                {saving ? "저장 중…" : "시작하기"}
              </button>
            </form>
          </div>
        </div>
      )}
      {open && !forced && (
        // 팝업 틀은 공통 Dialog — 어느 화면의 다른 창 위에도 떠야 해서 top
        <Dialog onClose={() => setOpen(false)} labelledBy="profileDlgTitle" size="sm" top>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader id="profileDlgTitle" title="계정 설정 — 내 지사·부서" onClose={() => setOpen(false)} />
            <p className="text-sm text-on-surface-variant break-keep">
              업무망 로그인이 연결되기 전까지 임시로 쓰는 선택입니다. 고른 지사·부서 기준으로 현황이 먼저
              보이고, 현황 등록에도 자동으로 채워집니다.
            </p>

            {fields}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="px-4 py-2.5 rounded-sm font-bold text-sm text-on-surface-variant hover:bg-surface-container-high"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving || !draftBranch || !draftDept}
                className="px-5 py-2.5 rounded-sm font-bold text-sm bg-primary text-on-primary hover:opacity-90 disabled:opacity-40"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </form>
        </Dialog>
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
      className="h-10 px-2.5 md:px-3 flex items-center gap-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-sm font-bold text-on-surface-variant transition-colors whitespace-nowrap"
    >
      <Icon name="badge" className="text-base" />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}

/**
 * 첫 화면의 "계정 설정" 버튼 — 눌러서 내 지사·부서를 다시 고른다(로그인이 붙기 전까지의 계정 대용).
 * 폰에는 사이드바가 없고 첫 화면에서는 헤더도 감춰져 있어, 지사·부서를 바꿀 길이 이 버튼뿐이다.
 * 아직 고르기 전(profile 이 없음)이면 팝업이 이미 강제로 떠 있으니 그려 두지 않는다.
 */
export function AccountButton({ className = "" }: { className?: string }) {
  const { profile, open } = useProfile();
  if (!profile) return null;
  return (
    <button
      type="button"
      onClick={open}
      aria-label={`계정 설정 — 내 지사·부서: ${profile.branch} ${profile.department}`}
      className={`h-10 px-3.5 inline-flex items-center gap-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-sm font-bold text-on-surface-variant transition-colors whitespace-nowrap ${className}`}
    >
      <Icon name="manage_accounts" className="text-base" />
      계정 설정
    </button>
  );
}
