import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  Gauge,
  Printer,
  Receipt,
  Scissors,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@ui/components/ui/button";
import { adminMenuQuery, type MenuRow } from "@core/domain/menu/api";
import { juiceCatalogQuery, juiceVolume } from "@core/domain/juices/api";
import { orderItemsQuery, ordersQuery } from "@/features/admin/orders/api";
import { formatDay, formatPrice, todayISO, weekdayLabel } from "@core/lib/format";
import { printProduction, printTickets } from "@/features/admin/orders/print";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ui/components/ui/dropdown-menu";
import { addDays } from "@/features/admin/menu-planning/calendar";
import { EmptyState, PageHeader, ProductThumb } from "@/features/admin/components/admin-ui";
import { cn } from "@core/lib/utils";
import { productionLogsQuery } from "@/features/admin/simulation/api";
import { ProductionDialog } from "@/features/admin/simulation/components/production-dialog";

const CHART_DAYS = 7;
// Les attributs SVG de recharts ne résolvent pas les variables CSS : valeurs du thème gérant (styles.css).
const BRAND = "#6b4428";
const BRAND_CHART = "#9a5b2e";
const GRID = "#e3e6eb";
const MUTED = "#5f6b7a";

/**
 * La cuisine prépare chaque jour une quantité prévue, quelles que soient les commandes.
 * Les précommandes servent à savoir s'il faut en ajouter : un plat est « à renforcer »
 * quand il lui reste peu de portions ou qu'il est déjà précommandé à 80 % ou plus.
 */
const LOW_PORTIONS = 3;
const HIGH_DEMAND_RATIO = 0.8;
// Un format de jus est signalé quand il reste 5 bouteilles ou moins.
const LOW_JUICE_BOTTLES = 5;

type DishLevel = "epuise" | "renforcer" | "ok";

function dishLevel(row: MenuRow): DishLevel {
  if (row.stock_left <= 0) return "epuise";
  const ratio = row.stock_initial > 0 ? row.stock_reserved / row.stock_initial : 0;
  if (row.stock_left <= LOW_PORTIONS || ratio >= HIGH_DEMAND_RATIO) return "renforcer";
  return "ok";
}

export function Dashboard() {
  const { data: juiceCatalog = [] } = useQuery(juiceCatalogQuery());
  const lowJuices = juiceCatalog
    .filter((j) => j.state !== "desactive" && j.stock <= LOW_JUICE_BOTTLES)
    .sort((a, b) => a.stock - b.stock);
  const { data: orders = [] } = useQuery(ordersQuery());
  const { data: items = [] } = useQuery(orderItemsQuery());
  const { data: menu = [] } = useQuery(adminMenuQuery());
  const today = todayISO();
  const [day, setDay] = useState(today);
  const { data: logs = [] } = useQuery(productionLogsQuery());
  const [referenceDish, setReferenceDish] = useState<MenuRow | null>(null);
  const logFor = (dish: MenuRow) =>
    logs.find((l) => l.product_id === dish.product_id && l.cooked_on === dish.day_date) ?? null;

  const cancelledIds = useMemo(
    () => new Set(orders.filter((o) => o.status === "annulee").map((o) => o.id)),
    [orders],
  );
  const validItems = useMemo(
    () => items.filter((i) => !cancelledIds.has(i.order_id)),
    [items, cancelledIds],
  );
  const dayItems = useMemo(() => validItems.filter((i) => i.day_date === day), [validItems, day]);

  const ordersOfDay = useMemo(() => {
    const orderIds = new Set(dayItems.map((i) => i.order_id));
    return orders.filter((o) => orderIds.has(o.id));
  }, [dayItems, orders]);

  // Plats au menu du jour : prévu, précommandé, restant.
  const dishes = useMemo(
    () =>
      menu
        .filter((m) => m.day_date === day && m.is_active)
        .sort((a, b) => b.stock_reserved - a.stock_reserved),
    [menu, day],
  );
  const planned = dishes.reduce((s, d) => s + d.stock_initial, 0);
  const reserved = dishes.reduce((s, d) => s + d.stock_reserved, 0);
  const toReinforce = dishes.filter((d) => dishLevel(d) !== "ok");

  // Jus précommandés (ils ont leur propre stock, hors menu du jour).
  const juices = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of dayItems) {
      if (i.category !== "jus") continue;
      map.set(i.product_name, (map.get(i.product_name) ?? 0) + i.quantity);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [dayItems]);

  // Liste à imprimer : plats du menu (prévu / précommandé / restant) puis jus précommandés.
  const printRows = useMemo(
    () => [
      ...dishes.map((d) => ({
        name: d.name,
        category: "plat",
        quantity: d.stock_reserved,
        planned: d.stock_initial,
        left: d.stock_left,
      })),
      ...juices.map(([name, quantity]) => ({ name, category: "jus", quantity })),
    ],
    [dishes, juices],
  );

  const revenue = dayItems.reduce((sum, i) => sum + i.amount, 0);
  // Seules les commandes entièrement payées comptent comme encaissées (un acompte reste « à encaisser »).
  const paidIds = useMemo(
    () => new Set(orders.filter((o) => o.payment_status === "paye").map((o) => o.id)),
    [orders],
  );
  const cashed = dayItems.filter((i) => paidIds.has(i.order_id)).reduce((s, i) => s + i.amount, 0);

  const toConfirm = orders.filter((o) => o.status === "nouvelle");
  // Jours de livraison de chaque commande (une précommande peut couvrir plusieurs jours).
  const deliveryDays = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const item of items) {
      const list = map.get(item.order_id) ?? [];
      if (!list.includes(item.day_date)) list.push(item.day_date);
      map.set(item.order_id, list.sort());
    }
    return map;
  }, [items]);
  const toConfirmOfDay = ordersOfDay.filter((o) => o.status === "nouvelle").length;
  const upcomingAlerts = menu.filter(
    (m) => m.day_date > day && m.is_active && dishLevel(m) !== "ok",
  );

  // Précommandes par jour de livraison, sur les 7 jours qui se terminent au jour choisi.
  const chart = useMemo(() => {
    const start = addDays(day, -(CHART_DAYS - 1));
    const perDay = new Map<string, Set<string>>();
    for (const item of validItems) {
      if (item.day_date < start || item.day_date > day) continue;
      const set = perDay.get(item.day_date) ?? new Set<string>();
      set.add(item.order_id);
      perDay.set(item.day_date, set);
    }
    return Array.from({ length: CHART_DAYS }, (_, index) => {
      const date = addDays(start, index);
      const label = `${weekdayLabel(date).slice(0, 3)} ${Number(date.slice(8, 10))}`;
      return { date, label, orders: perDay.get(date)?.size ?? 0 };
    });
  }, [validItems, day]);
  const chartTotal = chart.reduce((s, d) => s + d.orders, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableau de bord"
        description={
          day === today ? (
            <>Précommandes du jour, {formatDay(day).toLowerCase()}</>
          ) : (
            <>Précommandes du {formatDay(day).toLowerCase()}</>
          )
        }
        actions={
          <>
            <div className="flex h-9 items-center rounded-lg border border-border bg-card shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                className="h-full rounded-r-none"
                aria-label="Jour précédent"
                onClick={() => setDay(addDays(day, -1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                className="h-full rounded-none border-x border-border px-3 font-medium"
                disabled={day === today}
                onClick={() => setDay(today)}
              >
                Aujourd'hui
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-full rounded-l-none"
                aria-label="Jour suivant"
                onClick={() => setDay(addDays(day, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Printer /> Imprimer <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  disabled={printRows.length === 0}
                  onSelect={() =>
                    printProduction(`Précommandes — ${formatDay(day)}`, printRows, {
                      day,
                      orders: ordersOfDay.length,
                    })
                  }
                >
                  <ClipboardList /> Liste des précommandes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={ordersOfDay.length === 0}
                  onSelect={() =>
                    printTickets(ordersOfDay, items, `Tickets — ${formatDay(day)}`, "a4", day)
                  }
                >
                  <Scissors /> Tickets à découper (A4)
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={ordersOfDay.length === 0}
                  onSelect={() =>
                    printTickets(ordersOfDay, items, `Tickets — ${formatDay(day)}`, "thermal", day)
                  }
                >
                  <Receipt /> Tickets imprimante 80 mm
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi
          icon={ShoppingBag}
          label="Précommandes"
          value={ordersOfDay.length}
          hint={
            toConfirmOfDay > 0 ? (
              <span className="text-amber-700">{toConfirmOfDay} à confirmer</span>
            ) : ordersOfDay.length > 0 ? (
              "Toutes confirmées"
            ) : (
              "Aucune pour ce jour"
            )
          }
        />
        <Kpi
          icon={Gauge}
          label="Portions réservées"
          value={planned > 0 ? `${reserved} / ${planned}` : reserved}
          hint={planned > 0 ? `${planned - reserved} portions encore libres` : "Aucun plat au menu"}
        />
        <Kpi
          icon={TrendingUp}
          label="Plats à renforcer"
          value={toReinforce.length}
          tone={toReinforce.length > 0 ? "warning" : undefined}
          hint={
            toReinforce.length > 0 ? (
              <span className="text-amber-700">Presque épuisés : prévoir plus</span>
            ) : (
              "Les quantités prévues suffisent"
            )
          }
        />
        <Kpi
          icon={Wallet}
          label="Chiffre du jour"
          value={formatPrice(revenue)}
          hint={
            revenue === 0 ? (
              "Aucune vente"
            ) : revenue === cashed ? (
              <span className="text-emerald-700">Entièrement encaissé</span>
            ) : (
              <>
                <span className="text-emerald-700">{formatPrice(cashed)} encaissés</span>,{" "}
                <span className="text-amber-700">{formatPrice(revenue - cashed)} à encaisser</span>
              </>
            )
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Plats du jour"
          subtitle="Quantité prévue par la cuisine et part déjà précommandée"
          footer={<PanelLink to="/admin/weeks">Ajouter des portions dans les menus</PanelLink>}
        >
          {dishes.length === 0 ? (
            <EmptyState title="Aucun plat au menu ce jour-là">
              Composez le menu de ce jour dans la page Menus pour suivre ses précommandes.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {dishes.map((dish) => (
                <DishRow
                  key={dish.day_product_id}
                  dish={dish}
                  isReference={logFor(dish)?.is_reference ?? false}
                  onReference={
                    dish.category === "plat" && dish.day_date <= today
                      ? () => setReferenceDish(dish)
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
          {juices.length > 0 && (
            <div className="border-t border-border bg-muted/40 px-5 py-3 text-sm">
              <span className="font-medium">Jus précommandés : </span>
              <span className="text-muted-foreground">
                {juices.map(([name, quantity]) => `${name} (${quantity})`).join(", ")}
              </span>
            </div>
          )}
        </Panel>

        <Panel
          title="À confirmer"
          count={toConfirm.length}
          footer={<PanelLink to="/admin/orders">Voir toutes les commandes</PanelLink>}
        >
          {toConfirm.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Toutes les commandes ont été confirmées.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {toConfirm.slice(0, 6).map((order) => {
                const days = deliveryDays.get(order.id) ?? [];
                return (
                  <li key={order.id}>
                    <Link
                      to="/admin/orders"
                      search={{ q: order.reference }}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                        {order.first_name.slice(0, 1).toUpperCase()}
                        {order.last_name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {order.first_name} {order.last_name}
                          </span>
                          {order.order_type === "precommande" && (
                            <span className="shrink-0 rounded bg-[var(--brand-tint)] px-1.5 text-[11px] font-medium text-primary">
                              Précommande
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {order.reference}
                          {days.length > 0 && <> · livraison {days.map(shortDay).join(", ")}</>}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {formatPrice(order.total)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          className="lg:col-span-2"
          title="Précommandes sur 7 jours"
          subtitle={`${chartTotal} précommande${chartTotal > 1 ? "s" : ""}, par jour de livraison. Cliquez sur une barre pour voir ce jour.`}
        >
          <div className="h-56 px-1 pb-4 pt-2 sm:h-64 sm:px-2" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: MUTED, fontSize: 12 }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tick={{ fill: MUTED, fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: "#f1f3f5" }}
                  content={({ active, payload }) => {
                    const point = payload?.[0]?.payload as (typeof chart)[number] | undefined;
                    if (!active || !point) return null;
                    return (
                      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                        <p className="font-medium">{formatDay(point.date)}</p>
                        <p className="mt-0.5 text-muted-foreground">
                          <span className="font-semibold tabular-nums text-foreground">
                            {point.orders}
                          </span>{" "}
                          précommande{point.orders > 1 ? "s" : ""}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="orders"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                  cursor="pointer"
                  onClick={(data: { payload?: { date: string } }) =>
                    data.payload && setDay(data.payload.date)
                  }
                >
                  {chart.map((point) => (
                    <Cell
                      key={point.date}
                      fill={point.date === day ? BRAND : BRAND_CHART}
                      fillOpacity={point.date === day ? 1 : 0.6}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Précommandes par jour de livraison</caption>
            <tbody>
              {chart.map((point) => (
                <tr key={point.date}>
                  <th scope="row">{formatDay(point.date)}</th>
                  <td>{point.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          title="Jours suivants à surveiller"
          subtitle="Plats presque épuisés les prochains jours"
          footer={<PanelLink to="/admin/weeks">Ajuster dans les menus</PanelLink>}
        >
          {upcomingAlerts.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Rien à signaler pour les prochains jours.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {upcomingAlerts.slice(0, 6).map((m) => (
                <li key={m.day_product_id} className="flex items-center gap-3 px-5 py-3">
                  <ProductThumb name={m.name} photoUrl={m.photo_url} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{m.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDay(m.day_date)}
                    </span>
                  </span>
                  <LevelBadge dish={m} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Stock des jus"
          subtitle={`Formats à ${LOW_JUICE_BOTTLES} bouteilles ou moins`}
          footer={<PanelLink to="/admin/products">Réapprovisionner dans Produits</PanelLink>}
        >
          {lowJuices.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Tous les jus sont bien en stock.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {lowJuices.slice(0, 8).map((j) => (
                <li key={j.variant_id} className="flex items-center gap-3 px-5 py-3">
                  <ProductThumb name={j.name} photoUrl={j.photo_url} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{j.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {juiceVolume(j.size)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      j.stock <= 0
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-100 text-amber-800",
                    )}
                  >
                    {j.stock <= 0 ? "Épuisé" : `${j.stock} restante${j.stock > 1 ? "s" : ""}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <ProductionDialog
        open={referenceDish !== null}
        onClose={() => setReferenceDish(null)}
        preset={
          referenceDish
            ? { productId: referenceDish.product_id, cookedOn: referenceDish.day_date }
            : null
        }
        log={referenceDish ? logFor(referenceDish) : null}
        reference={
          referenceDish ? { sold: referenceDish.stock_reserved, price: referenceDish.price } : null
        }
      />
    </div>
  );
}

/** « ven. 2 oct. » */
function shortDay(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}

function DishRow({
  dish,
  isReference,
  onReference,
}: {
  dish: MenuRow;
  isReference: boolean;
  /** Fin de journée : garder ce plat comme référence pour la simulation. */
  onReference?: (() => void) | undefined;
}) {
  const level = dishLevel(dish);
  const ratio = dish.stock_initial > 0 ? Math.min(1, dish.stock_reserved / dish.stock_initial) : 0;
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <ProductThumb name={dish.name} photoUrl={dish.photo_url} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium">{dish.name}</p>
          <LevelBadge dish={dish} />
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label={`${dish.name} : part précommandée`}
            aria-valuemin={0}
            aria-valuemax={dish.stock_initial}
            aria-valuenow={dish.stock_reserved}
          >
            <span
              className={cn(
                "block h-full rounded-full",
                level === "ok" ? "bg-[var(--brand-chart)]" : "bg-amber-500",
                level === "epuise" && "bg-rose-500",
              )}
              style={{ width: `${ratio * 100}%` }}
            />
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">{dish.stock_reserved}</span> réservées
            sur {dish.stock_initial}
          </span>
        </div>
      </div>
      {onReference && (
        <Button
          size="sm"
          variant={isReference ? "secondary" : "outline"}
          className="shrink-0"
          title="Garder cette journée (achats, plats préparés et vendus) comme base de simulation"
          onClick={onReference}
        >
          <FlaskConical className="size-4" />
          <span className="hidden sm:inline">
            {isReference ? "Référence ✓" : "Ajouter comme référence"}
          </span>
        </Button>
      )}
    </li>
  );
}

function LevelBadge({ dish }: { dish: MenuRow }) {
  const level = dishLevel(dish);
  if (level === "epuise") {
    return (
      <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
        Épuisé, à renforcer
      </span>
    );
  }
  if (level === "renforcer") {
    return (
      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-700">
        {dish.stock_left} restante{dish.stock_left > 1 ? "s" : ""}, à renforcer
      </span>
    );
  }
  return (
    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
      {dish.stock_left} libres
    </span>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: number | string;
  hint?: ReactNode;
  tone?: "warning" | undefined;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5",
        tone === "warning" && "border-amber-300",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
        <span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-tint)] text-primary sm:flex">
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className="mt-2 text-xl font-semibold leading-tight tracking-tight tabular-nums sm:mt-3 sm:text-[28px] sm:leading-none">
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  count,
  footer,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  count?: number | string | undefined;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {count !== undefined && (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="border-t border-border">{footer}</div>}
    </section>
  );
}

function PanelLink({
  to,
  children,
}: {
  to: "/admin/orders" | "/admin/weeks" | "/admin/products";
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="block px-5 py-3 text-sm font-medium text-primary hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </Link>
  );
}
