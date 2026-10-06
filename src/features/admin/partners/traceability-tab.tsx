import { useMemo, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@ui/components/ui/sheet";
import { EmptyState } from "@/features/admin/components/admin-ui";
import { downloadFile } from "@/features/admin/orders/export-orders";
import type { Partner } from "@/features/admin/partners/api";
import { db, run } from "@core/lib/db";
import { formatDay, formatPrice, todayISO } from "@core/lib/format";
import { cn } from "@core/lib/utils";
import { csvCell } from "@/features/admin/csv";

/**
 * Traçabilité des repas : combien de repas chaque employé (ou particulier) a pris, quand, sur le
 * mois, l'année ou une période libre, et le total par entreprise. Calculs faits par la base
 * (fonctions meal_stats_by_person, meal_stats_by_month, meal_history).
 */

type PersonRow = {
  person_key: string;
  partner_id: string | null;
  partner_name: string | null;
  employee_id: string | null;
  person_name: string;
  phone: string;
  meals: number;
  amount: number;
  days: number;
  first_day: string;
  last_day: string;
};
type MonthRow = { month: number; meals: number; amount: number; people: number };
type HistoryRow = {
  day_date: string;
  product_name: string;
  category: string;
  quantity: number;
  amount: number;
  reference: string;
  partner_name: string | null;
  order_status: string;
};

const MONTHS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

const personsQuery = (from: string, to: string, partner: string | null, scope: string) =>
  queryOptions({
    queryKey: ["meal_stats_by_person", from, to, partner, scope],
    queryFn: async () =>
      (
        await run<PersonRow[]>(
          db.rpc("meal_stats_by_person", {
            p_from: from,
            p_to: to,
            p_partner: partner,
            p_scope: scope,
          }),
        )
      ).map((r) => ({
        ...r,
        meals: Number(r.meals),
        amount: Number(r.amount),
        days: Number(r.days),
      })),
  });

const monthsQuery = (year: number, partner: string | null, person: string | null, scope: string) =>
  queryOptions({
    queryKey: ["meal_stats_by_month", year, partner, person, scope],
    queryFn: async () =>
      (
        await run<MonthRow[]>(
          db.rpc("meal_stats_by_month", {
            p_year: year,
            p_partner: partner,
            p_person: person,
            p_scope: scope,
          }),
        )
      ).map((r) => ({
        month: r.month,
        meals: Number(r.meals),
        amount: Number(r.amount),
        people: Number(r.people),
      })),
  });

const historyQuery = (person: string, from: string, to: string) =>
  queryOptions({
    queryKey: ["meal_history", person, from, to],
    queryFn: () =>
      run<HistoryRow[]>(db.rpc("meal_history", { p_person: person, p_from: from, p_to: to })),
  });

function lastDayOfMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

type Mode = "mois" | "annee" | "periode";

export function TraceabilityTab({ partners }: { partners: Partner[] }) {
  const today = todayISO();
  const [mode, setMode] = useState<Mode>("mois");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [custom, setCustom] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  // « all » = tout le monde, « entreprises », « particuliers » ou l'id d'une entreprise.
  const [scopeValue, setScopeValue] = useState("entreprises");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PersonRow | null>(null);

  const { from, to } =
    mode === "mois"
      ? { from: `${month}-01`, to: lastDayOfMonth(month) }
      : mode === "annee"
        ? { from: `${year}-01-01`, to: `${year}-12-31` }
        : custom;
  const isPartner = !["all", "entreprises", "particuliers"].includes(scopeValue);
  const partnerId = isPartner ? scopeValue : null;
  const scope = isPartner ? "all" : scopeValue;
  const chartYear = mode === "annee" ? year : Number(from.slice(0, 4));

  const { data: persons = [], isLoading } = useQuery(personsQuery(from, to, partnerId, scope));
  const { data: months = [] } = useQuery(monthsQuery(chartYear, partnerId, null, scope));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return persons;
    const digits = q.replace(/\D/g, "");
    return persons.filter(
      (p) =>
        p.person_name.toLowerCase().includes(q) ||
        (digits.length >= 3 && p.phone.includes(digits)) ||
        (p.partner_name ?? "").toLowerCase().includes(q),
    );
  }, [persons, search]);

  const totals = persons.reduce(
    (t, p) => ({ meals: t.meals + p.meals, amount: t.amount + p.amount }),
    { meals: 0, amount: 0 },
  );
  const eaters = persons.filter((p) => p.meals > 0).length;
  const byCompany = useMemo(() => {
    const map = new Map<string, { name: string; people: number; meals: number; amount: number }>();
    for (const p of persons) {
      const key = p.partner_id ?? "particuliers";
      const row = map.get(key) ?? {
        name: p.partner_name ?? "Particuliers",
        people: 0,
        meals: 0,
        amount: 0,
      };
      row.people += 1;
      row.meals += p.meals;
      row.amount += p.amount;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.meals - a.meals);
  }, [persons]);

  const periodLabel =
    mode === "mois"
      ? new Intl.DateTimeFormat("fr-FR", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${month}-01T00:00:00Z`))
      : mode === "annee"
        ? `l'année ${year}`
        : `du ${formatDay(from).toLowerCase()} au ${formatDay(to).toLowerCase()}`;

  const exportCsv = () => {
    const q = csvCell;
    const rows = [
      [
        "Nom",
        "Entreprise",
        "Téléphone",
        "Repas",
        "Jours",
        "Montant (FCFA)",
        "Premier repas",
        "Dernier repas",
      ],
      ...filtered.map((p) => [
        p.person_name,
        p.partner_name ?? "Particulier",
        p.phone,
        p.meals,
        p.days,
        p.amount,
        p.first_day,
        p.last_day,
      ]),
    ];
    downloadFile(
      `tracabilite-repas-${from}-${to}.csv`,
      "﻿" + rows.map((r) => r.map(q).join(";")).join("\n"),
      "text/csv;charset=utf-8",
    );
  };

  return (
    <section className="space-y-5">
      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex rounded-lg bg-muted p-1" role="radiogroup" aria-label="Période">
          {(
            [
              ["mois", "Mois"],
              ["annee", "Année"],
              ["periode", "Période"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "h-8 rounded-md px-3 text-sm font-medium",
                mode === value ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "mois" && (
          <Input
            type="month"
            aria-label="Mois"
            className="w-44"
            value={month}
            onChange={(e) => setMonth(e.target.value || today.slice(0, 7))}
          />
        )}
        {mode === "annee" && (
          <select
            aria-label="Année"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from({ length: 5 }, (_, i) => Number(today.slice(0, 4)) - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
        {mode === "periode" && (
          <div className="flex items-center gap-2 text-sm">
            <Input
              type="date"
              aria-label="Du"
              className="w-40"
              value={custom.from}
              onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })}
            />
            au
            <Input
              type="date"
              aria-label="Au"
              className="w-40"
              value={custom.to}
              onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })}
            />
          </div>
        )}
        <select
          aria-label="Entreprise"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={scopeValue}
          onChange={(e) => setScopeValue(e.target.value)}
        >
          <option value="entreprises">Toutes les entreprises</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="particuliers">Particuliers</option>
          <option value="all">Tout le monde</option>
        </select>
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Rechercher une personne"
            placeholder="Nom ou téléphone…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="size-4" /> Exporter
        </Button>
      </div>

      {/* Chiffres de la période */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Repas", totals.meals.toLocaleString("fr-FR"), periodLabel],
          ["Montant", formatPrice(totals.amount), "Plats et jus"],
          ["Personnes", String(eaters), "Ont pris au moins un repas"],
          [
            "Moyenne",
            eaters ? (totals.meals / eaters).toFixed(1).replace(".", ",") : "0",
            "Repas par personne",
          ],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground first-letter:uppercase">{hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <MonthBars title={`Repas par mois · ${chartYear}`} months={months} />
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-semibold">Par entreprise</h3>
          {byCompany.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Aucun repas sur la période.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Entreprise</th>
                  <th className="pb-2 text-right font-medium">Personnes</th>
                  <th className="pb-2 text-right font-medium">Repas</th>
                  <th className="pb-2 text-right font-medium">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {byCompany.map((c) => (
                  <tr key={c.name}>
                    <td className="py-2 font-medium">{c.name}</td>
                    <td className="py-2 text-right tabular-nums">{c.people}</td>
                    <td className="py-2 text-right tabular-nums">{c.meals}</td>
                    <td className="py-2 text-right tabular-nums">{formatPrice(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Personnes */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-semibold">Repas par personne</h3>
          <span className="text-sm text-muted-foreground">
            {filtered.length} personne{filtered.length > 1 ? "s" : ""} · cliquez pour le détail
          </span>
        </div>
        {isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Chargement…</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="Aucun repas sur la période" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">Nom</th>
                  <th className="px-3 py-2 font-medium">Entreprise</th>
                  <th className="px-3 py-2 font-medium">Téléphone</th>
                  <th className="px-3 py-2 text-right font-medium">Repas</th>
                  <th className="px-3 py-2 text-right font-medium">Jours</th>
                  <th className="px-3 py-2 text-right font-medium">Montant</th>
                  <th className="px-5 py-2 font-medium">Dernier repas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr
                    key={p.person_key}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setSelected(p)}
                  >
                    <td className="px-5 py-2.5 font-medium">{p.person_name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {p.partner_name ?? "Particulier"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{p.phone}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{p.meals}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.days}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatPrice(p.amount)}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{formatDay(p.last_day)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PersonSheet
        person={selected}
        from={from}
        to={to}
        year={chartYear}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}

function MonthBars({ title, months }: { title: string; months: MonthRow[] }) {
  const max = Math.max(1, ...months.map((m) => m.meals));
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-4 flex h-40 items-end gap-1.5">
        {MONTHS.map((label, i) => {
          const m = months.find((r) => r.month === i + 1);
          const meals = m?.meals ?? 0;
          return (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-muted-foreground">{meals || ""}</span>
              <span
                className="w-full rounded-t-md bg-[var(--brand-chart)]"
                style={{ height: `${(meals / max) * 112}px`, minHeight: meals ? 4 : 0 }}
                title={m ? `${meals} repas · ${formatPrice(m.amount)} · ${m.people} personnes` : ""}
              />
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PersonSheet({
  person,
  from,
  to,
  year,
  onClose,
}: {
  person: PersonRow | null;
  from: string;
  to: string;
  year: number;
  onClose: () => void;
}) {
  const key = person?.person_key ?? "";
  const { data: history = [] } = useQuery({ ...historyQuery(key, from, to), enabled: !!person });
  const { data: months = [] } = useQuery({
    ...monthsQuery(year, null, key, "all"),
    enabled: !!person,
  });
  return (
    <Sheet open={!!person} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {person && (
          <>
            <SheetHeader>
              <SheetTitle>{person.person_name}</SheetTitle>
              <SheetDescription>
                {person.partner_name ?? "Particulier"} · {person.phone}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              {[
                ["Repas", String(person.meals)],
                ["Jours", String(person.days)],
                ["Montant", formatPrice(person.amount)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <MonthBars title={`Sur l'année ${year}`} months={months} />
            </div>
            <h3 className="mt-6 font-semibold">Détail des repas</h3>
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
              {history.map((h, i) => (
                <li
                  key={`${h.reference}-${i}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="w-28 shrink-0 text-muted-foreground">
                    {formatDay(h.day_date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {h.quantity > 1 ? `${h.quantity} × ` : ""}
                    {h.product_name}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatPrice(h.amount)}
                  </span>
                </li>
              ))}
              {history.length === 0 && (
                <li className="px-4 py-3 text-sm text-muted-foreground">Aucun repas.</li>
              )}
            </ul>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
