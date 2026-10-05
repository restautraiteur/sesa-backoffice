import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Minus } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@ui/components/ui/button";
import { adminMenuQuery, type MenuRow } from "@core/domain/menu/api";
import {
  orderItemsQuery,
  ordersQuery,
  type Order,
  type OrderItem,
} from "@/features/admin/orders/api";
import { addDays, mondayOf } from "@/features/admin/menu-planning/calendar";
import { EmptyState, PageHeader, ProductThumb } from "@/features/admin/components/admin-ui";
import { formatDay, formatPrice, todayISO, weekdayLabel } from "@core/lib/format";
import { cn } from "@core/lib/utils";

// Les attributs SVG de recharts ne résolvent pas les variables CSS : valeurs du thème gérant.
const BRAND_CHART = "#9a5b2e";
const GRID = "#e3e6eb";
const MUTED = "#5f6b7a";

/** Seuils d'analyse des quantités prévues. */
const SOLD_OUT_RATIO = 1;
const LOW_DEMAND_RATIO = 0.4;

type WeekStats = {
  revenue: number;
  cashed: number;
  orders: number;
  preorders: number;
  planned: number;
  reserved: number;
};

function statsFor(
  start: string,
  orders: Order[],
  items: OrderItem[],
  menu: MenuRow[],
): WeekStats & { weekItems: OrderItem[]; weekMenu: MenuRow[] } {
  const end = addDays(start, 6);
  const cancelled = new Set(orders.filter((o) => o.status === "annulee").map((o) => o.id));
  const paid = new Set(orders.filter((o) => o.payment_status === "paye").map((o) => o.id));
  const weekItems = items.filter(
    (i) => i.day_date >= start && i.day_date <= end && !cancelled.has(i.order_id),
  );
  const orderIds = new Set(weekItems.map((i) => i.order_id));
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const weekMenu = menu.filter((m) => m.day_date >= start && m.day_date <= end && m.is_active);
  return {
    weekItems,
    weekMenu,
    revenue: weekItems.reduce((s, i) => s + i.amount, 0),
    cashed: weekItems.filter((i) => paid.has(i.order_id)).reduce((s, i) => s + i.amount, 0),
    orders: orderIds.size,
    preorders: [...orderIds].filter((id) => orderById.get(id)?.order_type === "precommande").length,
    planned: weekMenu.reduce((s, m) => s + m.stock_initial, 0),
    reserved: weekMenu.reduce((s, m) => s + m.stock_reserved, 0),
  };
}

const shortDate = (iso: string, withMonth = true) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    ...(withMonth ? { month: "long" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));

export function ReportsPage() {
  const { data: orders = [] } = useQuery(ordersQuery());
  const { data: items = [] } = useQuery(orderItemsQuery());
  const { data: menu = [] } = useQuery(adminMenuQuery());
  const today = todayISO();
  const [start, setStart] = useState(() => mondayOf(today));
  const end = addDays(start, 6);
  const isCurrentWeek = today >= start && today <= end;

  const current = useMemo(() => statsFor(start, orders, items, menu), [start, orders, items, menu]);
  const previous = useMemo(
    () => statsFor(addDays(start, -7), orders, items, menu),
    [start, orders, items, menu],
  );

  const average = current.orders > 0 ? Math.round(current.revenue / current.orders) : 0;
  const previousAverage = previous.orders > 0 ? Math.round(previous.revenue / previous.orders) : 0;
  const fillRate = current.planned > 0 ? current.reserved / current.planned : null;
  const previousFill = previous.planned > 0 ? previous.reserved / previous.planned : null;

  // Chiffre d'affaires et commandes par jour de livraison.
  const perDay = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = addDays(start, index);
        const dayItems = current.weekItems.filter((i) => i.day_date === date);
        return {
          date,
          label: `${weekdayLabel(date).slice(0, 3)} ${Number(date.slice(8, 10))}`,
          revenue: dayItems.reduce((s, i) => s + i.amount, 0),
          orders: new Set(dayItems.map((i) => i.order_id)).size,
        };
      }),
    [start, current.weekItems],
  );
  const busiest = [...perDay].sort((a, b) => b.revenue - a.revenue)[0];

  // Produits les plus vendus (quantité et chiffre).
  const topProducts = useMemo(() => {
    const map = new Map<
      string,
      { name: string; category: string; quantity: number; amount: number }
    >();
    for (const item of current.weekItems) {
      const key = `${item.product_name}|${item.category}`;
      const row = map.get(key) ?? {
        name: item.product_name,
        category: item.category,
        quantity: 0,
        amount: 0,
      };
      row.quantity += item.quantity;
      row.amount += item.amount;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8);
  }, [current.weekItems]);
  const topMax = Math.max(1, ...topProducts.map((p) => p.quantity));

  // Ce que la semaine apprend pour les prochaines : plats épuisés et plats peu demandés.
  const soldOut = current.weekMenu.filter(
    (m) => m.stock_initial > 0 && m.stock_reserved / m.stock_initial >= SOLD_OUT_RATIO,
  );
  const lowDemand = current.weekMenu.filter(
    (m) =>
      m.day_date < today &&
      m.stock_initial > 0 &&
      m.stock_reserved / m.stock_initial < LOW_DEMAND_RATIO,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bilan de la semaine"
        description="Ventes, plats les plus demandés et quantités à ajuster pour les prochaines semaines."
        actions={
          <div className="flex h-9 items-center rounded-lg border border-border bg-card shadow-sm">
            <Button
              variant="ghost"
              size="icon"
              className="h-full rounded-r-none"
              aria-label="Semaine précédente"
              onClick={() => setStart(addDays(start, -7))}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-48 border-x border-border px-3 text-center text-sm font-medium">
              {shortDate(start, start.slice(5, 7) !== end.slice(5, 7))} – {shortDate(end)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-full rounded-l-none"
              aria-label="Semaine suivante"
              onClick={() => setStart(addDays(start, 7))}
            >
              <ChevronRight />
            </Button>
            {!isCurrentWeek && (
              <Button
                variant="ghost"
                className="h-full rounded-l-none border-l border-border px-3"
                onClick={() => setStart(mondayOf(today))}
              >
                Cette semaine
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi
          label="Chiffre d'affaires"
          value={formatPrice(current.revenue)}
          delta={relative(current.revenue, previous.revenue)}
          hint={
            current.revenue > 0
              ? `${formatPrice(current.cashed)} encaissés`
              : "Aucune vente cette semaine"
          }
        />
        <Kpi
          label="Commandes"
          value={current.orders}
          delta={relative(current.orders, previous.orders)}
          hint={`dont ${current.preorders} précommande${current.preorders > 1 ? "s" : ""}`}
        />
        <Kpi
          label="Panier moyen"
          value={formatPrice(average)}
          delta={relative(average, previousAverage)}
          hint="par commande"
        />
        <Kpi
          label="Portions vendues"
          value={fillRate === null ? "—" : `${Math.round(fillRate * 100)} %`}
          delta={
            fillRate !== null && previousFill !== null
              ? { value: Math.round((fillRate - previousFill) * 100), unit: "pts" }
              : null
          }
          hint={
            current.planned > 0
              ? `${current.reserved} sur ${current.planned} prévues`
              : "Aucun menu cette semaine"
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Chiffre d'affaires par jour"
          subtitle={
            busiest && busiest.revenue > 0
              ? `Jour le plus chargé : ${formatDay(busiest.date).toLowerCase()} (${formatPrice(busiest.revenue)})`
              : "Par jour de livraison"
          }
        >
          <div className="h-64 px-1 pb-4 pt-2 sm:px-2" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perDay} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: MUTED, fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tick={{ fill: MUTED, fontSize: 12 }}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                  }
                />
                <Tooltip
                  cursor={{ fill: "#f1f3f5" }}
                  content={({ active, payload }) => {
                    const point = payload?.[0]?.payload as (typeof perDay)[number] | undefined;
                    if (!active || !point) return null;
                    return (
                      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                        <p className="font-medium">{formatDay(point.date)}</p>
                        <p className="mt-0.5 font-semibold tabular-nums">
                          {formatPrice(point.revenue)}
                        </p>
                        <p className="text-muted-foreground">
                          {point.orders} commande{point.orders > 1 ? "s" : ""}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="revenue" fill={BRAND_CHART} radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>Chiffre d'affaires par jour</caption>
            <tbody>
              {perDay.map((d) => (
                <tr key={d.date}>
                  <th scope="row">{formatDay(d.date)}</th>
                  <td>{formatPrice(d.revenue)}</td>
                  <td>{d.orders} commandes</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Les plus vendus" subtitle="Quantités commandées sur la semaine">
          {topProducts.length === 0 ? (
            <EmptyState title="Aucune vente">Les produits vendus apparaîtront ici.</EmptyState>
          ) : (
            <ol className="divide-y divide-border">
              {topProducts.map((product, index) => (
                <li key={`${product.name}|${product.category}`} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-xs tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="font-medium">{product.name}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{product.quantity}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-[var(--brand-chart)]"
                        style={{ width: `${(product.quantity / topMax) * 100}%` }}
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {formatPrice(product.amount)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel
          title="À prévoir en plus"
          subtitle="Plats épuisés : la demande a dépassé la quantité prévue"
          footer={<PanelLink>Ajuster les quantités dans les menus</PanelLink>}
        >
          <MenuList
            rows={soldOut}
            empty="Aucun plat épuisé cette semaine."
            badge={() => (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                Épuisé
              </span>
            )}
          />
        </Panel>

        <Panel
          title="À prévoir en moins"
          subtitle={`Plats vendus à moins de ${Math.round(LOW_DEMAND_RATIO * 100)} % (jours passés)`}
          footer={<PanelLink>Ajuster les quantités dans les menus</PanelLink>}
        >
          <MenuList
            rows={lowDemand}
            empty="Aucun plat sous-vendu cette semaine."
            badge={(row) => (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {row.stock_reserved}/{row.stock_initial}
              </span>
            )}
          />
        </Panel>

        <Panel title="Répartition" subtitle="Comment les clients ont commandé">
          <dl className="divide-y divide-border text-sm">
            <Row label="Précommandes" value={current.preorders} />
            <Row label="Commandes du jour" value={current.orders - current.preorders} />
            <Row label="Encaissé" value={formatPrice(current.cashed)} />
            <Row label="À encaisser" value={formatPrice(current.revenue - current.cashed)} />
          </dl>
        </Panel>
      </div>
    </div>
  );
}

/** Variation en % par rapport à la semaine précédente (null si pas de base de comparaison). */
function relative(value: number, before: number) {
  if (before === 0) return null;
  return { value: Math.round(((value - before) / before) * 100), unit: "%" };
}

function Kpi({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: ReactNode;
  delta: { value: number; unit: string } | null;
  hint: string;
}) {
  const Icon =
    !delta || delta.value === 0 ? Minus : delta.value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <p className="truncate text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold leading-tight tracking-tight tabular-nums sm:mt-3 sm:text-[28px] sm:leading-none">
        {value}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums",
              delta.value > 0 && "bg-emerald-50 text-emerald-700",
              delta.value < 0 && "bg-rose-50 text-rose-700",
              delta.value === 0 && "bg-muted",
            )}
            title="Par rapport à la semaine précédente"
          >
            <Icon className="size-3" />
            {delta.value > 0 ? "+" : ""}
            {delta.value} {delta.unit}
          </span>
        )}
        <span className="truncate">{hint}</span>
      </p>
    </div>
  );
}

function MenuList({
  rows,
  empty,
  badge,
}: {
  rows: MenuRow[];
  empty: string;
  badge: (row: MenuRow) => ReactNode;
}) {
  if (rows.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {rows.slice(0, 6).map((row) => (
        <li key={row.day_product_id} className="flex items-center gap-3 px-5 py-3">
          <ProductThumb name={row.name} photoUrl={row.photo_url} className="size-9" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{row.name}</span>
            <span className="block text-xs text-muted-foreground">{formatDay(row.day_date)}</span>
          </span>
          {badge(row)}
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  footer,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
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
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="border-t border-border">{footer}</div>}
    </section>
  );
}

function PanelLink({ children }: { children: ReactNode }) {
  return (
    <Link
      to="/admin/weeks"
      className="block px-5 py-3 text-sm font-medium text-primary hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </Link>
  );
}
