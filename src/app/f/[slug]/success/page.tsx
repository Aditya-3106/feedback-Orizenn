import type { Metadata } from "next";
import { SubmissionSuccess } from "@/components/feedback/SubmissionSuccess";

export const metadata: Metadata = {
  title: { absolute: "Thank you · Student Feedback" },
  robots: { index: false },
};

export default function SubmissionSuccessPage() {
  return <SubmissionSuccess />;
}
