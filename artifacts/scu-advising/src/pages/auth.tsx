import { SignIn, SignUp } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Accurate, not promotional: an account alone does not grant access. The
// server admits only invited pilot participants (lib/auth/policy.ts).
const ACCESS_NOTE = (
  <div className="mb-4 rounded-md border border-border bg-card px-3 py-2 text-center text-[13px] text-foreground/90">
    CampusVal is in a controlled pilot and is available only to invited participants.
    It is not an official SCU system; Workday and your advisor remain authoritative.
  </div>
);

const NEW_PARTICIPANT_NOTE = (
  <div className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-center text-[13px]">
    Invited and new to CampusVal? Create an account first with the address your
    invitation was sent to —{" "}
    <a href={`${basePath}/sign-up`} className="font-medium underline">
      create one here
    </a>
    .
  </div>
);

export function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[440px]">
        {ACCESS_NOTE}
        {NEW_PARTICIPANT_NOTE}
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          fallbackRedirectUrl={basePath || "/"}
        />
      </div>
    </div>
  );
}

export function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[440px]">
        {ACCESS_NOTE}
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in`}
          fallbackRedirectUrl={basePath || "/"}
        />
      </div>
    </div>
  );
}
