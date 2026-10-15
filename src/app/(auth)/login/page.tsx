import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in" };

export default function Page() {
  return (
    <Suspense>
      <AuthForm kind="login" />
    </Suspense>
  );
}
