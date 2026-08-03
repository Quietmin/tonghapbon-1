// 재사용 UI 요소 — 디자인 토큰(글래스카드/필칩/진행바/링) 기반
// 원본: legacy/plantsync/src/components/ui.jsx 를 TSX로 이식
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

export function Card({
  className = "",
  lift = true,
  children,
  ...rest
}: { lift?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass-card rounded-[24px] ${lift ? "" : "no-lift"} ${className}`} {...rest}>
      {children}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  완료: "bg-status-success/10 text-status-success",
  진행중: "bg-status-warning/10 text-status-warning",
  대기: "bg-surface-container-highest text-on-surface-variant",
  지연: "bg-status-error/10 text-status-error",
  조치중: "bg-status-warning/10 text-status-warning",
  조치완료: "bg-status-success/10 text-status-success",
};

export function StatusChip({ status }: { status: string }) {
  const dot =
    status === "진행중" || status === "조치중"
      ? "bg-status-warning"
      : status === "지연"
        ? "bg-status-error"
        : status === "완료" || status === "조치완료"
          ? "bg-status-success"
          : null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${
        STATUS_STYLE[status] || STATUS_STYLE["대기"]
      }`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
      {status}
    </span>
  );
}

const FIELD_STYLE: Record<string, string> = {
  기계: "bg-primary/10 text-primary",
  전기: "bg-status-success/10 text-status-success",
  제어: "bg-status-info/10 text-status-info",
  전산: "bg-status-info/10 text-status-info",
  인적실수: "bg-tertiary/10 text-tertiary",
  기타: "bg-surface-container-highest text-on-surface-variant",
  미분류: "bg-surface-container-highest text-on-surface-variant",
};

export function FieldChip({ field }: { field: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
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
    : "bg-outline-variant text-on-surface-variant";
  return (
    <div
      className={`${size} rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${bg} ${className}`}
    >
      {initials}
    </div>
  );
}

const BUTTON_STYLE = {
  primary: "bg-primary text-on-primary hover:opacity-90 shadow-sm",
  ghost: "bg-surface-container-high text-on-surface hover:bg-surface-container-highest border border-border-subtle",
  danger: "bg-error text-on-error hover:opacity-90",
} as const;

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: { variant?: keyof typeof BUTTON_STYLE } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${BUTTON_STYLE[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  desc,
  action,
}: {
  icon?: string;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center text-on-surface-variant mb-4">
        <Icon name={icon} className="text-3xl" />
      </div>
      <h4 className="text-title-sm text-on-surface mb-1">{title}</h4>
      {desc && <p className="text-sm text-on-surface-variant max-w-sm mb-4">{desc}</p>}
      {action}
    </div>
  );
}
