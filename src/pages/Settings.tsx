import { useState } from "react";
import type { FormEvent } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";
import { updateProfile } from "../lib/api";
import { formatDate, friendlyError } from "../lib/format";
import { useAuth } from "../auth/useAuth";
import { Alert, Panel } from "../components/ui";

type Msg = { kind: "success" | "error"; text: string } | null;

export function SettingsPage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [username, setUsername] = useState(profile?.username ?? "");
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [profileMsg, setProfileMsg] = useState<Msg>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setBusy(true); setProfileMsg(null);
    try {
      await updateProfile(user.id, { username: username.trim() || null, full_name: fullName.trim() || null });
      await refreshProfile();
      setProfileMsg({ kind: "success", text: "Profile updated." });
    } catch (e) {
      setProfileMsg({ kind: "error", text: friendlyError(e) });
    } finally { setBusy(false); }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPwMsg(null);
    if (password !== confirm) { setPwMsg({ kind: "error", text: "The two passwords do not match." }); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setPwMsg({ kind: "error", text: friendlyError(error) }); return; }
    setPassword(""); setConfirm("");
    setPwMsg({ kind: "success", text: "Password updated." });
  };

  const signOutEverywhere = async () => { await supabase.auth.signOut({ scope: "global" }); };

  return (
    <div className="two-col">
      <Panel kicker="PROFILE" title="Your profile">
        {profileMsg && <Alert kind={profileMsg.kind} onClose={() => setProfileMsg(null)}>{profileMsg.text}</Alert>}
        <form className="stack-form" onSubmit={saveProfile}>
          <label htmlFor="st-username">Username</label>
          <input id="st-username" minLength={2} maxLength={40} value={username} onChange={(e) => setUsername(e.target.value)} />
          <label htmlFor="st-name">Full name</label>
          <input id="st-name" maxLength={80} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <button className="primary-button" type="submit" disabled={busy}>Save profile</button>
        </form>
        <dl className="overview-list spaced">
          <div><dt>Email</dt><dd>{user?.email}</dd></div>
          <div><dt>Member since</dt><dd>{formatDate(profile?.created_at)}</dd></div>
          <div><dt>Referral code</dt><dd className="mono">{profile?.referral_code ?? "—"}</dd></div>
        </dl>
      </Panel>
      <div className="stack-col">
        <Panel kicker="SECURITY" title="Change password">
          {pwMsg && <Alert kind={pwMsg.kind} onClose={() => setPwMsg(null)}>{pwMsg.text}</Alert>}
          <form className="stack-form" onSubmit={savePassword}>
            <label htmlFor="st-pw">New password</label>
            <input id="st-pw" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            <label htmlFor="st-pw2">Confirm new password</label>
            <input id="st-pw2" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button className="primary-button" type="submit" disabled={busy}>Update password</button>
          </form>
        </Panel>
        <Panel kicker="SESSION" title="Sign out">
          <div className="button-row">
            <button className="ghost-button" onClick={signOut}><LogOut size={15} /> Sign out</button>
            <button className="ghost-button" onClick={signOutEverywhere}>Sign out on all devices</button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
