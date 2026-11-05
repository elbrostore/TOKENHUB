
import { useState } from "react";
import { ArrowUpRight, ShieldCheck, Zap, ExternalLink } from "lucide-react";
import {
  fetchMyCompletions,
  fetchTasks,
  startTask,
  createOfferwallSession,
  checkOfferwallIpHeaders,
} from "../lib/api";
import { formatTokens, friendlyError } from "../lib/format";
import { useAsync } from "../hooks/useAsync";
import { Alert, Badge, EmptyState, ErrorState, Loading } from "../components/ui";
import type { Task, TaskCompletion } from "../lib/types";

function safeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function taskState(task: Task, completions: TaskCompletion[]) {
  const mine = completions.filter((c) => c.task_id === task.id);
  const done = mine.filter((c) => c.status === "completed").length;
  const open = mine.some((c) => c.status === "started");

  return {
    done,
    open,
    limitReached: done >= task.max_completions_per_user,
  };
}

export function Earn() {
  const tasks = useAsync(fetchTasks, []);
  const completions = useAsync(fetchMyCompletions, []);

  const [busy, setBusy] = useState<string | null>(null);
  const [offerwallBusy, setOfferwallBusy] = useState(false);
  const [ipCheckBusy, setIpCheckBusy] = useState(false);
  const [ipDiagnostic, setIpDiagnostic] = useState<unknown>(null);

  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const runIpDiagnostic = async () => {
    setIpCheckBusy(true);
    setIpDiagnostic(null);

    try {
      const result = await checkOfferwallIpHeaders();
      setIpDiagnostic(result);
    } catch (error) {
      setIpDiagnostic({
        success: false,
        error: friendlyError(error),
      });
    } finally {
      setIpCheckBusy(false);
    }
  };

  const openOfferwall = async () => {
    setMessage(null);

    const popup = window.open("about:blank", "_blank");

    if (!popup) {
      setMessage({
        kind: "error",
        text: "Your browser blocked the new tab. Allow pop-ups and try again.",
      });
      return;
    }

    popup.opener = null;
    setOfferwallBusy(true);

    try {
      const session = await createOfferwallSession();
      const url = safeUrl(session.url);

      if (!url || !url.startsWith("https://offerwall.me/")) {
        throw new Error("Invalid Offerwall URL returned by the server.");
      }

      popup.location.replace(url);

      setMessage({
        kind: "success",
        text: "Offerwall opened. Complete offers honestly and wait for verified provider confirmation.",
      });
    } catch (e) {
      popup.close();
      setMessage({
        kind: "error",
        text: friendlyError(e),
      });
    } finally {
      setOfferwallBusy(false);
    }
  };

  const begin = async (task: Task) => {
    setBusy(task.id);
    setMessage(null);

    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;

    try {
      const result = await startTask(task.id);
      const url = safeUrl(result.action_url);

      if (url && popup) {
        popup.location.replace(url);
        setMessage({
          kind: "success",
          text: "Task started. Your tokens are credited automatically after the provider confirms completion.",
        });
      } else {
        popup?.close();
        setMessage({
          kind: "error",
          text: !url
            ? "This task has no valid provider link configured yet. Please try again later."
            : "Your browser blocked the new tab. Allow pop-ups and click Continue again.",
        });
      }

      completions.reload();
    } catch (e) {
      popup?.close();
      setMessage({ kind: "error", text: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  };

  if (tasks.loading || completions.loading) return <Loading />;

  if (tasks.error) {
    return <ErrorState message={tasks.error} onRetry={tasks.reload} />;
  }

  if (completions.error) {
    return (
      <ErrorState
        message={completions.error}
        onRetry={completions.reload}
      />
    );
  }

  const list = tasks.data ?? [];
  const mine = completions.data ?? [];

  return (
    <>
      <div className="info-banner">
        <ShieldCheck size={18} />
        Rewards are only credited after a verified provider confirmation.
        Completing a task a second time, or replaying a callback, never pays twice.
      </div>

      {message && (
        <Alert kind={message.kind} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <section className="task-card" style={{ marginBottom: 20 }}>
        <h4>IP Headers Diagnostic</h4>
        <p>
          Check which IP-related headers are visible to the Supabase Edge Function.
          No IP address or secret is displayed.
        </p>

        <button
          className="primary-button small"
          disabled={ipCheckBusy}
          onClick={runIpDiagnostic}
        >
          {ipCheckBusy ? "Testing..." : "Test IP Headers"}
        </button>

        {ipDiagnostic !== null && (
          <pre
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 8,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(ipDiagnostic, null, 2)}
          </pre>
        )}
      </section>

      <section className="task-card" style={{ marginBottom: 20 }}>
        <div className="task-card-top">
          <div className="task-icon">
            <ExternalLink size={21} />
          </div>
          <span className="chip">Offerwall</span>
        </div>

        <h4>Discover more earning opportunities</h4>
        <p>
          Complete eligible offers from our provider. Rewards are credited
          only after the provider verifies the transaction.
        </p>

        <div className="task-card-bottom">
          <div className="muted">Secure provider verification</div>

          <button
            className="primary-button small"
            disabled={offerwallBusy}
            onClick={openOfferwall}
          >
            {offerwallBusy ? "Opening..." : "Open Offerwall"}
            <ArrowUpRight size={14} />
          </button>
        </div>
      </section>

      <h3>Available Tasks</h3>

      {!list.length ? (
        <EmptyState
          title="No active tasks right now"
          text="Check back soon: new earning opportunities are published regularly."
        />
      ) : (
        <div className="card-grid">
          {list.map((task) => {
            const st = taskState(task, mine);

            return (
              <article className="task-card" key={task.id}>
                <div className="task-card-top">
                  <div className="task-icon">
                    <Zap size={21} />
                  </div>
                  <span className="chip">{task.task_type}</span>
                </div>

                <h4>{task.title}</h4>
                <p>
                  {task.description ||
                    "Complete this activity to earn tokens."}
                </p>

                <div className="task-card-bottom">
                  <div className="reward">
                    <strong>+{formatTokens(task.reward)}</strong>
                    <span>tokens</span>
                  </div>

                  {st.limitReached ? (
                    <Badge status="completed" />
                  ) : (
                    <button
                      className="primary-button small"
                      disabled={busy === task.id}
                      onClick={() => begin(task)}
                    >
                      {st.open ? "Continue" : "Start"}
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>

                {st.open && !st.limitReached && (
                  <div className="muted">
                    In progress: waiting for provider confirmation.
                  </div>
                )}

                {st.done > 0 && (
                  <div className="muted">
                    Completed {st.done} / {task.max_completions_per_user}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
