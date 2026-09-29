"use client";

import { useEffect } from "react";
import { Notice } from "@/components/ui/primitives";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl py-16">
      <Notice
        tone="danger"
        title="Something went wrong."
        action={
          <button type="button" className="btn-secondary btn-sm" onClick={reset}>
            Try again
          </button>
        }
      >
        The page couldn&apos;t be loaded. Your data is unchanged.
        {error.digest ? <span className="mt-1 block font-mono text-[11px] text-orizenn-subtle">ref {error.digest}</span> : null}
      </Notice>
    </div>
  );
}
