import { useState } from "react";
import type { FormEvent } from "react";
import { fetchDashboard, fetchMyWithdrawals, fetchSettings, requestWithdrawal } from "../lib/api";
import { formatDate, formatTokens, friendlyError, methodLabel } from "../lib/format";
import { useAsync } from "../hooks/useAsync";
import { Alert, Badge, EmptyState, ErrorState, Loading, Panel } from "../components/ui";

export function Withdrawals() {
  const stats = useAsync(fetchDashboard, []);
  const settings = useAsync(fetchSettings, []);
  const history = useAsync(fetchMyWithdrawals, []);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  if (stats.loading || settings.loading) return <Loading />;
  if (stats.error || !stats.data) return <ErrorState message={stats.error} onRetry={stats.reload} />;
  if (settings.error || !settings.data) return <ErrorState message={settings.error} onRetry={settings.reload} />;
  const { min_withdrawal_tokens: min, payout_methods: methods } = settings.data;
  const balance = stats.data.balance;
  const chosen = method || methods[0] || "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const value = Math.floor(Number(amount));
    if (!Number.isFinite(value) || value < min) { setMessage({ kind: "error", text: `The minimum withdrawal is ${formatTokens(min)} tokens.` }); return; }
    if (value > balance) { setMessage({ kind: "error", text: "You do not have enough tokens for this amount." }); return; }
    setBusy(true);
    try {
      await requestWithdrawal(value, chosen, destination);
      setMessage({ kind: "success", text: "Withdrawal requested. The tokens are on hold until an administrator reviews it." });
      setAmount(""); setDestination("");
      stats.reload(); history.reload();
    } catch (e) {
      setMessage({ kind: "error", text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="two-col wide-left">
      <Panel kicker="PAYOUT" title="Request a withdrawal" subtitle={`Available: ${formatTokens(balance)} tokens · minimum ${formatTokens(min)}`}>
        {message && <Alert kind={message.kind} onClose={() => setMessage(null)}>{message.text}</Alert>}
        {!methods.length ? <EmptyState title="Withdrawals are not available yet" text="No payout method has been enabled by the administrator." /> : (
          <form className="stack-form" onSubmit={submit}>
            <label htmlFor="wd-amount">Amount (tokens)</label>
            <input id="wd-amount" type="number" inputMode="numeric" min={min} max={balance} step={1} required value={amount} onChange={(e) => setAmount(e.target.value)} />
            <label htmlFor="wd-method">Payout method</label>
            <select id="wd-method" value={chosen} onChange={(e) => setMethod(e.target.value)}>
              {methods.map((m) => <option key={m} value={m}>{methodLabel(m)}</option>)}
            </select>
            <label htmlFor="wd-dest">Payout details</label>
            <input id="wd-dest" type="text" minLength={3} maxLength={200} required placeholder="Email, IBAN or wallet address" value={destination} onChange={(e) => setDestination(e.target.value)} />
            <button className="primary-button" type="submit" disabled={busy || balance < min}>{busy ? "Submitting..." : "Request withdrawal"}</button>
            {balance < min && <p className="muted-note">You need at least {formatTokens(min)} tokens to withdraw.</p>}
          </form>
        )}
      </Panel>
      <Panel kicker="HISTORY" title="Your requests">
        {history.loading ? <Loading /> : history.error ? <ErrorState message={history.error} onRetry={history.reload} /> :
          !history.data?.length ? <EmptyState title="No withdrawal requests" /> : (
            <ul className="plain-list">
              {history.data.map((w) => (
                <li key={w.id}>
                  <div>
                    <strong>{formatTokens(w.amount)} tokens · {methodLabel(w.method)}</strong>
                    <span>{formatDate(w.created_at)}{w.admin_note ? ` · ${w.admin_note}` : ""}</span>
                  </div>
                  <Badge status={w.status} />
                </li>
              ))}
            </ul>
          )}
      </Panel>
    </div>
  );
}
