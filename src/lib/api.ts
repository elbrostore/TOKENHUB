
import { supabase } from "./supabase";
import type {
  AdminStats, AdminUser, AppNotification, Dashboard, Profile, ProviderEvent, PublicSettings,
  Referral, Task, TaskCompletion, WalletTransaction, WithdrawalRequest,
} from "./types";

export const PAGE_SIZE = 15;

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

const PROFILE_COLUMNS = "id,email,username,full_name,referral_code,is_active,created_at";

export async function ensureAccount(): Promise<void> {
  unwrap(await supabase.rpc("ensure_account"));
}

export async function fetchIsAdmin(): Promise<boolean> {
  return Boolean(unwrap(await supabase.rpc("is_admin")));
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  return unwrap(await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle());
}

export async function updateProfile(userId: string, values: { username: string | null; full_name: string | null }) {
  unwrap(await supabase.from("profiles").update(values).eq("id", userId));
}

export async function fetchDashboard(): Promise<Dashboard> {
  return unwrap(await supabase.rpc("get_dashboard")) as Dashboard;
}

export async function fetchSettings(): Promise<PublicSettings> {
  const rows = unwrap(await supabase.from("app_settings").select("key,value")) as { key: string; value: unknown }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    min_withdrawal_tokens: Number(map.get("min_withdrawal_tokens") ?? 1000),
    referral_reward_tokens: Number(map.get("referral_reward_tokens") ?? 0),
    payout_methods: Array.isArray(map.get("payout_methods")) ? (map.get("payout_methods") as string[]) : [],
  };
}

export async function fetchTasks(): Promise<Task[]> {
  return unwrap(await supabase.from("tasks").select("*").eq("is_active", true).order("reward", { ascending: false }));
}

export async function fetchMyCompletions(): Promise<TaskCompletion[]> {
  return unwrap(await supabase.from("task_completions")
    .select("id,task_id,status,reward_amount,completed_at,started_at").order("started_at", { ascending: false }));
}

export async function startTask(taskId: string): Promise<{ click_id: string; action_url: string | null }> {
  return unwrap(await supabase.rpc("start_task", { p_task_id: taskId })) as { click_id: string; action_url: string | null };
}

export interface TransactionQuery {
  page: number;
  filter: "all" | "earnings" | "spending";
  type?: string;
  userId?: string;
}

export async function fetchTransactions(q: TransactionQuery): Promise<{ rows: WalletTransaction[]; total: number }> {
  let query = supabase.from("wallet_transactions")
    .select("id,user_id,type,amount,balance_after,status,description,created_at", { count: "exact" });
  if (q.userId) query = query.eq("user_id", q.userId);
  if (q.filter === "earnings") query = query.gt("amount", 0);
  if (q.filter === "spending") query = query.lt("amount", 0);
  if (q.type) query = query.eq("type", q.type);
  const from = q.page * PAGE_SIZE;
  const { data, error, count } = await query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return { rows: (data ?? []) as WalletTransaction[], total: count ?? 0 };
}

export async function fetchReferrals(): Promise<Referral[]> {
  return unwrap(await supabase.from("referrals")
    .select("id,referred_id,status,reward_amount,created_at,rewarded_at").order("created_at", { ascending: false }));
}

export async function fetchMyWithdrawals(): Promise<WithdrawalRequest[]> {
  return unwrap(await supabase.from("withdrawal_requests").select("*").order("created_at", { ascending: false }));
}

export async function requestWithdrawal(amount: number, method: string, destination: string): Promise<void> {
  unwrap(await supabase.rpc("request_withdrawal", { p_amount: amount, p_method: method, p_destination: destination }));
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  return unwrap(await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100));
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  unwrap(await supabase.rpc("mark_notifications_read", { p_ids: ids ?? null }));
}

/* ---------- Admin ---------- */

export async function adminStats(): Promise<AdminStats> {
  return unwrap(await supabase.rpc("admin_stats")) as AdminStats;
}

export async function adminUsers(search: string, page: number): Promise<AdminUser[]> {
  return unwrap(await supabase.rpc("admin_list_users", {
    p_search: search || null,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  })) as AdminUser[];
}

export async function adminSetUserActive(userId: string, active: boolean): Promise<void> {
  unwrap(await supabase.rpc("admin_set_user_active", { p_user: userId, p_active: active }));
}

export async function adminAllTasks(): Promise<Task[]> {
  return unwrap(await supabase.from("tasks").select("*").order("created_at", { ascending: false }));
}

export type TaskInput = Pick<
  Task,
  "title" | "description" | "task_type" | "reward" | "provider" | "action_url" | "is_active" | "max_completions_per_user"
>;

export async function adminSaveTask(id: string | null, values: TaskInput): Promise<void> {
  if (id) {
    unwrap(await supabase.from("tasks").update(values).eq("id", id));
  } else {
    unwrap(await supabase.from("tasks").insert(values));
  }
}

export async function adminAllWithdrawals(status: string): Promise<(WithdrawalRequest & { email: string | null })[]> {
  let query = supabase.from("withdrawal_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) query = query.eq("status", status);
  const rows = unwrap(await query) as WithdrawalRequest[];
  const emails = await emailMap(rows.map((r) => r.user_id));
  return rows.map((r) => ({ ...r, email: emails.get(r.user_id) ?? null }));
}

export async function adminReviewWithdrawal(
  id: string,
  action: "approve" | "reject" | "pay",
  note: string,
): Promise<void> {
  unwrap(await supabase.rpc("admin_review_withdrawal", {
    p_id: id,
    p_action: action,
    p_note: note || null,
  }));
}

export async function adminProviderEvents(): Promise<ProviderEvent[]> {
  return unwrap(await supabase.from("provider_events")
    .select("id,provider,event_id,event_type,status,error,user_id,received_at")
    .order("received_at", { ascending: false })
    .limit(100));
}

export async function adminSaveSettings(values: PublicSettings): Promise<void> {
  const rows = [
    { key: "min_withdrawal_tokens", value: values.min_withdrawal_tokens },
    { key: "referral_reward_tokens", value: values.referral_reward_tokens },
    { key: "payout_methods", value: values.payout_methods },
  ].map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  unwrap(await supabase.from("app_settings").upsert(rows, { onConflict: "key" }));
}

export async function emailMap(userIds: string[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const rows = unwrap(await supabase.from("profiles").select("id,email").in("id", ids)) as {
    id: string;
    email: string | null;
  }[];
  return new Map(rows.map((r) => [r.id, r.email]));
}

/* ---------- Offerwall ---------- */

export async function createOfferwallSession(): Promise<{
  url: string;
  expires_at: number;
}> {
  // Get the authenticated user's current session.
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error("Could not read your login session. Please sign in again.");
  }

  if (!session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  // Send the user's JWT explicitly to the protected Edge Function.
  const { data, error } = await supabase.functions.invoke("offerwall-launch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    console.error("Offerwall launch error:", error);
    throw new Error(error.message || "Could not open Offerwall");
  }

  if (
    !data ||
    typeof data.url !== "string" ||
    !data.url.startsWith("https://offerwall.me/offerwall/") ||
    typeof data.expires_at !== "number"
  ) {
    throw new Error("Invalid Offerwall session response");
  }

  return {
    url: data.url,
    expires_at: data.expires_at,
  };
}
/* ---------- Offerwall IP diagnostic ---------- */

export interface OfferwallIpDiagnostic {
  success: boolean;
  diagnostic: {
    cfConnectingIpPresent: boolean;
    cfIpCountryPresent: boolean;
    xForwardedForPresent: boolean;
    xRealIpPresent: boolean;
  };
  message: string;
}

export async function checkOfferwallIpHeaders(): Promise<OfferwallIpDiagnostic> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const { data, error } = await supabase.functions.invoke("offerwall-ip-check", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    console.error("Offerwall IP diagnostic error:", error);
    throw new Error(error.message || "Could not check IP headers.");
  }

  if (!data?.success || !data?.diagnostic) {
    throw new Error("Invalid IP diagnostic response.");
  }

  return data as OfferwallIpDiagnostic;
}
