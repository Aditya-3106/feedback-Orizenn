import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { FormUnavailable, type UnavailableReason } from "@/components/feedback/FormUnavailable";
import { PublicForm } from "@/components/feedback/PublicForm";
import { isAppError, type AppError } from "@/lib/api/errors";
import { getPublicForm, type PublicFormResult } from "@/lib/forms/service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

type Loaded = { ok: true; result: PublicFormResult } | { ok: false; error: AppError };

/** One DB round-trip shared by generateMetadata and the page within a request. */
const loadForm = cache(async (slug: string): Promise<Loaded> => {
  try {
    return { ok: true, result: await getPublicForm(slug) };
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err };
    throw err;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadForm(slug);
  if (!loaded.ok) return { title: { absolute: "Student Feedback" }, robots: { index: false } };
  return {
    title: { absolute: `${loaded.result.form.campaign.name} · Student Feedback` },
    robots: { index: false },
  };
}

export default async function PublicFormPage({ params }: Props) {
  const { slug } = await params;
  const loaded = await loadForm(slug);

  if (!loaded.ok) {
    const { code } = loaded.error;
    if (code === "FORM_CLOSED" || code === "LINK_EXPIRED" || code === "RESPONSE_LIMIT_REACHED") {
      return <FormUnavailable reason={code as UnavailableReason} />;
    }
    notFound();
  }

  return <PublicForm form={loaded.result.form} slug={slug} mode="live" />;
}
