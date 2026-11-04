import { useCallback, useEffect, useRef, useState } from "react";
import { friendlyError } from "../lib/format";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => void;
}

/** Runs `load` on mount and whenever `deps` change; ignores stale responses. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    loadRef.current()
      .then((result) => { if (!cancelled) setData(result); })
      .catch((e) => { if (!cancelled) setError(friendlyError(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
