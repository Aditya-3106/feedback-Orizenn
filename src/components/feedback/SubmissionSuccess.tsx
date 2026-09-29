"use client";

import { useState } from "react";
import { PublicShell } from "./PublicShell";

/**
 * Static thank-you screen. No marketing, no sign-up. A single "Close" tries
 * window.close(); browsers refuse to close tabs they did not open via script,
 * so afterwards we simply stop offering the button.
 */
export function SubmissionSuccess() {
  const [attempted, setAttempted] = useState(false);

  return (
    <PublicShell>
      <section className="rise-in card px-6 py-12 sm:px-10 sm:py-16">
        <h1 className="font-display text-4xl leading-[1.05] text-orizenn-ink sm:text-5xl">Thank you.</h1>
        <p className="mt-5 text-lg text-orizenn-ink">Your feedback has been recorded.</p>
        <p className="mt-2 max-w-prose text-base leading-relaxed text-orizenn-muted">
          Your response helps us understand what to improve next.
        </p>
        {!attempted ? (
          <div className="mt-10">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setAttempted(true);
                window.close();
              }}
            >
              Close
            </button>
          </div>
        ) : null}
      </section>
    </PublicShell>
  );
}
