import { Suspense } from "react";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Choose a password" };

/** Reached from a password-reset or team-invite email, after /auth/callback has created a session. */
export default function Page() {
  return (
    <Suspense>
      <AuthForm kind="reset" />
    </Suspense>
  );
}
