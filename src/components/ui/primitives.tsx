import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/format";

/* ───────────────────────── Page header ───────────────────────── */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mono-label mb-2">{eyebrow}</div> : null}
        <h1 className="font-display text-3xl leading-tight text-orizenn-ink md:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-orizenn-muted md:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ───────────────────────── Stat card ───────────────────────── */

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card p-5">
      <div className="mono-label">{label}</div>
      <div className="mt-2 font-display text-3xl text-orizenn-ink tabular-nums">{value}</div>
      {hint ? <div className="hint mt-1">{hint}</div> : null}
    </div>
  );
}

/* ───────────────────────── Status badge ───────────────────────── */

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-orizenn-success-soft text-orizenn-success",
  PUBLISHED: "bg-orizenn-success-soft text-orizenn-success",
  COMPLETED: "bg-orizenn-success-soft text-orizenn-success",
  VERIFIED: "bg-orizenn-success-soft text-orizenn-success",
  DRAFT: "bg-orizenn-blue-soft text-orizenn-blue",
  IN_PROGRESS: "bg-orizenn-blue-soft text-orizenn-blue",
  PENDING: "bg-orizenn-blue-soft text-orizenn-blue",
  PAUSED: "bg-orizenn-warning-soft text-orizenn-warning",
  ABANDONED: "bg-orizenn-warning-soft text-orizenn-warning",
  NOT_VERIFIED: "bg-orizenn-warning-soft text-orizenn-warning",
  CLOSED: "bg-orizenn-bg text-orizenn-muted",
  EXPIRED: "bg-orizenn-bg text-orizenn-muted",
  ARCHIVED: "bg-orizenn-bg text-orizenn-subtle",
  UNKNOWN: "bg-orizenn-bg text-orizenn-subtle",
  INVALID: "bg-orizenn-danger-soft text-orizenn-danger",
  FAILED: "bg-orizenn-danger-soft text-orizenn-danger",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em]",
        STATUS_STYLES[status] ?? "bg-orizenn-bg text-orizenn-muted",
        className,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* ───────────────────────── Empty state ───────────────────────── */

export function EmptyState({
  title,
  description,
  action,
  compact,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("card flex flex-col items-center justify-center text-center", compact ? "px-6 py-10" : "px-6 py-16")}>
      <h2 className="font-display text-2xl text-orizenn-ink">{title}</h2>
      {description ? <p className="mt-2 max-w-md text-sm text-orizenn-muted">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/* ───────────────────────── Field error ───────────────────────── */

export function FieldError({ id, errors }: { id?: string; errors?: string[] | string | null }) {
  if (!errors || (Array.isArray(errors) && errors.length === 0)) return null;
  const list = Array.isArray(errors) ? errors : [errors];
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-orizenn-danger">
      {list.join(" ")}
    </p>
  );
}

/* ───────────────────────── Notice ───────────────────────── */

export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const styles = {
    info: "border-orizenn-blue/20 bg-orizenn-blue-soft text-orizenn-ink",
    success: "border-orizenn-success/20 bg-orizenn-success-soft text-orizenn-ink",
    warning: "border-orizenn-warning/20 bg-orizenn-warning-soft text-orizenn-ink",
    danger: "border-orizenn-danger/20 bg-orizenn-danger-soft text-orizenn-ink",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", styles)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          {title ? <div className="font-medium">{title}</div> : null}
          {children ? <div className={title ? "mt-1 text-orizenn-muted" : ""}>{children}</div> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

/* ───────────────────────── Section ───────────────────────── */

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card", className)}>
      {title || actions ? (
        <header className="flex flex-col gap-2 border-b border-orizenn-border px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            {title ? <h2 className="text-base font-medium text-orizenn-ink">{title}</h2> : null}
            {description ? <p className="hint mt-0.5">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ───────────────────────── Tabs (link based) ───────────────────────── */

export function LinkTabs({
  items,
  current,
}: {
  items: Array<{ href: string; label: string; count?: number }>;
  current: string;
}) {
  return (
    <nav aria-label="Sections" className="-mb-px flex gap-1 overflow-x-auto border-b border-orizenn-border">
      {items.map((it) => {
        const active = current === it.href;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              active
                ? "border-orizenn-blue font-medium text-orizenn-ink"
                : "border-transparent text-orizenn-muted hover:border-orizenn-border hover:text-orizenn-ink",
            )}
          >
            {it.label}
            {it.count != null ? <span className="ml-1.5 font-mono text-[11px] text-orizenn-subtle">{it.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/* ───────────────────────── Key/value list ───────────────────────── */

export function KeyValue({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="mono-label">{it.label}</dt>
          <dd className="mt-1 break-words text-sm text-orizenn-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-mono text-[13px] font-semibold uppercase tracking-[0.18em] text-orizenn-ink", className)}>
      Orizenn
    </span>
  );
}
