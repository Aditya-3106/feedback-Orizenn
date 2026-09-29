"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils/format";

/* ───────────────────────── Submit button (form status aware) ───────────────────────── */

export function SubmitButton({
  children,
  pendingText = "Saving…",
  className = "btn-primary",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || rest.disabled} aria-busy={pending} {...rest}>
      {pending ? pendingText : children}
    </button>
  );
}

/* ───────────────────────── Copy to clipboard ───────────────────────── */

export function CopyButton({ value, label = "Copy link", className = "btn-secondary btn-sm" }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          window.prompt("Copy this link", value);
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/* ───────────────────────── Modal (native dialog) ───────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-[var(--radius-card)] border border-orizenn-border bg-orizenn-surface p-0 text-orizenn-ink shadow-xl backdrop:bg-orizenn-dark/40 backdrop:backdrop-blur-[2px] open:rise-in",
        size === "sm" && "max-w-md",
        size === "md" && "max-w-lg",
        size === "lg" && "max-w-3xl",
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-orizenn-border px-5 py-4">
        <div>
          <h2 id={titleId} className="font-display text-2xl leading-tight">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="mt-1 text-sm text-orizenn-muted">
              {description}
            </p>
          ) : null}
        </div>
        <button type="button" className="btn-ghost btn-sm -mr-2" onClick={onClose} aria-label="Close dialog">
          ✕
        </button>
      </div>
      {children ? <div className="px-5 py-4">{children}</div> : null}
      {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-orizenn-border px-5 py-3">{footer}</div> : null}
    </dialog>
  );
}

/* ───────────────────────── Confirm action ───────────────────────── */

export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "primary",
  onConfirm,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {trigger(() => setOpen(true))}
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={title}
        description={description}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className={tone === "danger" ? "btn-danger" : "btn-primary"}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await onConfirm();
                  setOpen(false);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Something went wrong.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="text-sm text-orizenn-danger">
            {error}
          </p>
        ) : null}
      </Modal>
    </>
  );
}

/* ───────────────────────── Inline toast ───────────────────────── */

export function useFlash(timeout = 2500) {
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), timeout);
    return () => clearTimeout(t);
  }, [message, timeout]);
  return { message, flash: setMessage };
}

export function Flash({ message }: { message: { tone: "success" | "danger"; text: string } | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className={cn(
        "fade-in fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-2 text-sm shadow-lg",
        message.tone === "success"
          ? "border-orizenn-success/20 bg-orizenn-success-soft text-orizenn-ink"
          : "border-orizenn-danger/20 bg-orizenn-danger-soft text-orizenn-ink",
      )}
    >
      {message.text}
    </div>
  );
}
