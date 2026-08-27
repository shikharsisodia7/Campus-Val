import { SignIn, SignUp } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const SCU_ONLY_NOTE = (
  <div className="mb-4 px-3 py-2 rounded-md bg-[#8C1515]/10 border border-[#8C1515]/30 text-[13px] text-[#8C1515] text-center">
    CampusVal is currently available to <span className="font-mono">@scu.edu</span>{" "}
    accounts and invited external reviewers. Other emails will be rejected.
  </div>
);

export function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[440px]">
        {SCU_ONLY_NOTE}
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
        {SCU_ONLY_NOTE}
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
