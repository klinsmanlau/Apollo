"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "",
  pendingText,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 ${className}`}
    >
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}
