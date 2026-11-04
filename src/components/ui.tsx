import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Loader2, X } from "lucide-react";
import { PAGE_SIZE } from "../lib/api";

export function Loading({ label = "Loading..." }: { label?: string }) {
  return <div className="state-box" role="status"><Loader2 className="spin" size={20} /> {label}</div>;
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="state-box empty">
      <Inbox size={26} />
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-box error" role="alert">
      <AlertCircle size={22} />
      <strong>Something went wrong</strong>
      <p>{message}</p>
      {onRetry && <button className="ghost-button" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Alert({ kind, children, onClose }: { kind: "success" | "error"; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`alert ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {kind === "success" ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
      <span>{children}</span>
      {onClose && <button onClick={onClose} aria-label="Dismiss"><X size={15} /></button>}
    </div>
  );
}

export function Panel({ kicker, title, subtitle, action, children }: {
  kicker?: string; title: string; subtitle?: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="panel page-panel">
      <div className="panel-heading">
        <div>
          {kicker && <div className="section-kicker">{kicker}</div>}
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, unit, caption, icon, tone }: {
  label: string; value: string; unit?: string; caption: string; icon: ReactNode; tone: "green" | "blue" | "purple" | "orange";
}) {
  return (
    <div className="stat-card">
      <div className="stat-top"><span>{label}</span><div className={`stat-icon ${tone}`}>{icon}</div></div>
      <div className="stat-number">{value} {unit && <small>{unit}</small>}</div>
      <div className="stat-bottom"><span className="muted">{caption}</span></div>
    </div>
  );
}

const statusTone: Record<string, string> = {
  pending: "warn", started: "warn", approved: "info", completed: "good", paid: "good", rewarded: "good",
  processed: "good", rejected: "bad", expired: "bad", received: "info", duplicate: "info",
};

export function Badge({ status }: { status: string }) {
  return <span className={`badge ${statusTone[status] ?? "info"}`}>{status}</span>;
}

export function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
      <span>Page {page + 1} of {pages}</span>
      <button disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
    </nav>
  );
}
