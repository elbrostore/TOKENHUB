import { useState } from "react";
import { Copy, Gift, Users } from "lucide-react";
import { fetchDashboard, fetchReferrals, fetchSettings } from "../lib/api";
import { formatDate, formatTokens } from "../lib/format";
import { useAsync } from "../hooks/useAsync";
import { useAuth } from "../auth/useAuth";
import { Alert, Badge, EmptyState, ErrorState, Loading, Panel, StatCard } from "../components/ui";

export function Referrals() {
  const { profile } = useAuth();
  const stats = useAsync(fetchDashboard, []);
  const list = useAsync(fetchReferrals, []);
  const settings = useAsync(fetchSettings, []);
  const [copied, setCopied] = useState("");

  const code = profile?.referral_code ?? "";
  const link = code ? `${window.location.origin}/?ref=${code}` : "";

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied("Copy failed: select the text and copy it manually.");
    }
  };

  if (stats.loading || list.loading) return <Loading />;
  if (stats.error || !stats.data) return <ErrorState message={stats.error} onRetry={stats.reload} />;
  const s = stats.data;
  const reward = settings.data?.referral_reward_tokens ?? 0;

  return (
    <>
      <section className="stats-grid three">
        <StatCard label="People invited" value={String(s.referrals_total)} caption="Signed up with your code" tone="purple" icon={<Users size={19} />} />
        <StatCard label="Rewarded referrals" value={String(s.referrals_rewarded)} caption="Completed a first task" tone="green" icon={<Gift size={19} />} />
        <StatCard label="Referral earnings" value={formatTokens(s.referral_earnings)} unit="TOKENS" caption="Credited to your wallet" tone="orange" icon={<Gift size={19} />} />
      </section>
      <Panel kicker="INVITE" title="Your referral link" subtitle={reward > 0
        ? `Earn ${formatTokens(reward)} tokens when someone you invite completes their first verified task.`
        : "Share your link with friends."}>
        {copied && <Alert kind="success" onClose={() => setCopied("")}>{copied}</Alert>}
        {!code ? <EmptyState title="Referral code not ready" text="Reload the page in a moment." /> : (
          <div className="copy-rows">
            <div className="copy-row"><span>Code</span><code>{code}</code><button className="ghost-button" onClick={() => copy(code, "Referral code copied.")}><Copy size={14} /> Copy</button></div>
            <div className="copy-row"><span>Link</span><code>{link}</code><button className="ghost-button" onClick={() => copy(link, "Referral link copied.")}><Copy size={14} /> Copy</button></div>
          </div>
        )}
        <p className="muted-note">Rules: you cannot refer yourself, each person can be referred only once, and the reward is paid once, after the referred user's first verified task.</p>
      </Panel>
      <Panel kicker="TRACKING" title="Your referrals">
        {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.data?.length ? (
          <EmptyState title="No referrals yet" text="Share your link to start tracking invitations." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Invited user</th><th>Joined</th><th>Status</th><th className="num">Reward</th></tr></thead>
              <tbody>
                {list.data.map((r, i) => (
                  <tr key={r.id}>
                    <td>Member #{list.data!.length - i}</td><td>{formatDate(r.created_at)}</td>
                    <td><Badge status={r.status} /></td><td className="num">{r.reward_amount ? `+${formatTokens(r.reward_amount)}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
