import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/index.js";
import { config } from "../config.js";
import { consumeExpiredNote, signInSession, useSession } from "../auth/session.js";
import { isCompanyEmail, looksLikeEmail } from "../auth/isCompanyEmail.js";
import { safeReturnTo } from "../auth/returnTo.js";
import PointerGlow from "../components/PointerGlow.jsx";
import { pageDurationMs } from "../components/PageTransition.jsx";
import SponsorSlot from "../components/SponsorSlot.jsx";
import Button from "../components/ui/Button.jsx";
import Input from "../components/ui/Input.jsx";

const GENERIC_ERROR = "Wrong email or password.";

export default function Landing() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(0);
  const [expired] = useState(() => consumeExpiredNote());

  const target = safeReturnTo(params.get("returnTo"));

  useEffect(() => {
    if (!lockedUntil) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  // Already signed in (for example the Back button after sign-in): go straight on.
  useEffect(() => {
    if (session && !leaving) navigate(target, { replace: true });
  }, [session, leaving, navigate, target]);

  const locked = lockedUntil > now;

  async function onSubmit(event) {
    event.preventDefault();
    if (busy || locked) return;
    setError("");
    if (config.allowedEmailDomains.length === 0) {
      setError("Sign-in not configured.");
      return;
    }
    if (!looksLikeEmail(email) || !password) {
      setError("Enter your company email and password.");
      return;
    }
    if (!isCompanyEmail(email, config.allowedEmailDomains)) {
      setError("Use your company email address to sign in.");
      return;
    }
    setBusy(true);
    try {
      const user = await api.signIn({ email: email.trim().toLowerCase(), password });
      setLeaving(true);
      await new Promise((resolve) => setTimeout(resolve, pageDurationMs()));
      signInSession(user);
      navigate(target, { replace: true });
    } catch (e) {
      if (e?.status === 429) {
        setLockedUntil(Date.now() + 30000);
        setNow(Date.now());
        setError("Too many attempts. Wait 30 seconds and try again.");
      } else if (e?.name === "NetworkError") {
        setError(e.message);
      } else {
        setError(GENERIC_ERROR); // same text for a wrong password and an unknown user
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-screen grid-cols-2 overflow-hidden bg-graphite">
      <div className={`relative flex items-center justify-center p-8 ${leaving ? "page-leave" : ""}`}>
        <div className="absolute left-8 top-8">
          <SponsorSlot />
        </div>
        <form onSubmit={onSubmit} noValidate className="w-full max-w-sm rounded-panel border border-steel bg-carbon p-8">
          <h1 className="text-2xl font-semibold">IO Signal Sudoku</h1>
          <p className="mb-6 mt-1 text-sm text-soft-white/70">Sign in with your company email.</p>
          {expired && (
            <p role="status" className="mb-4 text-sm text-soft-white">
              Your session expired. Sign in again.
            </p>
          )}
          <div className="flex flex-col gap-4">
            <Input label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-data-tq">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || locked}>
              {locked ? "Please wait" : busy ? "Signing in" : "Sign in"}
            </Button>
          </div>
        </form>
      </div>
      <PointerGlow className="h-full" />
    </div>
  );
}
