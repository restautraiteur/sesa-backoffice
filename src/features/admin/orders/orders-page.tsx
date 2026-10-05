import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Printer,
  Receipt,
  Scissors,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ui/components/ui/dropdown-menu";
import { db } from "@core/lib/db";
import {
  orderItemsQuery,
  ordersQuery,
  type Order,
  type OrderItem,
} from "@/features/admin/orders/api";
import { exportOrdersCsv, exportOrdersExcel } from "@/features/admin/orders/export-orders";
import {
  formatDay,
  formatPrice,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
} from "@core/lib/format";
import { printOrders, printTickets } from "@/features/admin/orders/print";
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  TonePill,
  ToneSelect,
} from "@/features/admin/components/admin-ui";
import { ORDER_STATUS_TONES, PAYMENT_STATUS_TONES } from "@/features/admin/components/status-tones";
import { cn } from "@core/lib/utils";
import { CLIENT } from "@/config/client";
import { SendMessageButton } from "@/features/admin/subscriptions/send-message-button";
import {
  deliveredMessage,
  remainingMeals,
  subscriptionsQuery,
} from "@/features/admin/subscriptions/api";

type Patch = { id: string; patch: Record<string, unknown> };

export function OrdersPage() {
  const queryClient = useQueryClient();
  const { data: orders = [], isLoading } = useQuery(ordersQuery());
  const { data: items = [] } = useQuery(orderItemsQuery());
  const { q } = useSearch({ strict: false }) as { q?: string };
  const [search, setSearch] = useState(q ?? "");
  useEffect(() => {
    if (q) setSearch(q);
  }, [q]);
  const [status, setStatus] = useState("all");
  const [day, setDay] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<Order | null>(null);

  const days = useMemo(() => [...new Set(items.map((i) => i.day_date))].sort(), [items]);

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    for (const item of items) map.set(item.order_id, [...(map.get(item.order_id) ?? []), item]);
    return map;
  }, [items]);

  // Commandes filtrées par jour et recherche, avant le filtre de statut (pour compter par statut).
  const base = useMemo(() => {
    const term = search.trim().toLowerCase();
    const dayOrderIds = day
      ? new Set(items.filter((i) => i.day_date === day).map((i) => i.order_id))
      : null;
    return orders.filter((order) => {
      if (dayOrderIds && !dayOrderIds.has(order.id)) return false;
      if (!term) return true;
      return (
        order.reference.toLowerCase().includes(term) ||
        order.phone.toLowerCase().includes(term) ||
        `${order.first_name} ${order.last_name}`.toLowerCase().includes(term)
      );
    });
  }, [orders, items, search, day]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const order of base) map[order.status] = (map[order.status] ?? 0) + 1;
    return map;
  }, [base]);

  const filtered = useMemo(
    () =>
      status === "all"
        ? base
        : status === "encaisser"
          ? base.filter(toCollect)
          : base.filter((o) => o.status === status),
    [base, status],
  );

  const filteredItems = useMemo(() => {
    const ids = new Set(filtered.map((o) => o.id));
    return items.filter((i) => ids.has(i.order_id));
  }, [filtered, items]);

  const update = useMutation({
    mutationFn: async (input: Patch) => {
      const { error } = await db.from("orders").update(input.patch).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["menu"] });
      toast.success("Commande mise à jour");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function changeStatus(order: Order, next: string) {
    if (next === "annulee") {
      setPendingCancel(order);
      return;
    }
    update.mutate({ id: order.id, patch: { status: next } });
  }

  const label = day ? formatDay(day) : "toutes dates";
  const revenue = filtered
    .filter((o) => o.status !== "annulee")
    .reduce((sum, o) => sum + o.total, 0);
  const filtersActive = search.trim() !== "" || day !== "" || status !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Commandes"
        description={
          <>
            <span className="tabular-nums">{filtered.length}</span> commande
            {filtered.length > 1 ? "s" : ""} ·{" "}
            <span className="tabular-nums">{formatPrice(revenue)}</span> hors annulations
          </>
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={filtered.length === 0}>
                <Printer /> Imprimer ou exporter <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem
                onSelect={() => printOrders(filtered, filteredItems, `Commandes — ${label}`)}
              >
                <Printer /> Imprimer la liste
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  printTickets(
                    filtered,
                    filteredItems,
                    `Tickets — ${label}`,
                    "a4",
                    day || undefined,
                  )
                }
              >
                <Scissors /> Tickets à découper (A4)
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  printTickets(
                    filtered,
                    filteredItems,
                    `Tickets — ${label}`,
                    "thermal",
                    day || undefined,
                  )
                }
              >
                <Receipt /> Tickets imprimante 80 mm
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  exportOrdersExcel(filtered, filteredItems, `commandes-${day || "toutes"}.xls`)
                }
              >
                <FileSpreadsheet /> Télécharger en Excel
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  exportOrdersCsv(filtered, filteredItems, `commandes-${day || "toutes"}.csv`)
                }
              >
                <Download /> Télécharger en CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Rechercher une commande"
              placeholder="Référence, nom ou téléphone"
              value={search}
              maxLength={80}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 bg-card pl-9"
            />
          </div>
          <select
            aria-label="Jour de consommation"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="h-10 rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">Tous les jours</option>
            {days.map((value) => (
              <option key={value} value={value}>
                {formatDay(value)}
              </option>
            ))}
          </select>
        </div>

        <div
          role="group"
          aria-label="Filtrer par statut"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:px-0"
        >
          <StatusChip
            active={status === "all"}
            onClick={() => setStatus("all")}
            count={base.length}
          >
            Toutes
          </StatusChip>
          <StatusChip
            active={status === "encaisser"}
            onClick={() => setStatus("encaisser")}
            count={base.filter(toCollect).length}
          >
            À encaisser
          </StatusChip>
          {ORDER_STATUSES.map((value) => (
            <StatusChip
              key={value}
              active={status === value}
              onClick={() => setStatus(value)}
              count={counts[value] ?? 0}
            >
              {ORDER_STATUS_LABELS[value]}
            </StatusChip>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <EmptyState
            title={isLoading ? "Chargement des commandes…" : "Aucune commande"}
            action={
              filtersActive && !isLoading ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setDay("");
                    setStatus("all");
                  }}
                >
                  Effacer les filtres
                </Button>
              ) : undefined
            }
          >
            {filtersActive && !isLoading
              ? "Aucune commande ne correspond à ces filtres."
              : !isLoading && "Les commandes passées sur le site apparaîtront ici."}
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Ordinateur : tableau */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 p-3" />
                  <th className="p-3 font-semibold">Commande</th>
                  <th className="p-3 font-semibold">Client</th>
                  <th className="p-3 text-right font-semibold">Total</th>
                  <th className="p-3 font-semibold">Statut</th>
                  <th className="p-3 font-semibold">Paiement</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const open = expanded === order.id;
                  return (
                    <Fragment key={order.id}>
                      <tr
                        className={cn(
                          "border-t border-border",
                          open && "bg-secondary/40",
                          order.status === "annulee" && "text-muted-foreground",
                        )}
                      >
                        <td className="p-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-expanded={open}
                            aria-label={`Détails de la commande ${order.reference}`}
                            onClick={() => setExpanded(open ? null : order.id)}
                          >
                            <ChevronDown
                              className={cn("transition-transform", open && "rotate-180")}
                            />
                          </Button>
                        </td>
                        <td className="p-3">
                          <p className="font-semibold">{order.reference}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCreatedAt(order.created_at)}
                            {order.order_type === "precommande" && " · Précommande"}
                          </p>
                          {order.subscription_id && (
                            <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
                              Abonné
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <p className="font-medium">
                            {order.first_name} {order.last_name}
                          </p>
                          <a
                            href={`tel:${order.phone}`}
                            className="text-xs text-muted-foreground hover:text-primary hover:underline"
                          >
                            {order.phone}
                          </a>
                        </td>
                        <td className="p-3 text-right font-semibold tabular-nums">
                          {formatPrice(order.total)}
                        </td>
                        <td className="p-3">
                          <ToneSelect
                            label={`Statut de la commande ${order.reference}`}
                            value={order.status}
                            options={ORDER_STATUSES}
                            labels={ORDER_STATUS_LABELS}
                            tones={ORDER_STATUS_TONES}
                            onChange={(next) => changeStatus(order, next)}
                          />
                        </td>
                        <td className="p-3">
                          <ToneSelect
                            label={`Paiement de la commande ${order.reference}`}
                            value={order.payment_status}
                            options={PAYMENT_STATUSES}
                            labels={PAYMENT_STATUS_LABELS}
                            tones={PAYMENT_STATUS_TONES}
                            onChange={(next) =>
                              update.mutate({ id: order.id, patch: { payment_status: next } })
                            }
                          />
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-secondary/40">
                          <td />
                          <td colSpan={5} className="px-3 pb-5 pt-1">
                            <OrderDetails
                              order={order}
                              items={itemsByOrder.get(order.id) ?? []}
                              onPaid={() =>
                                update.mutate({ id: order.id, patch: { payment_status: "paye" } })
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile : une fiche par commande */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((order) => {
              const open = expanded === order.id;
              return (
                <li key={order.id} className="rounded-xl border border-border bg-card shadow-sm">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : order.id)}
                    className="flex w-full items-start justify-between gap-3 p-4 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {order.first_name} {order.last_name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {order.reference} · {formatCreatedAt(order.created_at)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatPrice(order.total)}</span>
                      <ChevronDown
                        className={cn(
                          "size-4 text-muted-foreground transition-transform",
                          open && "rotate-180",
                        )}
                      />
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-2 px-4 pb-4">
                    <ToneSelect
                      label={`Statut de la commande ${order.reference}`}
                      value={order.status}
                      options={ORDER_STATUSES}
                      labels={ORDER_STATUS_LABELS}
                      tones={ORDER_STATUS_TONES}
                      onChange={(next) => changeStatus(order, next)}
                    />
                    <ToneSelect
                      label={`Paiement de la commande ${order.reference}`}
                      value={order.payment_status}
                      options={PAYMENT_STATUSES}
                      labels={PAYMENT_STATUS_LABELS}
                      tones={PAYMENT_STATUS_TONES}
                      onChange={(next) =>
                        update.mutate({ id: order.id, patch: { payment_status: next } })
                      }
                    />
                    {order.order_type === "precommande" && <TonePill>Précommande</TonePill>}
                  </div>
                  {open && (
                    <div className="border-t border-border bg-secondary/30 p-4">
                      <OrderDetails
                        order={order}
                        items={itemsByOrder.get(order.id) ?? []}
                        onPaid={() =>
                          update.mutate({ id: order.id, patch: { payment_status: "paye" } })
                        }
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={pendingCancel !== null}
        title={`Annuler la commande ${pendingCancel?.reference ?? ""} ?`}
        description="Elle sera retirée de la production et du chiffre d'affaires. Pensez à prévenir le client."
        confirmLabel="Annuler la commande"
        onCancel={() => setPendingCancel(null)}
        onConfirm={() => {
          if (pendingCancel) update.mutate({ id: pendingCancel.id, patch: { status: "annulee" } });
          setPendingCancel(null);
        }}
      />
    </div>
  );
}

function StatusChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-secondary/60",
      )}
    >
      {children}
      <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>
        {count}
      </span>
    </button>
  );
}

/** Reste de l'argent à recevoir : solde d'une précommande ou paiement à la livraison. */
function toCollect(order: Order) {
  return (
    order.status !== "annulee" &&
    ["acompte_paye", "acompte_a_verifier", "a_la_livraison"].includes(order.payment_status)
  );
}

function OrderDetails({
  order,
  items,
  onPaid,
}: {
  order: Order;
  items: OrderItem[];
  onPaid: () => void;
}) {
  const balance =
    order.total - (order.payment_status === "a_la_livraison" ? 0 : order.deposit_required);
  return (
    <div className="grid gap-5 text-sm sm:grid-cols-2">
      <div className="space-y-3">
        <Detail label="Livraison">
          {order.address}
          {order.address_extra && <>, {order.address_extra}</>}
          {order.landmark && (
            <span className="block text-muted-foreground">Repère : {order.landmark}</span>
          )}
        </Detail>
        {order.instructions && <Detail label="Instructions">{order.instructions}</Detail>}
        {order.subscription_id && <SubscriptionDetail order={order} />}
        {order.order_type === "precommande" && (
          <Detail label="Acompte">
            {formatPrice(order.deposit_required)}
            {order.payment_method === "paydunya" ? " payé en ligne (PayDunya)" : ""}
            {order.payment_reference && (
              <span className="block text-muted-foreground">
                Transaction : {order.payment_reference}
              </span>
            )}
          </Detail>
        )}
        {toCollect(order) && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="font-medium text-amber-950">
              {order.payment_status === "a_la_livraison"
                ? `À encaisser à la livraison : ${formatPrice(order.total)}`
                : `Solde à recevoir : ${formatPrice(balance)}`}
            </p>
            <p className="mt-0.5 text-xs text-amber-900/80">
              {order.payment_status === "a_la_livraison"
                ? "Quand le livreur a bien encaissé, confirmez-le ici."
                : "Vérifiez sur votre compte Wave / Orange Money que le transfert est arrivé, puis confirmez."}
            </p>
            <Button size="sm" className="mt-2" onClick={onPaid}>
              <CheckCircle2 />
              {order.payment_status === "a_la_livraison"
                ? "Payé à la livraison"
                : "Solde reçu · précommande complétée"}
            </Button>
          </div>
        )}
      </div>
      <Detail label="Articles">
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 px-3 py-2">
              <span>
                <span className="font-semibold tabular-nums">{item.quantity} ×</span>{" "}
                {item.product_name}
                <span className="block text-xs text-muted-foreground">
                  {formatDay(item.day_date)}
                </span>
              </span>
              <span className="tabular-nums">{formatPrice(item.amount)}</span>
            </li>
          ))}
        </ul>
      </Detail>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => printTickets([order], items, `Ticket ${order.reference}`, "thermal")}
        >
          <Receipt /> Ticket 80 mm
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => printTickets([order], items, `Ticket ${order.reference}`, "a4")}
        >
          <Scissors /> Ticket A4
        </Button>
      </div>
    </div>
  );
}

/** Commande d'abonné : montant pris en charge, repas restants et message (SMS ou WhatsApp) après livraison. */
function SubscriptionDetail({ order }: { order: Order }) {
  const { data: subs = [] } = useQuery(subscriptionsQuery());
  const sub = subs.find((s) => s.id === order.subscription_id);
  if (!sub) return null;
  const remaining = remainingMeals(sub);
  return (
    <Detail label="Abonnement">
      {sub.plan_name} · {formatPrice(order.subscription_discount)} pris en charge
      <span className="block text-muted-foreground">
        Reste {remaining} repas sur {sub.meals_count}
        {sub.amount_paid < sub.price
          ? ` · solde à régler : ${formatPrice(sub.price - sub.amount_paid)}`
          : ""}
      </span>
      <SendMessageButton
        phone={sub.phone}
        text={deliveredMessage(sub, remaining, CLIENT.name)}
        label="Prévenir : repas livré"
        className="mt-2"
      />
    </Detail>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function formatCreatedAt(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Dakar",
  });
}
