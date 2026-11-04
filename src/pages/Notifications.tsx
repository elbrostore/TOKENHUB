import { useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { fetchNotifications, markNotificationsRead } from "../lib/api";
import { formatDate, friendlyError } from "../lib/format";
import { useAsync } from "../hooks/useAsync";
import { Alert, EmptyState, ErrorState, Loading, Panel } from "../components/ui";

export function Notifications({ onChanged }: { onChanged: () => void }) {
  const list = useAsync(fetchNotifications, []);
  const [error, setError] = useState("");

  const mark = async (ids?: string[]) => {
    setError("");
    try {
      await markNotificationsRead(ids);
      list.reload();
      onChanged();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const unread = list.data?.filter((n) => !n.is_read).length ?? 0;

  return (
    <Panel kicker="INBOX" title="Notifications" subtitle={unread ? `${unread} unread` : "You are all caught up."}
      action={<button className="ghost-button" disabled={!unread} onClick={() => mark()}><CheckCheck size={15} /> Mark all as read</button>}>
      {error && <Alert kind="error" onClose={() => setError("")}>{error}</Alert>}
      {list.loading ? <Loading /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> :
        !list.data?.length ? <EmptyState title="No notifications yet" text="Account, reward and withdrawal updates will appear here." /> : (
          <ul className="notification-list">
            {list.data.map((n) => (
              <li key={n.id} className={n.is_read ? "" : "unread"}>
                <div className="notif-icon"><Bell size={16} /></div>
                <div className="notif-body"><strong>{n.title}</strong>{n.body && <p>{n.body}</p>}<span>{formatDate(n.created_at)}</span></div>
                {!n.is_read && <button className="text-link" onClick={() => mark([n.id])}>Mark read</button>}
              </li>
            ))}
          </ul>
        )}
    </Panel>
  );
}
