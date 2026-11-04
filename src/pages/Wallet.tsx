import { ArrowDownLeft, ArrowUpRight, TrendingUp, Wallet } from "lucide-react";
import { fetchDashboard, fetchTransactions } from "../lib/api";
import { formatDate, formatSigned, formatTokens, transactionLabel } from "../lib/format";
import { useAsync } from "../hooks/useAsync";
import { EmptyState, ErrorState, Loading, Panel, StatCard } from "../components/ui";
import type { Route } from "../routes";
import type { WalletTransaction } from "../lib/types";

function List({ rows, empty }: { rows: WalletTransaction[]; empty: string }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <ul className="plain-list">
      {rows.map((t) => (
        <li key={t.id}>
          <div><strong>{t.description || transactionLabel(t.type)}</strong><span>{formatDate(t.created_at)}</span></div>
          <strong className={(t.amount ?? 0) >= 0 ? "positive" : "negative"}>{formatSigned(t.amount)}</strong>
        </li>
      ))}
    </ul>
  );
}

export function WalletPage({ go }: { go: (r: Route) => void }) {
  const stats = useAsync(fetchDashboard, []);
  const earn = useAsync(() => fetchTransactions({ page: 0, filter: "earnings" }), []);
  const spend = useAsync(() => fetchTransactions({ page: 0, filter: "spending" }), []);

  if (stats.loading) return <Loading />;
  if (stats.error || !stats.data) return <ErrorState message={stats.error} onRetry={stats.reload} />;
  const s = stats.data;

  return (
    <>
      <section className="stats-grid three">
        <StatCard label="Available balance" value={formatTokens(s.balance)} unit="TOKENS" caption="Ready to withdraw" tone="green" icon={<Wallet size={19} />} />
        <StatCard label="Total earned" value={formatTokens(s.lifetime_earned)} unit="TOKENS" caption="Rewards and referrals" tone="blue" icon={<TrendingUp size={19} />} />
        <StatCard label="Total withdrawn" value={formatTokens(s.lifetime_spent)} unit="TOKENS" caption="Net of refunds" tone="orange" icon={<ArrowUpRight size={19} />} />
      </section>
      <div className="two-col">
        <Panel kicker="INCOME" title="Earnings history" subtitle="Your latest credited tokens."
          action={<button className="text-link" onClick={() => go("transactions")}>All activity</button>}>
          {earn.loading ? <Loading /> : earn.error ? <ErrorState message={earn.error} onRetry={earn.reload} /> : <List rows={earn.data?.rows.slice(0, 8) ?? []} empty="No earnings yet" />}
        </Panel>
        <Panel kicker="OUTGOING" title="Spending history" subtitle="Withdrawals placed from your wallet."
          action={<button className="text-link" onClick={() => go("withdrawals")}><ArrowDownLeft size={14} /> Withdraw</button>}>
          {spend.loading ? <Loading /> : spend.error ? <ErrorState message={spend.error} onRetry={spend.reload} /> : <List rows={spend.data?.rows.slice(0, 8) ?? []} empty="No withdrawals yet" />}
        </Panel>
      </div>
    </>
  );
}
