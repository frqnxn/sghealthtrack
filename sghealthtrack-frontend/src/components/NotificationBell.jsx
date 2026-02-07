import { useEffect, useMemo, useState } from "react";

function NotificationBell({
  notifications = [],
  loading = false,
  onMarkAllRead,
  autoMarkReadOnOpen = false,
}) {
  const [open, setOpen] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read_at && !n.is_read).length,
    [notifications]
  );

  useEffect(() => {
    function onDocClick(e) {
      if (!open) return;
      const el = document.getElementById("notif-popover");
      const btn = document.getElementById("notif-bell-btn");
      if (el && el.contains(e.target)) return;
      if (btn && btn.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open || !autoMarkReadOnOpen) return;
    if (unreadCount === 0) return;
    onMarkAllRead?.();
  }, [open, unreadCount, onMarkAllRead, autoMarkReadOnOpen]);

  return (
    <div className="notif-wrapper">
      <button
        id="notif-bell-btn"
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        className="notif-button"
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M15 17H9m9-2V11a6 6 0 10-12 0v4l-2 2h16l-2-2z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div id="notif-popover" className="notif-popover">
          <div className="notif-header">
            <div className="notif-title">Notifications</div>
            <button
              className="notif-action"
              onClick={onMarkAllRead}
              disabled={loading || notifications.length === 0}
            >
              Mark read
            </button>
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications yet.</div>
            ) : (
              <div className="notif-items">
                {notifications.slice(0, 15).map((n) => {
                  const read = !!(n.read_at || n.is_read);
                  return (
                    <div key={n.id} className={`notif-item ${read ? "read" : "unread"}`}>
                      <div className="notif-item-main">
                        <div className="notif-item-title">{n.title || "Notification"}</div>
                        {n.body && <div className="notif-item-body">{n.body}</div>}
                      </div>
                      <div className="notif-item-time">
                        {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="notif-footer">
            <button className="notif-close" onClick={() => setOpen(false)} type="button">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
