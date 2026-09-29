import { PublicShell } from "./PublicShell";

export type UnavailableReason = "FORM_CLOSED" | "LINK_EXPIRED" | "RESPONSE_LIMIT_REACHED";

const COPY: Record<UnavailableReason, { title: string; message: string }> = {
  FORM_CLOSED: {
    title: "This form is closed.",
    message: "This feedback form is no longer accepting responses.",
  },
  LINK_EXPIRED: {
    title: "This link has expired.",
    message: "This feedback link has expired.",
  },
  RESPONSE_LIMIT_REACHED: {
    title: "This form is full.",
    message: "This feedback form has reached its response limit.",
  },
};

export function FormUnavailable({ reason }: { reason: UnavailableReason }) {
  const copy = COPY[reason];
  return (
    <PublicShell>
      <section className="rise-in card px-6 py-12 text-center sm:px-10 sm:py-16">
        <h1 className="font-display text-3xl leading-tight text-orizenn-ink sm:text-4xl">{copy.title}</h1>
        <p className="mt-4 text-base text-orizenn-muted">{copy.message}</p>
        <p className="mt-6 text-sm text-orizenn-subtle">
          If you were asked to fill this in, please check with the person who sent you the link.
        </p>
      </section>
    </PublicShell>
  );
}
