import { useState } from "react";
import type { FormEvent } from "react";
import { Search } from "lucide-react";
import {
  adminAllTasks, adminAllWithdrawals, adminProviderEvents, adminReviewWithdrawal, adminSaveSettings,
  adminSaveTask, adminSetUserActive, adminStats, adminUsers, emailMap, fetchSettings, fetchTransactions, PAGE_SIZE,
} from "../../lib/api";
import type { TaskInput } from "../../lib/api";
import { formatDate, formatSigned, formatTokens, friendlyError, methodLabel, transactionLabel } from "../../lib/format";
import { useAsync } from "../../hooks/useAsync";
import { useAuth } from "../../auth/useAuth";
import { Alert, Badge, EmptyState, ErrorState, Loading, Pagination, Panel, StatCard } from "../../components/ui";
import type { Task } from "../../lib/types";

const TABS = ["Overview", "Users", "Tasks", "Withdrawals", "Transactions", "Provider events", "Settings"] as const;
type Tab = (typeof TABS)[number];

export function Admin() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>("Overview");
  // UI guard only: every admin read/write is enforced again by RLS and is_admin() checks in the database.
  if (!isAdmin) return <EmptyState title="Administrators only" text="You do not have access to this area." />;
  return (
    <>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === "Overview" && <Overview />}
      {tab === "Users" && <Users />}
      {tab === "Tasks" && <Tasks />}
      {tab === "Withdrawals" && <WithdrawalsAdmin />}
      {tab === "Transactions" && <TransactionsAdmin />}
      {tab === "Provider events" && <Events />}
      {tab === "Settings" && <SettingsAdmin />}
    </>
  );
}

function Overview() {
  const stats = useAsync(adminStats, []);
  if (stats.loading) return <Loading />;
  if (stats.error || !stats.data) return <ErrorState message={stats.error} onRetry={stats.reload} />;
  const s = stats.data;
  return (
    <section className="stats-grid">
      <StatCard label="Users" value={formatTokens(s.users)} caption={`${s.active_users} active`} tone="blue" icon={null} />
      <StatCard label="Tokens in wallets" value={formatTokens(s.tokens_in_wallets)} caption="Outstanding liability" tone="green" icon={null} />
      <StatCard label="Tokens issued" value={formatTokens(s.tokens_issued)} caption="Rewards + referrals" tone="purple" icon={null} />
      <StatCard label="Verified completions" value={formatTokens(s.completions)} caption={`${s.active_tasks} active tasks`} tone="orange" icon={null} />
      <StatCard label="Pending withdrawals" value={formatTokens(s.pending_withdrawals)} caption={`${formatTokens(s.pending_withdrawal_tokens)} tokens on hold`} tone="orange" icon={null} />
      <StatCard label="Tokens paid out" value={formatTokens(s.paid_withdrawal_tokens)} caption="Withdrawals marked paid" tone="green" icon={null} />
      <StatCard label="Rejected provider events" value={formatTokens(s.rejected_provider_events)} caption="Possible fraud or misconfiguration" tone="purple" icon={null} />
    </section>
  );
}

function Users() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [msg, setMsg] = useState("");
  const users = useAsync(() => adminUsers(query, page), [query, page]);

  const toggle = async (id: string, active: boolean) => {
    setMsg("");
    try { await adminSetUserActive(id, active); users.reload(); } catch (e) { setMsg(friendlyError(e)); }
  };
  const total = users.data?.[0]?.total_count ?? 0;

  return (
    <Panel kicker="ACCOUNTS" title="User management">
      <form className="filters" onSubmit={(e: FormEvent) => { e.preventDefault(); setPage(0); setQuery(search.trim()); }}>
        <label className="grow">Search<input placeholder="Email or username" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <button className="ghost-button" type="submit"><Search size={15} /> Search</button>
      </form>
      {msg && <Alert kind="error" onClose={() => setMsg("")}>{msg}</Alert>}
      {users.loading ? <Loading /> : users.error ? <ErrorState message={users.error} onRetry={users.reload} /> :
        !users.data?.length ? <EmptyState title="No users found" /> : (
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>User</th><th>Joined</th><th className="num">Balance</th><th className="num">Earned</th><th>Status</th><th /></tr></thead>
            <tbody>{users.data.map((u) => (
              <tr key={u.id}>
                <td>{u.email ?? u.id}{u.username ? ` (${u.username})` : ""}{u.is_admin && <span className="chip">admin</span>}</td>
                <td>{formatDate(u.created_at)}</td>
                <td className="num">{formatTokens(u.balance)}</td><td className="num">{formatTokens(u.lifetime_earned)}</td>
                <td><Badge status={u.is_active ? "completed" : "rejected"} /></td>
                <td>{u.id !== user?.id && <button className="ghost-button small" onClick={() => toggle(u.id, !u.is_active)}>{u.is_active ? "Suspend" : "Reactivate"}</button>}</td>
              </tr>))}
            </tbody></table></div>
        )}
      <Pagination page={page} total={total} onPage={setPage} />
    </Panel>
  );
}

const emptyTask: TaskInput = { title: "", description: "", task_type: "offer", reward: 0, provider: "", action_url: "", is_active: true, max_completions_per_user: 1 };

function Tasks() {
  const tasks = useAsync(adminAllTasks, []);
  const [editing, setEditing] = useState<(Task | null)>(null);
  const [form, setForm] = useState<TaskInput>(emptyTask);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  const edit = (t: Task | null) => {
    setEditing(t);
    setForm(t ? { title: t.title, description: t.description ?? "", task_type: t.task_type, reward: t.reward, provider: t.provider ?? "", action_url: t.action_url ?? "", is_active: t.is_active, max_completions_per_user: t.max_completions_per_user } : emptyTask);
    setOpen(true); setMsg(null);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await adminSaveTask(editing?.id ?? null, {
        ...form, reward: Math.max(0, Math.floor(Number(form.reward))), max_completions_per_user: Math.max(1, Math.floor(Number(form.max_completions_per_user))),
        provider: form.provider?.trim().toLowerCase() || null, action_url: form.action_url?.trim() || null, description: form.description?.trim() || null,
      });
      setOpen(false); tasks.reload(); setMsg({ kind: "success", text: "Task saved." });
    } catch (e) { setMsg({ kind: "error", text: friendlyError(e) }); }
  };
  const toggle = async (t: Task) => {
    try { await adminSaveTask(t.id, { ...t, is_active: !t.is_active }); tasks.reload(); } catch (e) { setMsg({ kind: "error", text: friendlyError(e) }); }
  };

  return (
    <Panel kicker="CATALOG" title="Task management" subtitle="Rewards are always taken from this table, never from a provider message."
      action={<button className="primary-button small" onClick={() => edit(null)}>New task</button>}>
      {msg && <Alert kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      {open && (
        <form className="stack-form boxed" onSubmit={save}>
          <label htmlFor="t-title">Title</label><input id="t-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label htmlFor="t-desc">Description</label><input id="t-desc" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="form-grid">
            <div><label htmlFor="t-type">Type</label><input id="t-type" value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value })} /></div>
            <div><label htmlFor="t-reward">Reward (tokens)</label><input id="t-reward" type="number" min={0} required value={form.reward} onChange={(e) => setForm({ ...form, reward: Number(e.target.value) })} /></div>
            <div><label htmlFor="t-max">Max completions / user</label><input id="t-max" type="number" min={1} value={form.max_completions_per_user} onChange={(e) => setForm({ ...form, max_completions_per_user: Number(e.target.value) })} /></div>
            <div><label htmlFor="t-provider">Provider key</label><input id="t-provider" placeholder="e.g. acme" value={form.provider ?? ""} onChange={(e) => setForm({ ...form, provider: e.target.value })} /></div>
          </div>
          <label htmlFor="t-url">Provider URL (use {"{click_id}"} where the provider expects the sub-id)</label>
          <input id="t-url" type="url" placeholder="https://provider.example/offer?sub={click_id}" value={form.action_url ?? ""} onChange={(e) => setForm({ ...form, action_url: e.target.value })} />
          <label className="check"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Active</label>
          <div className="button-row"><button className="primary-button small" type="submit">Save task</button><button type="button" className="ghost-button small" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
      {tasks.loading ? <Loading /> : tasks.error ? <ErrorState message={tasks.error} onRetry={tasks.reload} /> :
        !tasks.data?.length ? <EmptyState title="No tasks yet" text="Create the first task to publish it to users." /> : (
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>Title</th><th>Provider</th><th className="num">Reward</th><th className="num">Max</th><th>Status</th><th /></tr></thead>
            <tbody>{tasks.data.map((t) => (
              <tr key={t.id}><td>{t.title}</td><td>{t.provider ?? "—"}</td><td className="num">{formatTokens(t.reward)}</td><td className="num">{t.max_completions_per_user}</td>
                <td><Badge status={t.is_active ? "completed" : "rejected"} /></td>
                <td className="actions"><button className="ghost-button small" onClick={() => edit(t)}>Edit</button><button className="ghost-button small" onClick={() => toggle(t)}>{t.is_active ? "Deactivate" : "Activate"}</button></td></tr>))}
            </tbody></table></div>
        )}
    </Panel>
  );
}

function WithdrawalsAdmin() {
  const [status, setStatus] = useState("pending");
  const list = useAsync(() => adminAllWithdrawals(status), [status]);
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});

  const act = async (id: string, action: "approve" | "reject" | "pay") => {
    setMsg("");
    try { await adminReviewWithdrawal(id, action, note[id] ?? ""); list.reload(); } catch (e) { setMsg(friendlyError(e)); }
  };

  return (
    <Panel kicker="PAYOUTS" title="Withdrawal management" subtitle="Rejecting a request returns the tokens to the user's wallet exactly once.">
      <div className="filters"><label>Status
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="rejected">Rejected</option><option value="">All</option>
        </select></label></div>
      {msg && <Alert kind="error" onClose={() => setMsg("")}>{msg}</Alert>}
      {list.loading ? <Loading /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> :
        !list.data?.length ? <EmptyState title="No withdrawal requests" /> : (
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>User</th><th>Requested</th><th className="num">Amount</th><th>Method / details</th><th>Status</th><th>Decision</th></tr></thead>
            <tbody>{list.data.map((w) => (
              <tr key={w.id}>
                <td>{w.email ?? w.user_id}</td><td>{formatDate(w.created_at)}</td><td className="num">{formatTokens(w.amount_tokens ?? w.amount)}</td>
                <td>
  {methodLabel(w.payout_details?.requested_method ?? w.method ?? w.payout_method)}
  <br />
  <code>{w.payout_details?.destination ?? w.destination ?? ""}</code>
</td><td><Badge status={w.status} /></td>
                <td className="actions">
                  {(w.status === "pending" || w.status === "approved") && (<>
                    <input className="note-input" placeholder="Note (optional)" value={note[w.id] ?? ""} onChange={(e) => setNote({ ...note, [w.id]: e.target.value })} aria-label="Admin note" />
                    {w.status === "pending" && <button className="ghost-button small" onClick={() => act(w.id, "approve")}>Approve</button>}
                    {w.status === "approved" && <button className="ghost-button small" onClick={() => act(w.id, "pay")}>Mark paid</button>}
                    <button className="ghost-button small danger" onClick={() => act(w.id, "reject")}>Reject</button>
                  </>)}
                </td>
              </tr>))}
            </tbody></table></div>
        )}
    </Panel>
  );
}

function TransactionsAdmin() {
  const [page, setPage] = useState(0);
  const result = useAsync(async () => {
    const r = await fetchTransactions({ page, filter: "all" });
    const emails = await emailMap(r.rows.map((t) => t.user_id));
    return { ...r, emails };
  }, [page]);
  return (
    <Panel kicker="MONITORING" title="All transactions" subtitle={`${PAGE_SIZE} per page, newest first.`}>
      {result.loading ? <Loading /> : result.error ? <ErrorState message={result.error} onRetry={result.reload} /> :
        !result.data?.rows.length ? <EmptyState title="No transactions yet" /> : (
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>User</th><th>Type</th><th>Description</th><th>Date</th><th className="num">Amount</th></tr></thead>
            <tbody>{result.data.rows.map((t) => (
              <tr key={t.id}><td>{result.data!.emails.get(t.user_id) ?? t.user_id}</td><td>{transactionLabel(t.type)}</td><td>{t.description ?? "—"}</td><td>{formatDate(t.created_at)}</td>
                <td className={`num ${(t.amount ?? 0) >= 0 ? "positive" : "negative"}`}>{formatSigned(t.amount)}</td></tr>))}
            </tbody></table></div>
        )}
      <Pagination page={page} total={result.data?.total ?? 0} onPage={setPage} />
    </Panel>
  );
}

function Events() {
  const events = useAsync(adminProviderEvents, []);
  return (
    <Panel kicker="PROVIDERS" title="Provider event monitoring" subtitle="Latest 100 callbacks received. Rejected events indicate fraud attempts or misconfiguration.">
      {events.loading ? <Loading /> : events.error ? <ErrorState message={events.error} onRetry={events.reload} /> :
        !events.data?.length ? <EmptyState title="No provider events yet" text="Events appear here once a provider callback is connected and receives traffic." /> : (
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>Received</th><th>Provider</th><th>Event id</th><th>Type</th><th>Status</th><th>Reason</th></tr></thead>
            <tbody>{events.data.map((e) => (
              <tr key={e.id}><td>{formatDate(e.received_at)}</td><td>{e.provider}</td><td><code>{e.event_id}</code></td><td>{e.event_type}</td><td><Badge status={e.status} /></td><td>{e.error ?? "—"}</td></tr>))}
            </tbody></table></div>
        )}
    </Panel>
  );
}

function SettingsAdmin() {
  const settings = useAsync(fetchSettings, []);
  const [min, setMin] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  const [methods, setMethods] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  if (settings.loading) return <Loading />;
  if (settings.error || !settings.data) return <ErrorState message={settings.error} onRetry={settings.reload} />;
  const s = settings.data;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await adminSaveSettings({
        min_withdrawal_tokens: Math.max(1, Math.floor(Number(min ?? s.min_withdrawal_tokens))),
        referral_reward_tokens: Math.max(0, Math.floor(Number(ref ?? s.referral_reward_tokens))),
        payout_methods: (methods ?? s.payout_methods.join(",")).split(",").map((m) => m.trim().toLowerCase().replace(/\s+/g, "_")).filter(Boolean),
      });
      setMsg({ kind: "success", text: "Settings saved." }); settings.reload();
    } catch (e) { setMsg({ kind: "error", text: friendlyError(e) }); }
  };

  return (
    <Panel kicker="CONFIGURATION" title="Platform settings" subtitle="Applies immediately to new withdrawals and referral rewards.">
      {msg && <Alert kind={msg.kind} onClose={() => setMsg(null)}>{msg.text}</Alert>}
      <form className="stack-form" onSubmit={save}>
        <label htmlFor="s-min">Minimum withdrawal (tokens)</label>
        <input id="s-min" type="number" min={1} value={min ?? s.min_withdrawal_tokens} onChange={(e) => setMin(e.target.value)} />
        <label htmlFor="s-ref">Referral reward (tokens, 0 disables)</label>
        <input id="s-ref" type="number" min={0} value={ref ?? s.referral_reward_tokens} onChange={(e) => setRef(e.target.value)} />
        <label htmlFor="s-methods">Payout methods (comma separated keys)</label>
        <input id="s-methods" value={methods ?? s.payout_methods.join(", ")} onChange={(e) => setMethods(e.target.value)} />
        <button className="primary-button" type="submit">Save settings</button>
      </form>
    </Panel>
  );
}
