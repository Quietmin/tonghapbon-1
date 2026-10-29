"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./ui";
import { activeGroup } from "@/shared/lib/nav";
import { useSidebar } from "./SidebarState";
import { ProfileChip } from "./ProfileGate";

export default function Header() {
  const pathname = usePathname();
  const sidebar = useSidebar();
  const group = activeGroup(pathname);
  // 모바일 첫 화면은 로고 + 타이틀을 본문 가운데 크게 따로 두므로(page.tsx),
  // 폭이 좁을 때 이 줄까지 보이면 같은 걸 두 번 보여주는 꼴이 된다 — 거기서만
  // 숨긴다. 데스크톱은 첫 화면에도 이 헤더가 유일한 타이틀이라 그대로 둔다.
  const hideOnMobile = pathname === "/";

  return (
    <header
      className={`${hideOnMobile ? "max-md:hidden" : ""} sticky top-0 z-40 bg-surface-glass backdrop-blur-xl border-b border-border-subtle px-gutter h-16 flex justify-between items-center w-full print:hidden`}
    >
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        {/*
          사이드바 여닫기. 숨긴 뒤 다시 부를 곳이 여기뿐이라 늘 같은 자리에 둔다.
          모바일에는 사이드바가 없고 하단탭을 쓰므로 데스크톱에서만 보인다.
        */}
        <button
          type="button"
          onClick={sidebar.toggle}
          aria-label={sidebar.open ? "메뉴 숨기기" : "메뉴 보기"}
          aria-expanded={sidebar.open}
          title={sidebar.open ? "메뉴 숨기기" : "메뉴 보기"}
          className="hidden md:flex w-9 h-9 shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high transition-colors"
        >
          <Icon name={sidebar.open ? "menu_open" : "menu"} />
        </button>
        {/*
          PIMS 브랜드 마크 — 출력물 머리말(Letterhead.tsx)은 한국지역난방공사
          로고(manual-logo.gif)를 그대로 쓰므로 화면 쪽 마크만 바꿔도 문서에는
          영향이 없다. width/height 를 적어 두면 이미지가 늦게 와도 글자가 밀리지
          않는다.
        */}
        {/*
          PIMS 아이콘 + 제목은 처음 화면으로 가는 링크다. PC 에서는 사이드바의 [처음 화면으로]
          탭과 헤더의 [처음 화면] 알약을 없앴으므로, 사이드바를 숨겨 둔 때도 홈으로 돌아가는
          길이 여기 하나는 늘 남아 있어야 한다. (폰은 오른쪽 홈 버튼을 그대로 둔다)
        */}
        <Link
          href="/"
          aria-label="처음 화면으로"
          title="처음 화면으로"
          className="flex items-center gap-3 sm:gap-4 min-w-0"
        >
        {/* eslint-disable-next-line @next/next/no-img-element -- public/ 정적 파일이라 최적화 대상이 아니다 */}
        <img
          src="/pims-icon.png"
          alt="PIMS"
          width={239}
          height={240}
          className="h-9 md:h-11 w-auto shrink-0"
        />
        {/*
          폰 폭에서는 챕터 안에 들어와 있으면("설비관리"/"매뉴얼관리"/"고장관리")
          그 챕터 이름을 타이틀 자리에 바로 보여준다 — "플랜트 지능형
          관리시스템"이라는 일반 문구보다 지금 어디 있는지가 더 쓸모 있다.
          데스크톱(sm 이상)은 건드리지 않는다 — 일반 타이틀 + 아래 "/ 챕터명"
          브레드크럼이 이미 같은 정보를 보여주고 있다.
        */}
        {/* 폰에서는 챕터 제목이 곧 이 화면의 유일한 타이틀이라 더 크게 — 데스크톱(sm:)은 그대로 둔다 */}
        <h2 className="text-xl sm:text-lg md:text-[22px] font-black text-primary tracking-tight truncate">
          <span className="sm:hidden">{group ? group.label : "플랜트 지능형 관리시스템"}</span>
          <span className="hidden sm:inline">플랜트 지능형 관리시스템</span>
        </h2>
        </Link>
        {group && (
          <>
            <span className="hidden sm:inline text-outline-variant">/</span>
            <span className="hidden sm:flex items-center gap-1.5 text-sm font-bold text-on-surface-variant whitespace-nowrap">
              <Icon name={group.icon} className="text-base" />
              {group.label}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/*
          내 지사·부서 — 로그인 대용. 눌러서 바꾼다. PC 에서 사이드바가 펼쳐져 있으면 사이드바
          꼭대기 카드가 같은 정보를 보여 주므로 여기서는 감춘다(사이드바를 숨겼을 때만 보인다).
          폰에는 사이드바가 없어 늘 보인다.
        */}
        <div className={sidebar.open ? "md:hidden" : ""}>
          <ProfileChip />
        </div>
        {pathname !== "/" && (
          <Link
            href="/"
            // 폰 전용 — PC 는 위의 PIMS 아이콘·제목 링크가 같은 일을 한다
            className="md:hidden h-9 px-3 flex items-center gap-1.5 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-sm font-bold text-on-surface-variant transition-colors"
          >
            <Icon name="home" className="text-base" />
            <span className="hidden sm:inline">처음 화면</span>
          </Link>
        )}
        {/*
          "깨끗한 에너지로 세상을 따뜻하게" 띠 — 출력물 오른쪽 위에 들어가는 것과
          같은 파일이라, 화면 머리와 문서 머리가 같은 모양으로 맞는다.
          568x80 이라 32px 높이면 227px 를 먹는다. 폰 화면에서는 제목을 밀어내므로
          sm 부터 보이고, 넓어질수록 한 단계씩 키운다.

          챗봇 버튼은 여기서 뺐다 — 도크에 '완전히 숨김' 단계가 없어서 우하단
          말풍선이 늘 떠 있다(사이드바의 [정비 챗봇 열기]는 그것과 중복이라 뺐다).
          들어갈 길이 이미 눈앞에 있으므로 머리줄까지 차지할 이유가 없다.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element -- public/ 정적 파일이라 최적화 대상이 아니다 */}
        <img
          src="/banner.png"
          alt="깨끗한 에너지로 세상을 따뜻하게"
          width={568}
          height={80}
          className="hidden sm:block h-7 lg:h-8 w-auto shrink-0 ml-1"
        />
      </div>
    </header>
  );
}
