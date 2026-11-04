import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/format";

type Mode = "login" | "register" | "forgot";
const REF_KEY = "tokenhub_ref";

function initialReferral(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("ref");
    if (fromUrl) localStorage.setItem(REF_KEY, fromUrl.trim().toUpperCase().slice(0, 16));
    return localStorage.getItem(REF_KEY) ?? "";
  } catch {
    return "";
  }
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [referral, setReferral] = useState(initialReferral);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const switchMode = (next: Mode) => { setMode(next); setError(""); setMessage(""); setNeedsConfirm(false); };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true); setError(""); setMessage(""); setNeedsConfirm(false);
    try {
      const cleanEmail = email.trim();
      if (mode === "register") {
        const { data, error: err } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: username.trim() || undefined, referral_code: referral.trim().toUpperCase() || undefined },
          },
        });
        if (err) throw err;
        if (data.user && data.user.identities?.length === 0) {
          setError("An account with this email already exists. Sign in or reset your password.");
        } else if (data.session) {
          localStorage.removeItem(REF_KEY);
        } else {
          localStorage.removeItem(REF_KEY);
          setMessage("Account created. Check your inbox and click the confirmation link, then sign in.");
          setMode("login");
        }
      } else if (mode === "login") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (err) {
          if (/not confirmed/i.test(err.message)) {
            setNeedsConfirm(true);
            throw new Error("Your email is not confirmed yet. Open the confirmation link we sent you.");
          }
          throw err;
        }
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: window.location.origin });
        if (err) throw err;
        setMessage("If an account exists for this email, a password reset link is on its way.");
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError(""); setMessage("");
    const { error: err } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    if (err) setError(friendlyError(err)); else setMessage("Confirmation email sent again.");
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="brand-symbol">T</div>
          <div><div className="brand-name">TOKEN<span>HUB</span></div><div className="brand-caption">REWARDS PLATFORM</div></div>
        </div>
        <div className="auth-heading">
          <span className="section-kicker">YOUR REWARDS, YOUR PROGRESS</span>
          <h1>{mode === "login" ? "Welcome back." : mode === "register" ? "Create your account." : "Reset your password."}</h1>
          <p>
            {mode === "login" && "Sign in to continue to your TOKENHUB workspace."}
            {mode === "register" && "Join TOKENHUB and start your rewards journey."}
            {mode === "forgot" && "Enter your email and we'll send you a reset link if an account exists."}
          </p>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="auth-email">Email address</label>
          <input id="auth-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {mode === "register" && (
            <>
              <label htmlFor="auth-username">Username <span className="optional">(optional)</span></label>
              <input id="auth-username" type="text" autoComplete="username" maxLength={40} minLength={2} value={username} onChange={(e) => setUsername(e.target.value)} />
            </>
          )}
          {mode !== "forgot" && (
            <>
              <label htmlFor="auth-password">Password</label>
              <input id="auth-password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder={mode === "register" ? "At least 8 characters" : "Your password"} value={password}
                onChange={(e) => setPassword(e.target.value)} minLength={mode === "register" ? 8 : 6} required />
            </>
          )}
          {mode === "register" && (
            <>
              <label htmlFor="auth-ref">Referral code <span className="optional">(optional)</span></label>
              <input id="auth-ref" type="text" maxLength={16} value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} />
            </>
          )}
          {error && <div className="auth-error" role="alert">{error}</div>}
          {message && <div className="auth-message" role="status">{message}</div>}
          {needsConfirm && <button type="button" className="link-button" onClick={resend}>Resend confirmation email</button>}
          <button className="primary-button auth-submit" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link"}
            {!loading && <ArrowUpRight size={17} />}
          </button>
        </form>
        <div className="auth-links">
          {mode === "login" && (<>
            <button type="button" onClick={() => switchMode("forgot")}>Forgot password?</button>
            <p>Don't have an account? <button type="button" onClick={() => switchMode("register")}>Create one</button></p>
          </>)}
          {mode === "register" && <p>Already have an account? <button type="button" onClick={() => switchMode("login")}>Sign in</button></p>}
          {mode === "forgot" && <p>Remember your password? <button type="button" onClick={() => switchMode("login")}>Back to sign in</button></p>}
        </div>
        <div className="auth-footer">TOKENHUB · SECURE ACCOUNT ACCESS</div>
      </section>
    </main>
  );
}
