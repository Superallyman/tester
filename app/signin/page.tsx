import SignInForm from "./SignInForm";

// NextAuth sends its errors here as ?error=<code>
const ERRORS: Record<string, string> = {
    AccessDenied: "That GitHub account doesn't have access. Ask the admin to add your email.",
    OAuthAccountNotLinked: "That GitHub account doesn't have access. Ask the admin to add your email.",
    SessionRequired: "Please sign in to continue.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
    const { callbackUrl, error } = await searchParams;
    // Only same-site paths, so the sign-in link can't bounce someone to another site
    const next = callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";
    return (
        <div className="mx-auto w-full max-w-sm px-4 py-12">
            <h1 className="orbit-title mb-6">Sign in</h1>
            <SignInForm callbackUrl={next} initialError={error ? ERRORS[error] ?? "Sign-in failed. Please try again." : null} />
        </div>
    );
}
