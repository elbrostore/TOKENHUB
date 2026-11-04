import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { friendlyError } from "../lib/format";
import { useAuth } from "../auth/useAuth";

export function ResetPassword() {
  const { finishRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password !== confirm) { setError("The two passwords do not match."); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(friendlyError(err)); return; }
    finishRecovery();
    window.history.replaceState(null, "", window.location.pathname);
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-heading">
          <span className="section-kicker">PASSWORD RECOVERY</span>
          <h1>Choose a new password.</h1>
          <p>Enter a new password for your account.</p>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="new-password">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <label htmlFor="confirm-password">Confirm password</label>
          <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="primary-button auth-submit" type="submit" disabled={loading}>{loading ? "Saving..." : "Update password"}</button>
        </form>
      </section>
    </main>
  );
}
