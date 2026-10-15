import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Create workspace" };

export default function Page() {
  return (
    <Suspense>
      <AuthForm kind="signup" />
    </Suspense>
  );
}
