import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, CalendarClock, CircleX, ShoppingBag, Wallet } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/components/ui/popover";
import type { Order } from "@/features/admin/orders/api";
import type { MenuRow } from "@core/domain/menu/api";
import { todayISO } from "@core/lib/format";
import { PushSettings } from "@/features/admin/push/push-settings";
import { cn } from "@core/lib/utils";
import {
  NOTIFICATION_GROUPS,
  NOTIFICATION_KINDS,
  buildNotifications,
  formatNotificationTime,
  loadSeen,
  saveSeen,
  type AdminNotification,
  type NotificationGroup,
  type NotificationKind,
} from "@/features/admin/notifications/notifications";

const KIND_STYLE: Record<NotificationKind, { icon: typeof Bell; className: string }> = {
  nouvelle_precommande: { icon: CalendarClock, className: "bg-[var(--brand-tint)] text-primary" },
  nouvelle_commande: { icon: ShoppingBag, className: "bg-sky-50 text-sky-700" },
  acompte_a_verifier: { icon: Wallet, className: "bg-amber-50 text-amber-700" },
  paiement_echoue: { icon: CircleX, className: "bg-rose-50 text-rose-700" },
  plat_epuise: { icon: AlertTriangle, className: "bg-orange-50 text-orange-700" },
};

export function NotificationBell({ orders, menu }: { orders: Order[]; menu: MenuRow[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<NotificationGroup | "all">("all");
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  // Recalcule les « il y a X min » chaque minute.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => setSeen(loadSeen()), []);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const notifications = useMemo(
    () => buildNotifications(orders, menu, todayISO(), now.getTime()),
    [orders, menu, now],
  );
  const unread = notifications.filter((n) => !seen.has(n.id));
  const visible = group === "all" ? notifications : notifications.filter((n) => n.group === group);

  function markAllRead() {
    const next = new Set(seen);
    notifications.forEach((n) => next.add(n.id));
    setSeen(next);
    saveSeen(next);
  }

  function openNotification(notification: AdminNotification) {
    const next = new Set(seen);
    next.add(notification.id);
    setSeen(next);
    saveSeen(next);
    setOpen(false);
    if (notification.reference) {
      navigate({ to: "/admin/orders", search: { q: notification.reference } });
    } else {
      navigate({ to: "/admin/weeks" });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unread.length > 0
              ? `Notifications, ${unread.length} non lue${unread.length > 1 ? "s" : ""}`
              : "Notifications"
          }
          className="relative flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Bell className="size-5" />
          {unread.length > 0 && (
            <span className="absolute right-1 top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold tabular-nums text-white ring-2 ring-card">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[min(26rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="font-semibold">Notifications</p>
          {unread.length > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-medium text-primary hover:underline"
            >
              Tout marquer comme lu
            </button>
          )}
        </div>
        <div
          role="group"
          aria-label="Type de notification"
          className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5"
        >
          {NOTIFICATION_GROUPS.map((option) => {
            const count =
              option.value === "all"
                ? unread.length
                : unread.filter((n) => n.group === option.value).length;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={group === option.value}
                onClick={() => setGroup(option.value)}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                  group === option.value
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
                {count > 0 && <span className="tabular-nums opacity-75">{count}</span>}
              </button>
            );
          })}
        </div>
        <ul className="max-h-[min(26rem,60vh)] divide-y divide-border overflow-y-auto">
          {visible.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              Aucune notification sur les 7 derniers jours.
            </li>
          ) : (
            visible.slice(0, 40).map((notification) => {
              const style = KIND_STYLE[notification.kind];
              const isUnread = !seen.has(notification.id);
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                      isUnread && "bg-[var(--brand-tint)]/40",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                        style.className,
                      )}
                    >
                      <style.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {NOTIFICATION_KINDS[notification.kind].label}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatNotificationTime(notification.at, notification.kind, now)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm font-medium">
                        {notification.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {notification.detail}
                      </span>
                    </span>
                    {isUnread && (
                      <span
                        className="mt-2 size-2 shrink-0 rounded-full bg-rose-600"
                        aria-label="Non lue"
                      />
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <PushSettings />
      </PopoverContent>
    </Popover>
  );
}
