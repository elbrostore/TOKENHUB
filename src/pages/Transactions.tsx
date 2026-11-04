import { useState } from "react";
import { fetchTransactions } from "../lib/api";
import { TX_TYPES, formatDate, formatSigned, transactionLabel } from "../lib/format";
import { useAsync } from "../hooks/useAsync";
import { Badge, EmptyState, ErrorState, Loading, Pagination, Panel } from "../components/ui";

export function Transactions() {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<"all" | "earnings" | "spending">("all");
  const [type, setType] = useState("");
  const result = useAsync(() => fetchTransactions({ page, filter, type: type || undefined }), [page, filter, type]);

  return (
    <Panel kicker="WALLET HISTORY" title="All transactions" subtitle="Every movement on your wallet, newest first.">
      <div className="filters">
        <label>Direction
          <select value={filter} onChange={(e) => { setFilter(e.target.value as typeof filter); setPage(0); }}>
            <option value="all">All</option><option value="earnings">Earnings</option><option value="spending">Spending</option>
          </select>
        </label>
        <label>Type
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(0); }}>
            <option value="">All types</option>
            {TX_TYPES.map((t) => <option key={t} value={t}>{transactionLabel(t)}</option>)}
          </select>
        </label>
      </div>
      {result.loading ? <Loading /> : result.error ? <ErrorState message={result.error} onRetry={result.reload} /> :
        !result.data?.rows.length ? <EmptyState title="No transactions found" text="Try another filter, or earn your first tokens." /> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Description</th><th>Type</th><th>Date</th><th className="num">Amount</th><th className="num">Balance after</th><th>Status</th></tr></thead>
              <tbody>
                {result.data.rows.map((t) => (
                  <tr key={t.id}>
                    <td>{t.description || "—"}</td>
                    <td>{transactionLabel(t.type)}</td>
                    <td>{formatDate(t.created_at)}</td>
                    <td className={`num ${(t.amount ?? 0) >= 0 ? "positive" : "negative"}`}>{formatSigned(t.amount)}</td>
                    <td className="num">{t.balance_after ?? "—"}</td>
                    <td><Badge status={t.status ?? "completed"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <Pagination page={page} total={result.data?.total ?? 0} onPage={setPage} />
    </Panel>
  );
}
