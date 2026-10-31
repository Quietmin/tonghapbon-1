// 재사용 UI 요소 — 디자인 토큰(글래스카드/필칩/진행바/링) 기반
// 원본: legacy/plantsync/src/components/ui.jsx 를 TSX로 이식
import Link from "next/link";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function Icon({
  name,
  className = "",
  fill = false,
  ...rest
}: { name: string; fill?: boolean } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={fill ? { fontVariationSettings: "'FILL' 1, 'wght' 500" } : undefined}
      {...rest}
    >
      {name}
    </span>
  );
}

/** 필수 입력 칸 이름 옆의 빨간 * — 스크린리더에는 "필수"로 읽힌다 */
export function RequiredMark() {
  return (
    <span className="text-error ml-0.5 font-bold" title="필수 입력">
      <span aria-hidden>*</span>
      <span className="sr-only">(필수)</span>
    </span>
  );
}

export function Card({
  className = "",
  lift = true,
  children,
  ...rest
}: { lift?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass-card rounded-xl ${lift ? "" : "no-lift"} ${className}`} {...rest}>
      {children}
    </div>
  );
}

/**
 * 상태 칩 — 앱 전체에서 상태를 보이는 유일한 부품. 작업 진행 상태(완료·진행중·대기·지연)와 현황 조치
 * 상태(미완료·조치중·추후 조치 예정·조치완료)를 한 표로 묶어, 같은 뜻이면 어디서나 같은 색·모양이다.
 * 글자색은 짙은 *-text 색(흰 바탕·옅은 칩 위에서 4.5:1 이상), 점은 밝은 색이다.
 */
type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

const TONE_STYLE: Record<StatusTone, { chip: string; dot: string }> = {
  success: { chip: "bg-status-success/15 text-status-success-text", dot: "bg-status-success" },
  warning: { chip: "bg-status-warning/15 text-status-warning-text", dot: "bg-status-warning" },
  error: { chip: "bg-status-error/10 text-status-error-text", dot: "bg-status-error" },
  info: { chip: "bg-status-info/10 text-status-info-text", dot: "bg-status-info" },
  neutral: { chip: "bg-surface-container-highest text-on-surface-variant", dot: "bg-outline" },
};

const STATUS_TONE: Record<string, StatusTone> = {
  완료: "success",
  조치완료: "success",
  진행중: "warning",
  조치중: "warning",
  지연: "error",
  미완료: "error",
  "추후 조치 예정": "info",
  대기: "neutral",
};

export function StatusChip({
  status,
  label,
  title,
}: {
  /** 상태 이름 — 색을 정한다 */
  status: string;
  /** 칩에 다른 글자를 보이고 싶을 때(예: status="지연" label="지연 3일"). 색은 status 를 따른다 */
  label?: string;
  title?: string;
}) {
  const tone = TONE_STYLE[STATUS_TONE[status] ?? "neutral"];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${tone.chip}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
      {label ?? status}
    </span>
  );
}

const FIELD_STYLE: Record<string, string> = {
  기계: "bg-primary/10 text-primary",
  전기: "bg-status-success/10 text-status-success-text",
  제어: "bg-status-info/10 text-status-info-text",
  전산: "bg-status-info/10 text-status-info-text",
  인적실수: "bg-tertiary/10 text-tertiary",
  기타: "bg-surface-container-highest text-on-surface-variant",
  미분류: "bg-surface-container-highest text-on-surface-variant",
};

export function FieldChip({ field }: { field: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
        FIELD_STYLE[field] || FIELD_STYLE["미분류"]
      }`}
    >
      {field}
    </span>
  );
}

// Tailwind 4에는 safelist가 없어 동적 클래스 조합(`bg-${color}`)이 빌드에서 누락된다.
// 원본의 color prop을 고정 맵으로 바꿔 정적 클래스만 사용한다.
const BAR_COLOR = {
  primary: "bg-primary",
  success: "bg-status-success",
  warning: "bg-status-warning",
  error: "bg-status-error",
  info: "bg-status-info",
} as const;

export function ProgressBar({
  value,
  color = "primary",
  className = "",
  height = "h-2.5",
}: {
  value: number;
  color?: keyof typeof BAR_COLOR;
  className?: string;
  height?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`w-full ${height} bg-surface-container rounded-full overflow-hidden ${className}`}>
      <div
        className={`h-full ${BAR_COLOR[color]} rounded-full transition-all duration-700`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ProgressRing({
  value,
  size = 96,
  stroke = 10,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="text-surface-container"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={stroke}
        />
        <circle
          className="text-primary progress-ring__circle"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute flex flex-col items-center">{children}</span>
    </div>
  );
}

export function Avatar({
  name,
  size = "w-6 h-6",
  className = "",
}: {
  name?: string | null;
  size?: string;
  className?: string;
}) {
  const initials = name ? (name.length <= 2 ? name : name.slice(0, 2)) : "--";
  const bg = name
    ? "bg-primary-fixed text-on-primary-fixed-variant"
    : "bg-surface-container-highest text-on-surface-variant";
  return (
    <div
      className={`${size} rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${bg} ${className}`}
    >
      {initials}
    </div>
  );
}

const BUTTON_STYLE = {
  primary: "bg-primary text-on-primary hover:opacity-90 shadow-sm",
  // 주황 버튼. 지금 쓰는 곳은 없다 — 고장관리도 남색(primary)으로 맞췄다. 주황 강조가 다시 필요할 때 쓴다
  tertiary: "bg-tertiary text-on-tertiary hover:opacity-90 shadow-sm",
  ghost: "bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-border-subtle",
  danger: "bg-error text-on-error hover:opacity-90",
} as const;

/**
 * 챕터 색.
 *
 * 모든 챕터가 남색(primary)이다. 챕터마다 다른 색을 주면 알록달록해질 뿐이라 하나로
 * 맞췄다(고장관리도 예전에는 주황이었지만 이 탭만 튀어 보인다는 의견에 따라 남색으로).
 * tertiary(주황)는 지금 쓰는 챕터가 없고, 주황 강조가 다시 필요할 때를 위해 남겨 둔다.
 *
 * solid 는 "내가 지금 만드는 것"(작성 화면), soft 는 "쌓여 있는 것"(조회 화면)에
 * 쓴다. 같은 색이라 챕터는 한눈에 같고, 채도로 작성/조회가 갈린다.
 */
export const ACCENT_STYLE = {
  primary: {
    solid: "bg-primary text-on-primary",
    soft: "bg-primary-fixed text-on-primary-fixed-variant",
    bar: "bg-primary",
    chip: "bg-primary-fixed text-on-primary-fixed-variant",
  },
  tertiary: {
    solid: "bg-tertiary text-on-tertiary",
    soft: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
    bar: "bg-tertiary",
    chip: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  },
} as const;

export type Accent = keyof typeof ACCENT_STYLE;

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: { variant?: keyof typeof BUTTON_STYLE } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      // DESIGN.md 시그니처: 버튼은 각지지 않은 6px(rounded-sm), 굵기는 500(semibold)까지만 — 700(font-bold)은 "브랜드가 깨지는" 굵기다.
      className={`px-4 py-2.5 rounded-sm font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${BUTTON_STYLE[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * 버튼처럼 보이는 링크. 생김새는 Button 과 같은 곳(BUTTON_STYLE)에서 가져온다 —
 * 두 벌로 두면 색이나 모서리가 조금씩 어긋난다.
 * <Link> 안에 <button> 을 넣으면 안 되므로(중첩 상호작용 요소) 따로 둔다.
 */
export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: keyof typeof BUTTON_STYLE;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-4 py-2.5 rounded-sm font-semibold text-sm inline-flex items-center justify-center gap-2 transition-all ${BUTTON_STYLE[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

/**
 * 화면 맨 위 제목 줄 — 아이콘 칩 · 제목 · 설명 · 오른쪽 버튼.
 *
 * 작성과 조회가 같은 자리·같은 모양이라, 바뀌는 건 아이콘과 칩 채도뿐이다:
 * 꽉 찬 칩이면 작성(쓰는 화면), 연한 칩이면 조회(찾는 화면). 색은 챕터를 말한다.
 *
 * 모바일은 아이콘을 빼고 타이틀을 가운데로, 설명 문단 대신 개조식 bullet
 * 목록(bullets)을 보여준다 — 폭이 좁을수록 문단보다 짧게 끊어진 목록이
 * 한눈에 들어온다. bullets 를 안 넘기면(undefined) desc 문단을 그대로 가운데
 * 정렬해 쓰고, 빈 배열([])로 넘기면 설명 자체를 아예 그리지 않는다 — 타이틀
 * 하나만 또렷하게 남기고 싶은 조회·작성 화면이 이 경우다.
 *
 * action(조회↔작성을 오가는 버튼)은 모바일에서는 그리지 않는다 — 같은 역할을
 * 챕터 서브내비(ChapterSubNav)의 탭이 이미 하고 있어서, 타이틀 밑에 또 두면
 * 중복이고 자리만 차지한다. 데스크톱은 서브내비가 없으니 그대로 보여준다.
 */
export function ScreenHeader({
  icon,
  title,
  desc,
  bullets,
  accent = "primary",
  tone = "solid",
  action,
  actionOnMobile = false,
}: {
  icon: string;
  title: string;
  /** 제목 아래 설명. 링크 등을 넣을 수 있다 */
  desc: ReactNode;
  bullets?: string[];
  accent?: Accent;
  /** solid = 작성, soft = 조회 */
  tone?: "solid" | "soft";
  /** 오른쪽에 서는 버튼. 좁은 폭에서는 아래로 내려가 가로폭을 다 쓴다 */
  action?: ReactNode;
  /** 폰에서도 action 을 제목 아래에 보일지 — 폰에서 꼭 필요한 버튼(작업 추가 등)이 있는 화면만 true */
  actionOnMobile?: boolean;
}) {
  return (
    <section className="pt-2 flex flex-col gap-4">
      {/* 모바일 */}
      <div className="md:hidden text-center">
        <h1 className="text-2xl font-black text-on-surface">{title}</h1>
        {bullets === undefined && <p className="text-sm text-on-surface-variant mt-2">{desc}</p>}
        {bullets && bullets.length > 0 && (
          <ul className="mt-2 inline-block text-left">
            {bullets.map((b) => (
              <li key={b} className="flex gap-1.5 text-sm text-on-surface-variant py-0.5">
                <span aria-hidden="true" className="text-on-surface-variant/50">·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
        {actionOnMobile && action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
      </div>

      {/* 데스크톱 */}
      <div className="hidden md:flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <div
            className={`w-12 h-12 mt-1 rounded-2xl shrink-0 flex items-center justify-center ${ACCENT_STYLE[accent][tone]}`}
          >
            <Icon name={icon} className="text-2xl" />
          </div>
          <div className="min-w-0">
            <h1 className="text-display-lg text-on-surface">{title}</h1>
            <p className="text-body-md text-on-surface-variant mt-2">{desc}</p>
          </div>
        </div>
        {action && <div className="shrink-0 max-md:w-full [&>*]:max-md:w-full">{action}</div>}
      </div>
    </section>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  desc,
  action,
  compact = false,
}: {
  icon?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
  /** 카드 안의 작은 목록처럼 좁은 자리용 — 여백·아이콘을 줄인다 */
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${compact ? "py-8" : "py-16"}`}>
      <div
        className={`rounded-2xl bg-surface-container-high flex items-center justify-center text-on-surface-variant ${
          compact ? "w-12 h-12 mb-3" : "w-16 h-16 mb-4"
        }`}
      >
        <Icon name={icon} className={compact ? "text-2xl" : "text-3xl"} />
      </div>
      <h4 className={`text-on-surface mb-1 ${compact ? "text-sm font-bold" : "text-title-sm"}`}>{title}</h4>
      {/* whitespace-pre-line — desc 안의 줄바꿈을 그대로 살린다. 문장을 한 줄씩
          끊어 주지 않으면 브라우저가 아무 데서나 꺾어 너저분해 보인다. */}
      {desc && (
        <p className="text-sm text-on-surface-variant max-w-sm mb-4 whitespace-pre-line">{desc}</p>
      )}
      {action}
    </div>
  );
}

/**
 * 불러오는 중 — 글자 한 줄 대신 표 모양의 뼈대가 반짝인다. 화면이 비어 있다가 갑자기 차는 느낌을 줄이고, 어느
 * 화면에서나 같은 모양이다. 스크린리더에는 label 이 읽힌다.
 */
export function LoadingState({ label = "불러오는 중…", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="py-8 flex flex-col gap-3 animate-pulse">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="h-12 rounded-xl bg-surface-container-high"
          style={{ opacity: 1 - i * 0.18 }}
        />
      ))}
    </div>
  );
}

/**
 * 화면 전체(또는 한 영역)를 못 불러왔을 때. 무슨 일인지 쓰고, onRetry 가 있으면 다시 시도 버튼을 보인다.
 */
export function ErrorState({ message, onRetry }: { message: ReactNode; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 px-4 py-3.5 rounded-xl border border-status-error/30 bg-status-error/10 text-status-error-text text-sm"
    >
      <Icon name="error" className="text-lg shrink-0" />
      <span className="flex-1 min-w-0 font-medium break-words">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 min-h-10 px-3 rounded-lg font-bold hover:bg-status-error/10 inline-flex items-center gap-1"
        >
          <Icon name="refresh" className="text-base" />
          다시 시도
        </button>
      )}
    </div>
  );
}

/** 폼·창 안의 오류 띠 — 저장 실패, 입력 확인 안내 등 */
export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 px-4 py-3 rounded-xl bg-status-error/10 text-status-error-text text-sm"
    >
      <Icon name="error" className="text-base shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}
