
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  ShieldCheck,
  Zap,
  ExternalLink,
  Gift,
  Search,
  RefreshCw,
} from "lucide-react";

import {
  fetchMyCompletions,
  fetchTasks,
  startTask,
  createOfferwallSession,
  fetchOfferwallCatalog,
} from "../lib/api";

import { formatTokens, friendlyError } from "../lib/format";
import { useAsync } from "../hooks/useAsync";

import {
  Alert,
  Badge,
  EmptyState,
  ErrorState,
  Loading,
} from "../components/ui";

import type {
  Task,
  TaskCompletion,
  OfferwallOffer,
  OfferwallCategory,
} from "../lib/types";

function safeUrl(url: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    return parsed.protocol === "https:"
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

const categories: {
  id: "all" | OfferwallCategory;
  label: string;
}[] = [
  { id: "all", label: "All offers" },
  { id: "offers", label: "Offers" },
  { id: "surveys", label: "Surveys" },
  { id: "ptc", label: "PTC" },
  { id: "shortlinks", label: "Shortlinks" },
  { id: "tasks", label: "Tasks" },
];

function OfferCard({
  offer,
  onOpen,
  busy,
}: {
  offer: OfferwallOffer;
  onOpen: () => void;
  busy: boolean;
}) {
  const image = safeUrl(offer.image) || safeUrl(offer.cover);

  return (
    <article className="task-card offer-card">
      {image ? (
        <div
          style={{
            width: "100%",
            height: 150,
            overflow: "hidden",
            borderRadius: 10,
            marginBottom: 14,
            background: "var(--surface, #171717)",
          }}
        >
          <img
            src={image}
            alt={offer.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        </div>
      ) : (
        <div
          className="task-icon"
          style={{ marginBottom: 14 }}
        >
          <Gift size={25} />
        </div>
      )}

      <div className="task-card-top">
        <span className="chip">
          {offer.category.toUpperCase()}
        </span>

        {offer.multiStep && (
          <Badge status="pending" />
        )}
      </div>

      <h4>{offer.title}</h4>

      <p style={{ whiteSpace: "pre-line" }}>
        {offer.description || "Complete this offer to earn tokens."}
      </p>

      {offer.steps.length > 0 && (
        <div style={{ marginTop: 10, marginBottom: 12 }}>
          <div className="muted">
            {offer.steps.length} completion step
            {offer.steps.length === 1 ? "" : "s"}
          </div>
        </div>
      )}

      <div className="task-card-bottom">
        <div className="reward">
          <strong>+{formatTokens(offer.reward)}</strong>
          <span>tokens</span>
        </div>

        <button
          className="primary-button small"
          onClick={onOpen}
          disabled={busy}
          title="Open the Offerwall to find this opportunity"
        >
          View offers
          <ArrowUpRight size={14} />
        </button>
      </div>

      <div className="muted" style={{ marginTop: 10 }}>
        Reward subject to provider verification.
      </div>
    </article>
  );
}

export function Earn() {
  const tasks = useAsync(fetchTasks, []);
  const completions = useAsync(fetchMyCompletions, []);

  const [catalog, setCatalog] = useState<OfferwallOffer[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] =
    useState<"all" | OfferwallCategory>("all");

  const [search, setSearch] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const [offerwallBusy, setOfferwallBusy] = useState(false);

  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const loadCatalog = async () => {
    setCatalogLoading(true);
    setCatalogError(null);

    try {
      const result = await fetchOfferwallCatalog();
      setCatalog(result.offers || []);

      const failedCategories = Object.keys(result.errors || {});

      if (!result.offers?.length && failedCategories.length > 0) {
        setCatalogError(
          "The offer provider is temporarily unavailable. Please try again."
        );
      }
    } catch (error) {
      setCatalogError(friendlyError(error));
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

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
    } catch (error) {
      popup.close();

      setMessage({
        kind: "error",
        text: friendlyError(error),
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
          text: "Task started. Tokens are credited after provider confirmation.",
        });
      } else {
        popup?.close();

        setMessage({
          kind: "error",
          text: !url
            ? "This task has no valid provider link configured yet."
            : "Your browser blocked the new tab. Allow pop-ups and try again.",
        });
      }

      completions.reload();
    } catch (error) {
      popup?.close();

      setMessage({
        kind: "error",
        text: friendlyError(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const filteredOffers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return catalog.filter((offer) => {
      const matchesCategory =
        selectedCategory === "all" ||
        offer.category === selectedCategory;

      const matchesSearch =
        !normalizedSearch ||
        offer.title.toLowerCase().includes(normalizedSearch) ||
        offer.description.toLowerCase().includes(normalizedSearch);

      return matchesCategory && matchesSearch;
    });
  }, [catalog, selectedCategory, search]);

  if (tasks.loading || completions.loading) {
    return <Loading />;
  }

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
        Rewards are credited only after verified provider confirmation.
        Duplicate callbacks cannot pay twice.
      </div>

      {message && (
        <Alert
          kind={message.kind}
          onClose={() => setMessage(null)}
        >
          {message.text}
        </Alert>
      )}

      <section className="task-card" style={{ marginBottom: 24 }}>
        <div className="task-card-top">
          <div className="task-icon">
            <ExternalLink size={21} />
          </div>

          <span className="chip">Offerwall</span>
        </div>

        <h4>Discover earning opportunities</h4>

        <p>
          Explore offers, surveys and other activities from our
          provider. Complete eligible activities and receive
          tokens after verification.
        </p>

        <div className="task-card-bottom">
          <div className="muted">
            Secure provider verification
          </div>

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

      <section style={{ marginBottom: 30 }}>
        <div className="task-card-top" style={{ marginBottom: 14 }}>
          <div>
            <h3 style={{ marginBottom: 5 }}>Featured opportunities</h3>
            <p className="muted" style={{ margin: 0 }}>
              Available offers from our provider.
            </p>
          </div>

          <button
            className="primary-button small"
            onClick={loadCatalog}
            disabled={catalogLoading}
          >
            <RefreshCw size={14} />
            {catalogLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          {categories.map((category) => (
            <button
              key={category.id}
              className={
                selectedCategory === category.id
                  ? "primary-button small"
                  : "secondary-button small"
              }
              onClick={() => setSelectedCategory(category.id)}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div
          style={{
            position: "relative",
            marginBottom: 16,
          }}
        >
          <Search
            size={17}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              opacity: 0.6,
            }}
          />

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search offers..."
            aria-label="Search offers"
            style={{
              width: "100%",
              padding: "12px 12px 12px 38px",
              borderRadius: 8,
              border: "1px solid var(--border, #333)",
              background: "var(--surface, #171717)",
              color: "inherit",
            }}
          />
        </div>

        {catalogLoading ? (
          <Loading />
        ) : catalogError ? (
          <div>
            <Alert kind="error">{catalogError}</Alert>
            <button
              className="primary-button small"
              onClick={loadCatalog}
              style={{ marginTop: 10 }}
            >
              Try again
            </button>
          </div>
        ) : filteredOffers.length === 0 ? (
          <EmptyState
            title="No offers found"
            text={
              catalog.length === 0
                ? "There are no available offers right now. Please check again later."
                : "Try another category or search term."
            }
          />
        ) : (
          <div className="card-grid">
            {filteredOffers.map((offer) => (
              <OfferCard
                key={`${offer.provider}-${offer.id}`}
                offer={offer}
                onOpen={openOfferwall}
                busy={offerwallBusy}
              />
            ))}
          </div>
        )}
      </section>

      <section>
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
      </section>
    </>
  );
}
