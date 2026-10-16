import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Reset password" };

export default function Page() {
  return (
    <Suspense>
      <AuthForm kind="forgot" />
    </Suspense>
  );
}
