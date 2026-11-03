"use client";

import { DeskForm } from "@/components/academics/Form";

export function ActionForm({
  action,
  children,
  className = "store-form",
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
