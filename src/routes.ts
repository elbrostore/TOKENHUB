export type Route =
  | "dashboard" | "earn" | "wallet" | "transactions" | "referrals"
  | "withdrawals" | "notifications" | "settings" | "admin";

export const ROUTES: Route[] = [
  "dashboard", "earn", "wallet", "transactions", "referrals", "withdrawals", "notifications", "settings", "admin",
];

export function routeFromHash(hash: string): Route {
  const key = hash.replace(/^#\/?/, "") as Route;
  return ROUTES.includes(key) ? key : "dashboard";
}
