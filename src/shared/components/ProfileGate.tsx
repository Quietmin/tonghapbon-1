"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Dialog, { DialogHeader } from "./Dialog";
import { Icon, RequiredMark, InlineError } from "./ui";

/**
 * 로그인 화면 + 내 정보(지사·부서) 선택 — 실제 로그인이 붙기 전까지의 임시 대용.
 *
 * 이 브라우저 세션에서 로그인하지 않았으면(주소로 새로 들어왔거나 로그아웃했으면) 어느 주소로 들어와도 전체
 * 화면 로그인 화면이 먼저 뜬다. 왼쪽 브랜드 영역(폰에서는 위쪽 로고·제목)과 오른쪽 폼(지사·부서 선택)으로
 * 이루어진 좌우 분할형이고, 마지막에 고른 지사·부서가 미리 채워져 있어 [로그인]만 누르면 된다. 로그인하면
 * 들어온 주소 그대로 화면이 열린다(루트로 들어왔으면 홈). 고르기 전에는 다른 화면을 쓸 수 없다.
 *
 * 선택은 쿠키에 담기고(/api/profile), 서버가 getCurrentUser() 로 읽어 현황 작성의 기본 지사·부서와 현황
 * 조회의 기본 필터에 쓴다. 로그인했다는 표시는 브라우저를 닫으면 사라지는 세션 쿠키(oh_session)다. 헤더의
 * "강남지사 · 계전부" 칩을 누르면 지사·부서를 바꾸거나 로그아웃할 수 있다(그때는 작은 창이고 닫기 가능).
 *
 * 업무망에서 실제 로그인이 붙으면 이 창은 필요 없어진다 — 서버의 getCurrentUser() 만 세션으로
 * 바꾸면 되고, 이 컴포넌트는 Shell 에서 떼어 내면 그만이다.
 *
 * ⚠️ 비밀번호가 없고(화면에도 따로 적지 않는다) 쿠키라서 누구나 바꿀 수 있다 — 보안이 아니라 "내 기준으로 먼저 보여 주기" 위한 편의다.
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
  /** 미리 채워 둘 값 — 지사만 이미 골라 둔 사람(오버홀 공정관리에서)은 지사가 채워져 있다 */
  const [draftBranch, setDraftBranch] = useState("");
  const [draftDept, setDraftDept] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 이 세션에서 로그인한 표시(oh_session)가 없으면 로그인 화면이다 — 서버 응답(/api/profile)을 기다리지 않고
    // 바로 띄워 뒤의 일반 화면이 잠깐 비치지 않게 한다. 표시가 있어도 아래 응답이 최종이다.
    const hasCookie = (name: string) =>
      document.cookie.split("; ").some((c) => c.startsWith(`${name}=`) && c.length > name.length + 1);
    if (!hasCookie("oh_session")) {
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
        if (json.loggedIn && json.branch && json.department) {
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
      // 로그인이면 들어온 주소 그대로 열린다(루트로 들어왔으면 홈).
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
      setSaving(false);
    }
  }

  async function logout() {
    if (saving) return;
    setSaving(true);
    try {
      await fetch("/api/profile", { method: "DELETE" });
    } finally {
      // 로그인 표시가 없어진 채로 다시 읽으면 로그인 화면이 뜬다
      window.location.assign("/");
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
        // 로그인 — 전체 화면 좌우 분할형. 뒤의 화면은 완전히 가려 쓸 수 없다.
        <div
          className="fixed inset-0 z-[500] overflow-y-auto bg-surface print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profileDlgTitle"
        >
          {/* 남색 2 : 흰색 1 — 폭이 좁은 태블릿(md)에서는 폼이 찌그러지지 않게 3 : 2 */}
          <div className="min-h-full grid md:grid-cols-[3fr_2fr] lg:grid-cols-[2fr_1fr]">
            {/* 왼쪽 브랜드 영역 — 폰에서는 접고 아래 폼 위에 로고·제목만 둔다 */}
            <aside className="hidden md:flex flex-col gap-10 bg-primary text-on-primary p-10 lg:p-14">
              {/* 로고·제목 줄을 남색 영역의 위아래·좌우 가운데에 둔다. 슬로건 마크만 맨 아래(가운데) */}
              <div className="flex-1 flex flex-col items-center justify-center gap-12">
                {/* 로고와 제목은 한 줄(1열) — 로고 왼쪽, 제목·영문명 오른쪽, 서로 위아래 가운데 맞춤 */}
                <div className="flex items-center justify-center gap-5 lg:gap-7">
                  <div className="shrink-0 rounded-3xl bg-white p-2.5 lg:p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- public/ 정적 파일이라 최적화 대상이 아니다 */}
                    <img src="/pims-icon.png" alt="PIMS" width={239} height={240} className="h-24 lg:h-36 w-auto" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-[26px] lg:text-4xl leading-tight font-bold tracking-tight break-keep">
                      플랜트 지능형 관리시스템
                    </h1>
                    <p className="mt-2 text-base lg:text-lg text-primary-fixed tracking-wide">Plant Intelligence Management System</p>
                  </div>
                </div>
              </div>
              {/* 슬로건은 글자가 아니라 마크 — 헤더의 banner.png 와 같은 그림인데, 남색 바탕에서 읽히도록 짙은 글자는 흰색, 초록·빨강은 밝게 바꾼 banner-light.png */}
              {/* eslint-disable-next-line @next/next/no-img-element -- public/ 정적 파일이라 최적화 대상이 아니다 */}
              <img
                src="/banner-light.png"
                alt="깨끗한 에너지로 세상을 따뜻하게"
                width={568}
                height={80}
                className="self-center h-11 lg:h-14 w-auto"
              />
            </aside>

            <div className="flex flex-col items-center justify-center gap-6 px-6 py-10 md:py-14">
              <div className="md:hidden flex flex-col items-center text-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- public/ 정적 파일이라 최적화 대상이 아니다 */}
                <img src="/pims-icon.png" alt="PIMS" width={239} height={240} className="h-28 w-auto" />
                <h1 className="mt-4 text-2xl font-bold text-on-surface tracking-tight">플랜트 지능형 관리시스템</h1>
                <p className="mt-1 text-sm text-on-surface-variant tracking-wide">Plant Intelligence Management System</p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
                className="w-full max-w-sm flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-container-lowest p-6 md:border-0 md:bg-transparent md:p-0"
              >
                <div>
                  <h2 id="profileDlgTitle" className="text-headline-md text-on-surface">
                    로그인
                  </h2>
                  <p className="text-sm text-on-surface-variant mt-1 break-keep">
                    지사와 부서를 선택하면 해당 지사 기준으로 현황을 보여드립니다.
                  </p>
                </div>
                {fields}
                <button
                  type="submit"
                  disabled={saving || !draftBranch || !draftDept}
                  className="mt-1 min-h-11 px-5 py-3 rounded-sm font-bold text-sm bg-primary text-on-primary hover:opacity-90 disabled:opacity-40"
                >
                  {saving ? "로그인 중…" : "로그인"}
                </button>
              </form>
            </div>
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
              고른 지사·부서 기준으로 현황이 먼저 보이고, 현황 작성에도 자동으로 채워집니다. 업무망 로그인이
              연결되기 전까지 임시로 쓰는 선택입니다.
            </p>

            {fields}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void logout()}
                disabled={saving}
                className="mr-auto min-h-10 px-4 py-2.5 rounded-sm font-bold text-sm text-status-error-text hover:bg-status-error/10"
              >
                로그아웃
              </button>
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
