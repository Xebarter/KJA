"use client";

import { useState } from "react";

export function ActionForm({
  action,
  children,
  className = "account-form",
  success,
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  className?: string;
  success?: string;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className={className}
      action={async (formData) => {
        setError("");
        setMessage("");
        try {
          await action(formData);
          if (success) setMessage(success);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
        }
      }}
    >
      {children}
      {error ? <p className="account-error">{error}</p> : null}
      {message ? <p>{message}</p> : null}
    </form>
  );
}
