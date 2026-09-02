import { SignIn, SignUp } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const ACCESS_NOTE = (
  <div className="mb-4 px-3 py-2 rounded-md bg-[#8C1515]/10 border border-[#8C1515]/30 text-[13px] text-[#8C1515] text-center">
    CampusVal is available to SCU users and invited external reviewers. It's
    an independent prototype, not an official SCU system — always confirm
    decisions with an official SCU advisor.
  </div>
);

const NEW_REVIEWER_NOTE = (
  <div className="mb-4 px-3 py-2 rounded-md bg-muted border border-border text-[13px] text-center">
    Invited reviewer and new to CampusVal? You need an account first —{" "}
    <a href={`${basePath}/sign-up`} className="underline font-medium">
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
        {NEW_REVIEWER_NOTE}
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
