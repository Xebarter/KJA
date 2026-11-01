"use client";

import { DeskForm } from "@/components/academics/Form";

/** Thin wrapper so library pages share the same progress / feedback UX. */
export function ActionForm({
  action,
  children,
  className = "lib-form",
}: {
  action: (formData: FormData) => Promise<{ error?: string; ok?: string; href?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DeskForm action={action} className={className}>
      {children}
    </DeskForm>
  );
}
