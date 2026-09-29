import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui/primitives";

/**
 * Minimal frame for every student-facing page (/f/*). Deliberately not the
 * admin shell: one wordmark, one label, a centred column, nothing else.
 */
export function PublicShell({ children, banner }: { children: ReactNode; banner?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-orizenn-bg">
      {banner}
      <header className="border-b border-orizenn-border bg-orizenn-surface">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <span className="mono-label">Student Feedback</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 sm:py-14">{children}</main>
      <footer className="mx-auto w-full max-w-2xl px-4 pb-8 sm:px-6">
        <p className="hint">Collected with Orizenn Feedback.</p>
      </footer>
    </div>
  );
}
