import { Suspense } from "react";
import { AuthForm } from "@/components/account/AuthForm";

export default function AccountLoginPage() {
  return <Suspense><AuthForm /></Suspense>;
}
