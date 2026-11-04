import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { ensureAccount, fetchIsAdmin, fetchProfile } from "../lib/api";
import type { Profile } from "../lib/types";
import { AuthContext } from "./context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    // Session persistence + URL token handling (email confirmation / recovery links) is done by supabase-js.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(next);
      if (!next) {
        setProfile(null);
        setIsAdmin(false);
        setLoading(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Load account data when the signed-in user changes (not on every token refresh).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureAccount(); // self-heals a missing profile/wallet
      } catch {
        /* non-fatal: the trigger/backfill normally already created them */
      }
      const [p, admin] = await Promise.all([
        fetchProfile(userId).catch(() => null),
        fetchIsAdmin().catch(() => false),
      ]);
      if (cancelled) return;
      setProfile(p);
      setIsAdmin(admin);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    setProfile(await fetchProfile(userId).catch(() => null));
  }, [userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(() => ({
    session, user: session?.user ?? null, profile, isAdmin, loading, passwordRecovery,
    refreshProfile, finishRecovery: () => setPasswordRecovery(false), signOut,
  }), [session, profile, isAdmin, loading, passwordRecovery, refreshProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
