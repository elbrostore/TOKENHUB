import { ArrowUpRight, CheckCircle2, ChevronRight, Clock3, TrendingUp, Users, Wallet, Zap } from "lucide-react";
import { fetchDashboard, fetchTasks, fetchTransactions } from "../lib/api";
import { formatDate, formatSigned, formatTokens, transactionLabel } from "../lib/format";
import { useAsync } from "../hooks/useAsync";
import { useAuth } from "../auth/useAuth";
import { EmptyState, ErrorState, Loading, StatCard } from "../components/ui";
import type { Route } from "../routes";

export function Dashboard({ go }: { go: (r: Route) => void }) {
  const { profile, user } = useAuth();
  const stats = useAsync(fetchDashboard, []);
  const tx = useAsync(() => fetchTransactions({ page: 0, filter: "all" }), []);
  const tasks = useAsync(fetchTasks, []);
  const name = profile?.username || profile?.full_name || user?.email?.split("@")[0] || "Member";

  if (stats.loading) return <Loading />;
  if (stats.error || !stats.data) return <ErrorState message={stats.error || "No data"} onRetry={stats.reload} />;
  const s = stats.data;

  return (
    <>
      <section className="welcome-row">
        <div>
          <div className="eyebrow"><span className="live-dot" /> YOUR REWARDS, YOUR PROGRESS</div>
          <h2>Welcome, <span>{name}.</span></h2>
          <p>Complete activities, collect tokens and track your progress.</p>
        </div>
        <button className="primary-button" onClick={() => go("earn")}><Zap size={17} /> Start earning <ArrowUpRight size={16} /></button>
      </section>

      <section className="stats-grid">
        <StatCard label="Total balance" value={formatTokens(s.balance)} unit="TOKENS" caption="Your available balance" tone="green" icon={<Wallet size={19} />} />
        <StatCard label="Total earned" value={formatTokens(s.lifetime_earned)} unit="TOKENS" caption="Lifetime earnings" tone="blue" icon={<TrendingUp size={19} />} />
        <StatCard label="Completed tasks" value={formatTokens(s.completed_tasks)} caption="Verified completions" tone="purple" icon={<CheckCircle2 size={19} />} />
        <StatCard label="Referral rewards" value={formatTokens(s.referral_earnings)} unit="TOKENS" caption={`${s.referrals_rewarded} of ${s.referrals_total} referrals rewarded`} tone="orange" icon={<Users size={19} />} />
      </section>
           <section className="content-grid">
        <div className="panel earn-panel">
          <div className="panel-heading">
            <div><div className="section-kicker">OPPORTUNITIES</div><h3>Ways to earn</h3><p>Choose an activity to get started.</p></div>
            <button className="text-link" onClick={() => go("earn")}>View all <ChevronRight size={16} /></button>
          </div>
          {tasks.loading ? <Loading /> : tasks.error ? <ErrorState message={tasks.error} onRetry={tasks.reload} /> :
            !tasks.data?.length ? <EmptyState title="No active tasks yet" text="New earning opportunities will appear here when they are published." /> : (
              <div className="task-list">
                {tasks.data.slice(0, 3).map((t) => (
                  <div className="task-item" key={t.id}>
                    <div className="task-icon"><Zap size={21} /></div>
                    <div className="task-details"><strong>{t.title}</strong><span>{t.description}</span><small>{t.task_type}</small></div>
                    <div className="task-action"><strong>+{formatTokens(t.reward)}</strong><span>tokens</span></div>
                  </div>
                ))}
              </div>
            )}
        </div>

        <div className="panel progress-panel">
          <div className="section-kicker">YOUR ACTIVITY</div>
          <h3>Account overview</h3>
          <p className="panel-description">A live summary of your account.</p>
          <dl className="overview-list">
            <div><dt>Tokens withdrawn</dt><dd>{formatTokens(s.lifetime_spent)}</dd></div>
            <div><dt>Open withdrawals</dt><dd>{s.pending_withdrawals}</dd></div>
            <div><dt>Unread notifications</dt><dd>{s.unread_notifications}</dd></div>
            <div><dt>Referral code</dt><dd className="mono">{profile?.referral_code ?? "—"}</dd></div>
          </dl>
          <button className="ghost-button" onClick={() => go("withdrawals")}>Withdraw tokens</button>
        </div>
      </section>

      <section className="panel transactions-panel">
        <div className="panel-heading">
          <div><div className="section-kicker">WALLET HISTORY</div><h3>Recent transactions</h3><p>Keep track of your latest activity.</p></div>
          <button className="text-link" onClick={() => go("transactions")}>View history <ChevronRight size={16} /></button>
        </div>
        {tx.loading ? <Loading /> : tx.error ? <ErrorState message={tx.error} onRetry={tx.reload} /> :
          !tx.data?.rows.length ? <EmptyState title="No transactions yet" text="Your rewards and withdrawals will be listed here." /> : (
            <div className="transaction-table">
              <div className="table-head"><span>DESCRIPTION</span><span>DATE</span><span>AMOUNT</span><span>STATUS</span></div>
              {tx.data.rows.slice(0, 5).map((t) => (
                <div className="transaction-row" key={t.id}>
                  <div className="transaction-name"><div className="transaction-icon"><CheckCircle2 size={17} /></div><strong>{t.description || transactionLabel(t.type)}</strong></div>
                  <span className="transaction-date"><Clock3 size={14} />{formatDate(t.created_at)}</span>
                  <strong className={(t.amount ?? 0) >= 0 ? "positive" : "negative"}>{formatSigned(t.amount)} <small>TOK</small></strong>
                  <span className="status-ok">{t.status ?? "completed"}</span>
                </div>
              ))}
            </div>
          )}
      </section>
    </>
  );
}
