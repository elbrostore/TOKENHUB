
export interface Profile {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  referral_code: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Dashboard {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  completed_tasks: number;
  referrals_total: number;
  referrals_rewarded: number;
  referral_earnings: number;
  pending_withdrawals: number;
  unread_notifications: number;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  reward: number;
  provider: string | null;
  action_url: string | null;
  is_active: boolean;
  max_completions_per_user: number;
  created_at: string;
}

export interface TaskCompletion {
  id: string;
  task_id: string;
  status: "started" | "completed" | "rejected" | "expired";
  reward_amount: number | null;
  completed_at: string | null;
  started_at: string;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: string | null;
  amount: number | null;
  balance_after: number | null;
  status: string | null;
  description: string | null;
  created_at: string;
}

export interface Referral {
  id: string;
  referred_id: string;
  status: "pending" | "rewarded" | "rejected";
  reward_amount: number | null;
  created_at: string;
  rewarded_at: string | null;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  destination: string;
  amount_tokens: number;
  payout_method: string;
  payout_details: {
    destination?: string;
    requested_method?: string;
    [key: string]: unknown;
  };
  status: "pending" | "approved" | "processing" | "rejected" | "paid";
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  paid_at: string | null;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ProviderEvent {
  id: string;
  provider: string | null;
  event_id: string | null;
  event_type: string | null;
  status: string;
  error: string | null;
  user_id: string | null;
  received_at: string;
}

export interface AdminUser {
  id: string;
  email: string | null;
  username: string | null;
  is_active: boolean;
  created_at: string;
  balance: number;
  lifetime_earned: number;
  is_admin: boolean;
  total_count: number;
}

export interface AdminStats {
  users: number;
  active_users: number;
  tokens_in_wallets: number;
  tokens_issued: number;
  completions: number;
  active_tasks: number;
  pending_withdrawals: number;
  pending_withdrawal_tokens: number;
  paid_withdrawal_tokens: number;
  rejected_provider_events: number;
}

export interface PublicSettings {
  min_withdrawal_tokens: number;
  referral_reward_tokens: number;
  payout_methods: string[];
}

/* ---------- Offerwall safe catalog types ---------- */

export type OfferwallCategory =
  | "offers"
  | "surveys"
  | "ptc"
  | "shortlinks"
  | "tasks";

export interface OfferwallStep {
  id: string;
  label: string;
  reward: number;
}

export interface OfferwallOffer {
  id: string;
  provider: string;
  title: string;
  description: string;
  image: string | null;
  cover: string | null;
  reward: number;
  category: OfferwallCategory;
  devices: string[];
  countries: string[];
  steps: OfferwallStep[];
  multiStep: boolean;
}

export interface OfferwallCatalog {
  success: boolean;
  country: string | null;
  offers: OfferwallOffer[];
  errors: Partial<Record<OfferwallCategory, string>>;
}
