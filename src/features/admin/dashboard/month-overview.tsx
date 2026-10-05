import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@ui/components/ui/button";
import type { MenuRow } from "@core/domain/menu/api";
import type { Order, OrderItem } from "@/features/admin/orders/api";
import { formatPrice } from "@core/lib/format";
import { cn } from "@core/lib/utils";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Aperçu du mois : pour chaque jour, portions prévues, réservées et chiffre d'affaires.
 * Utile quand tout le menu du mois est rempli d'avance. Un clic ouvre le jour dans le tableau de bord.
 */
export function MonthOverview({
  menu,
  items,
  orders,
  day,
  today,
  onPick,
}: {
  menu: MenuRow[];
  items: OrderItem[];
  orders: Order[];
  day: string;
  today: string;
  onPick: (day: string) => void;
}) {
  const [month, setMonth] = useState(day.slice(0, 7));
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1, 1));
  const last = new Date(Date.UTC(y!, m!, 0));
  const lead = (first.getUTCDay() + 6) % 7;

  const cancelled = useMemo(
    () => new Set(orders.filter((o) => o.status === "annulee").map((o) => o.id)),
    [orders],
  );
  const stats = useMemo(() => {
    const map = new Map<
      string,
      { planned: number; reserved: number; revenue: number; dishes: number }
    >();
    for (const row of menu) {
      if (!row.day_date.startsWith(month) || !row.is_active) continue;
      const s = map.get(row.day_date) ?? { planned: 0, reserved: 0, revenue: 0, dishes: 0 };
      if (row.category === "plat") {
        s.planned += row.stock_initial;
        s.reserved += row.stock_reserved;
        s.dishes += 1;
      }
      map.set(row.day_date, s);
    }
    for (const item of items) {
      if (!item.day_date.startsWith(month) || cancelled.has(item.order_id)) continue;
      const s = map.get(item.day_date) ?? { planned: 0, reserved: 0, revenue: 0, dishes: 0 };
      s.revenue += item.amount;
      map.set(item.day_date, s);
    }
    return map;
  }, [menu, items, month, cancelled]);

  const totals = [...stats.values()].reduce(
    (t, s) => ({
      planned: t.planned + s.planned,
      reserved: t.reserved + s.reserved,
      revenue: t.revenue + s.revenue,
      days: t.days + (s.dishes > 0 ? 1 : 0),
    }),
    { planned: 0, reserved: 0, revenue: 0, days: 0 },
  );
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: last.getUTCDate() }, (_, i) =>
      iso(new Date(Date.UTC(y!, m! - 1, i + 1))),
    ),
  ];
  const shift = (step: number) =>
    setMonth(iso(new Date(Date.UTC(y!, m! - 1 + step, 1))).slice(0, 7));
  const label = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(first);

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Aperçu du mois</h2>
          <p className="text-sm text-muted-foreground">
            {totals.days} jour{totals.days > 1 ? "s" : ""} au menu · {totals.reserved} /{" "}
            {totals.planned} portions réservées
            {totals.planned > 0
              ? ` (${Math.round((totals.reserved / totals.planned) * 100)} %)`
              : ""}{" "}
            · <span className="font-semibold text-foreground">{formatPrice(totals.revenue)}</span>
          </p>
        </div>
        <div className="flex h-9 items-center rounded-lg border border-border bg-card shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-full rounded-r-none"
            aria-label="Mois précédent"
            onClick={() => shift(-1)}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-36 border-x border-border px-3 text-center text-sm font-medium capitalize">
            {label}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-full rounded-l-none"
            aria-label="Mois suivant"
            onClick={() => shift(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 gap-1.5 text-xs">
          {WEEKDAYS.map((w) => (
            <span key={w} className="px-1 text-center font-semibold text-muted-foreground">
              {w}
            </span>
          ))}
          {cells.map((date, i) => {
            if (!date) return <span key={`e${i}`} />;
            const s = stats.get(date);
            const ratio = s && s.planned > 0 ? s.reserved / s.planned : 0;
            return (
              <button
                key={date}
                type="button"
                onClick={() => onPick(date)}
                className={cn(
                  "flex min-h-[72px] flex-col rounded-lg border p-1.5 text-left transition-colors hover:border-primary",
                  date === day ? "border-primary bg-primary/5" : "border-border",
                  !s?.dishes && "bg-muted/30 text-muted-foreground",
                )}
              >
                <span className={cn("font-semibold", date === today && "text-primary")}>
                  {Number(date.slice(8, 10))}
                </span>
                {s && s.dishes > 0 && (
                  <>
                    <span className="mt-auto tabular-nums">
                      {s.reserved}/{s.planned}
                    </span>
                    <span className="h-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          ratio >= 0.8 ? "bg-amber-500" : "bg-[var(--brand-chart)]",
                        )}
                        style={{ width: `${Math.min(1, ratio) * 100}%` }}
                      />
                    </span>
                    {s.revenue > 0 && (
                      <span className="truncate text-[10px] text-muted-foreground">
                        {formatPrice(s.revenue)}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
