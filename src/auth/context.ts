import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { Profile } from "../lib/types";

export interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  passwordRecovery: boolean;
  refreshProfile: () => Promise<void>;
  finishRecovery: () => void;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);
