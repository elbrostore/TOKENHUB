export const TX_TYPES = ["task_reward", "referral_reward", "withdrawal", "withdrawal_refund"];

const numberFormat = new Intl.NumberFormat("en-US");

export function formatTokens(value: number | null | undefined): string {
  return numberFormat.format(Number(value ?? 0));
}

export function formatSigned(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return `${n > 0 ? "+" : ""}${numberFormat.format(n)}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function methodLabel(method: string): string {
  const labels: Record<string, string> = {
    paypal: "PayPal",
    bank_transfer: "Bank transfer",
    usdt_trc20: "USDT (TRC20)",
  };
  return labels[method] ?? method.replace(/_/g, " ");
}

export function transactionLabel(type: string | null): string {
  const labels: Record<string, string> = {
    task_reward: "Task reward",
    referral_reward: "Referral reward",
    withdrawal: "Withdrawal",
    withdrawal_refund: "Withdrawal refund",
  };
  return type ? labels[type] ?? type.replace(/_/g, " ") : "Transaction";
}

const errorMessages: Record<string, string> = {
  insufficient_funds: "You do not have enough tokens for this action.",
  unsupported_method: "This payout method is not supported.",
  invalid_destination: "Enter valid payout details (3 to 200 characters).",
  too_many_pending: "You already have 3 pending withdrawals. Wait for a decision first.",
  account_inactive: "Your account is suspended. Contact support.",
  task_unavailable: "This task is no longer available.",
  task_limit_reached: "You have reached the completion limit for this task.",
  forbidden: "You are not allowed to do this.",
  invalid_transition: "This request cannot move to that status.",
  cannot_review_own_request: "You cannot review your own withdrawal.",
  cannot_modify_self: "You cannot change your own account status.",
};

export function friendlyError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message
      : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message)
      : "Something went wrong. Please try again.";
  if (raw.startsWith("below_minimum:")) {
    return `The minimum withdrawal is ${formatTokens(Number(raw.split(":")[1]))} tokens.`;
  }
  for (const [code, message] of Object.entries(errorMessages)) {
    if (raw.includes(code)) return message;
  }
  if (raw.includes("row-level security") || raw.includes("permission denied")) {
    return "You are not allowed to do this.";
  }
  return raw;
}
