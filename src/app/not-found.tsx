import Link from "next/link";
import { Wordmark } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-orizenn-bg px-6 text-center">
      <Wordmark />
      <h1 className="mt-6 font-display text-4xl text-orizenn-ink">Page not found.</h1>
      <p className="mt-2 max-w-md text-sm text-orizenn-muted">The link may be incorrect, or the page may have been removed.</p>
      <Link href="/" className="btn-secondary mt-6">
        Back to start
      </Link>
    </div>
  );
}
