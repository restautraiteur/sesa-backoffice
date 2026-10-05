import { useMemo, useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { EmptyState } from "@/features/admin/components/admin-ui";
import { addDays, mondayOf } from "@/features/admin/menu-planning/calendar";
import type { Order, OrderItem } from "@/features/admin/orders/api";
import {
  HISTORY_SIZE,
  dishRatio,
  formatAmount,
  logCost,
  shoppingList,
  type Ingredient,
  type ProductionLog,
} from "@/features/admin/simulation/api";
import type { MenuRow } from "@core/domain/menu/api";
import { formatDay, formatPrice, todayISO } from "@core/lib/format";
import { cn } from "@core/lib/utils";

const SELECT = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

type Period = { kind: "jour" | "semaine"; start: string; end: string };

/** Prévisions d'un jour ou d'une semaine : somme à recevoir, dépenses, bénéfice, liste de courses. */
export function ForecastPanel({
  menu,
  ingredients,
  logs,
  orders,
  orderItems,
}: {
  menu: MenuRow[];
  ingredients: Ingredient[];
  logs: ProductionLog[];
  orders: Order[];
  orderItems: OrderItem[];
}) {
  const today = todayISO();
  const dishRows = useMemo(() => menu.filter((m) => m.category === "plat"), [menu]);
  const days = useMemo(() => [...new Set(dishRows.map((m) => m.day_date))].sort(), [dishRows]);
  const weeks = useMemo(() => [...new Set(days.map(mondayOf))].sort(), [days]);
  const defaultDay = days.find((d) => d >= today) ?? days[days.length - 1] ?? today;

  const [kind, setKind] = useState<"jour" | "semaine">("jour");
  const [day, setDay] = useState(defaultDay);
  const [week, setWeek] = useState(mondayOf(defaultDay));
  const [targets, setTargets] = useState<Record<string, string>>({});

  const period: Period =
    kind === "jour" ? { kind, start: day, end: day } : { kind, start: week, end: addDays(week, 6) };
  const inPeriod = (date: string) => date >= period.start && date <= period.end;

  const ingredientById = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  if (days.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <EmptyState title="Aucun menu">
          Composez un menu dans « Menus » pour obtenir des prévisions.
        </EmptyState>
      </section>
    );
  }

  // Plats de la période, avec le nombre à cuisiner (par défaut : portions prévues, au moins les précommandes)
  const rows = dishRows
    .filter((m) => inPeriod(m.day_date))
    .sort((a, b) => a.day_date.localeCompare(b.day_date) || a.name.localeCompare(b.name))
    .map((row) => {
      const fallback = Math.max(row.stock_initial, row.stock_reserved);
      const target = Math.max(0, Math.floor(Number(targets[row.day_product_id] ?? fallback) || 0));
      return { row, target, ratio: dishRatio(row.product_id, logs) };
    });

  const needs = rows.flatMap(({ target, ratio }) =>
    ratio
      ? [...ratio.perPlate].map(([ingredientId, perPlate]) => ({
          ingredientId,
          quantity: perPlate * target,
        }))
      : [],
  );
  const shopping = shoppingList(needs, ingredientById);
  const plannedSpend = shopping.reduce((s, l) => s + l.cost, 0);
  const withoutHistory = rows.filter((r) => !r.ratio);

  // Argent : commandes de la période (plats et jus), hors commandes annulées
  const periodItems = orderItems.filter((i) => {
    const order = orderById.get(i.order_id);
    return inPeriod(i.day_date) && order && order.status !== "annulee";
  });
  const assured = periodItems.reduce((s, i) => s + i.amount, 0);
  const paid = periodItems
    .filter((i) => orderById.get(i.order_id)?.payment_status === "paye")
    .reduce((s, i) => s + i.amount, 0);
  const extraPossible = rows.reduce(
    (s, { row, target }) => s + Math.max(0, target - row.stock_reserved) * row.price,
    0,
  );
  const possible = assured + extraPossible;

  // Réel : dépenses des fiches de production de la période, argent encaissé
  const periodLogs = logs.filter((l) => inPeriod(l.cooked_on));
  const realSpend = periodLogs.reduce((s, l) => s + logCost(l), 0);
  const hasReal = period.start <= today;

  // Bilan des jours passés : plats obtenus (fiches), vendus (commandes), invendus perdus.
  const dayReports = rows
    .filter(({ row }) => row.day_date <= today)
    .flatMap(({ row }) => {
      const log = periodLogs.find(
        (l) =>
          l.day_product_id === row.day_product_id ||
          (l.product_id === row.product_id && l.cooked_on === row.day_date),
      );
      if (!log) return [];
      const unsold = Math.max(0, log.plates_obtained - row.stock_reserved);
      const costPerPlate = logCost(log) / log.plates_obtained;
      return [
        {
          obtained: log.plates_obtained,
          sold: row.stock_reserved,
          unsold,
          loss: unsold * costPerPlate,
        },
      ];
    });
  const obtainedTotal = dayReports.reduce((s, d) => s + d.obtained, 0);
  const soldTotal = dayReports.reduce((s, d) => s + Math.min(d.sold, d.obtained), 0);
  const unsoldTotal = dayReports.reduce((s, d) => s + d.unsold, 0);
  const lossTotal = Math.round(dayReports.reduce((s, d) => s + d.loss, 0));

  // Liste de courses à partager (WhatsApp ou copier-coller)
  const platesToCook = rows.reduce((s, r) => s + r.target, 0);
  const shoppingText = [
    `Courses — ${kind === "jour" ? formatDay(period.start) : `semaine du ${formatDay(period.start)}`} (${platesToCook} plats)`,
    ...shopping.map(
      (l) =>
        `• ${l.ingredient.name} : ${formatAmount(l.quantity, l.ingredient.unit)}${
          l.format ? ` (${l.count} × ${l.format.label})` : ""
        } — ${formatPrice(l.cost)}`,
    ),
    `Total estimé : ${formatPrice(plannedSpend)}`,
  ].join("\n");

  async function copyShopping() {
    try {
      await navigator.clipboard.writeText(shoppingText);
      toast.success("Liste de courses copiée");
    } catch {
      toast.error("Copie impossible : sélectionnez le texte manuellement.");
    }
  }

  return (
    <section className="space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-semibold">Prévisions</h2>
          <p className="text-sm text-muted-foreground">
            Ce que vous allez dépenser, recevoir et gagner, d'après vos {HISTORY_SIZE} dernières
            cuissons de chaque plat.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div role="group" aria-label="Période" className="flex rounded-lg bg-muted p-1">
            {(
              [
                ["jour", "Jour"],
                ["semaine", "Semaine"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm font-medium transition-colors",
                  kind === value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="w-56">
            <Label htmlFor="fc-period" className="sr-only">
              {kind === "jour" ? "Jour" : "Semaine"}
            </Label>
            {kind === "jour" ? (
              <select
                id="fc-period"
                className={SELECT}
                value={day}
                onChange={(e) => setDay(e.target.value)}
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)}
                    {d === today ? " (aujourd'hui)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <select
                id="fc-period"
                className={SELECT}
                value={week}
                onChange={(e) => setWeek(e.target.value)}
              >
                {weeks.map((w) => (
                  <option key={w} value={w}>
                    Semaine du {formatDay(w)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Les trois chiffres */}
      <div className="grid gap-3 md:grid-cols-3">
        <Figure
          title="Somme à recevoir"
          main={formatPrice(possible)}
          mainNote="si tout est vendu"
          lines={[
            [`Assurée (commandes)`, formatPrice(assured)],
            [`Dont déjà payée`, formatPrice(paid)],
          ]}
        />
        <Figure
          title="Dépenses prévues"
          main={formatPrice(plannedSpend)}
          mainNote="ingrédients à acheter"
          lines={
            withoutHistory.length > 0
              ? [[`Plats sans historique`, String(withoutHistory.length)]]
              : [[`Basé sur`, `${HISTORY_SIZE} dernières cuissons`]]
          }
        />
        <Figure
          title="Bénéfice prévu"
          main={formatPrice(possible - plannedSpend)}
          mainNote="si tout est vendu"
          tone={possible - plannedSpend < 0 ? "text-destructive" : "text-emerald-700"}
          lines={[[`Avec les seules commandes`, formatPrice(assured - plannedSpend)]]}
        />
      </div>

      {hasReal && (
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm font-semibold">Réel à ce jour</p>
          <div className="mt-2 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
            <RealItem
              label="Plats vendus / obtenus"
              value={dayReports.length > 0 ? `${soldTotal} / ${obtainedTotal}` : "Aucune fiche"}
            />
            <RealItem
              label="Invendus (perdus)"
              value={
                dayReports.length > 0
                  ? `${unsoldTotal} plat${unsoldTotal > 1 ? "s" : ""} · ${formatPrice(lossTotal)}`
                  : "—"
              }
              tone={unsoldTotal > 0 ? "text-destructive" : undefined}
            />
            <RealItem label="Encaissé (commandes payées)" value={formatPrice(paid)} />
            <RealItem
              label="Dépensé (fiches de production)"
              value={periodLogs.length > 0 ? formatPrice(realSpend) : "Aucune fiche"}
            />
            <RealItem
              label="Bénéfice réel"
              value={periodLogs.length > 0 ? formatPrice(paid - realSpend) : "—"}
              tone={paid - realSpend < 0 ? "text-destructive" : "text-emerald-700"}
            />
          </div>
        </div>
      )}

      {/* Plats de la période */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Plats à cuisiner</h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                <th className="px-3 py-2">Plat</th>
                <th className="px-3 py-2 text-right">Précommandes</th>
                <th className="px-3 py-2 text-right">Prévues</th>
                <th className="w-32 px-3 py-2">À cuisiner</th>
                <th className="px-3 py-2">Historique</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ row, target, ratio }) => {
                const avg = ratio
                  ? Math.round(
                      ratio.logsUsed.reduce((s, l) => s + l.plates_obtained, 0) /
                        ratio.logsUsed.length,
                    )
                  : 0;
                return (
                  <tr key={row.day_product_id}>
                    <td className="px-3 py-2">
                      <span className="font-medium">{row.name}</span>
                      {kind === "semaine" && (
                        <span className="block text-xs text-muted-foreground first-letter:uppercase">
                          {formatDay(row.day_date)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{row.stock_reserved}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {row.stock_initial}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        className={cn("h-9", target < row.stock_reserved && "border-destructive")}
                        aria-label={`Plats à cuisiner : ${row.name}`}
                        value={targets[row.day_product_id] ?? String(target)}
                        onChange={(e) =>
                          setTargets({ ...targets, [row.day_product_id]: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {ratio ? (
                        <span className="text-muted-foreground">
                          {ratio.logsUsed.length} cuisson{ratio.logsUsed.length > 1 ? "s" : ""} · ~
                          {avg} plats
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                          pas encore d'historique
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.some((r) => r.target < r.row.stock_reserved) && (
          <p className="text-xs text-destructive">
            Attention : moins de plats que de précommandes pour au moins un plat.
          </p>
        )}
        {withoutHistory.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Non comptés dans les dépenses tant qu'aucune fiche de production n'existe :{" "}
            {[...new Set(withoutHistory.map((r) => r.row.name))].join(", ")}.
          </p>
        )}
      </div>

      {/* Recette moyenne de chaque plat (calculée sur l'historique) */}
      {rows.some((r) => r.ratio) && (
        <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-xs">
          <p className="font-semibold text-foreground">Recette moyenne (pour 1 plat)</p>
          {[...new Map(rows.filter((r) => r.ratio).map((r) => [r.row.product_id, r])).values()].map(
            ({ row, ratio }) => (
              <p key={row.product_id} className="text-muted-foreground">
                <span className="font-medium text-foreground">{row.name}</span> :{" "}
                {[...ratio!.perPlate]
                  .map(([id, q]) => {
                    const ingredient = ingredientById.get(id);
                    return ingredient
                      ? `${formatAmount(q, ingredient.unit)} ${ingredient.name}`
                      : null;
                  })
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ),
          )}
        </div>
      )}

      {/* Liste de courses */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Liste de courses</h3>
          {shopping.length > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyShopping}>
                <Copy className="size-4" /> Copier
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shoppingText)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              </Button>
            </div>
          )}
        </div>
        {shopping.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Rien à calculer : remplissez des fiches de production pour ces plats.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                  <th className="px-3 py-2">Ingrédient</th>
                  <th className="px-3 py-2 text-right">Nécessaire</th>
                  <th className="px-3 py-2 text-right">À acheter</th>
                  <th className="px-3 py-2 text-right">Coût</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shopping.map((l) => (
                  <tr key={l.ingredient.id}>
                    <td className="px-3 py-2 font-medium">{l.ingredient.name}</td>
                    <td className="px-3 py-2 text-right">
                      {formatAmount(l.quantity, l.ingredient.unit)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.format ? `${l.count} × ${l.format.label}` : "quantité exacte"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{formatPrice(l.cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30">
                  <td colSpan={3} className="px-3 py-2 text-right font-semibold">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {formatPrice(plannedSpend)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Figure({
  title,
  main,
  mainNote,
  lines,
  tone,
}: {
  title: string;
  main: string;
  mainNote: string;
  lines: [string, string][];
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className={cn("mt-1 text-2xl font-semibold", tone)}>{main}</p>
      <p className="text-xs text-muted-foreground">{mainNote}</p>
      <dl className="mt-3 space-y-1 border-t border-border pt-2 text-xs">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RealItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string | undefined;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-semibold", tone)}>{value}</p>
    </div>
  );
}
