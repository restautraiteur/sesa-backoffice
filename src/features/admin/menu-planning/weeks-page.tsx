import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { adminMenuQuery, type MenuRow } from "@core/domain/menu/api";
import { daysQuery, weeksQuery } from "@/features/admin/menu-planning/api";
import { db } from "@core/lib/db";
import { productsQuery } from "@/features/admin/products/api";
import { formatDay, todayISO } from "@core/lib/format";
import { cn } from "@core/lib/utils";
import {
  MONTH_NAMES,
  SHORT_DAYS,
  addDays,
  mondayOf,
  monthWeeks,
} from "@/features/admin/menu-planning/calendar";
import { WeekBoard } from "@/features/admin/menu-planning/components/week-board";

const VIEW_KEY = "admin-menus-view";
import { DayDialog } from "@/features/admin/menu-planning/components/day-dialog";
import { ConfirmDialog, PageHeader, TonePill } from "@/features/admin/components/admin-ui";

export function WeeksPage() {
  const queryClient = useQueryClient();
  const { data: weeks = [] } = useQuery(weeksQuery());
  const { data: days = [] } = useQuery(daysQuery());
  const { data: products = [] } = useQuery(productsQuery());
  const { data: menu = [] } = useQuery(adminMenuQuery());

  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { year: y ?? 2026, month: (m ?? 1) - 1 };
  });
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [toUnpublish, setToUnpublish] = useState<string | null>(null);
  // Vue « semaine » (nouvelle) ou « mois » (classique) ; le choix est mémorisé dans ce navigateur.
  const [view, setViewState] = useState<"semaine" | "mois">("semaine");
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "mois") setViewState("mois");
    } catch {
      // Stockage indisponible : on garde la vue par défaut.
    }
  }, []);
  function setView(next: "semaine" | "mois") {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Sans stockage, le choix vaut seulement pour cette visite.
    }
  }
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));

  const grid = useMemo(() => monthWeeks(cursor.year, cursor.month), [cursor]);
  const daysByDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const weekById = useMemo(() => new Map(weeks.map((w) => [w.id, w])), [weeks]);
  const weekByStart = useMemo(() => new Map(weeks.map((w) => [w.start_date, w])), [weeks]);
  const rowsByDay = useMemo(() => {
    const map = new Map<string, MenuRow[]>();
    for (const row of menu) {
      const list = map.get(row.day_id) ?? [];
      list.push(row);
      map.set(row.day_id, list);
    }
    return map;
  }, [menu]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["weeks"] });
    queryClient.invalidateQueries({ queryKey: ["days"] });
    queryClient.invalidateQueries({ queryKey: ["menu"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  }

  const createWeek = useMutation({
    mutationFn: async (start: string) => {
      const end = addDays(start, 6);
      const { data, error } = await db
        .from("weeks")
        .insert({ start_date: start, end_date: end, status: "draft" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const rows = Array.from({ length: 7 }, (_, index) => ({
        week_id: data.id,
        date: addDays(start, index),
        is_open: index < 5,
      }));
      const { error: dayError } = await db.from("days").insert(rows);
      if (dayError) throw new Error(dayError.message);
      return data.id as string;
    },
    onSuccess: () => {
      refresh();
      toast.success("Semaine ouverte : cliquez sur un jour pour composer son menu");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateWeek = useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await db.from("weeks").update(input.patch).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      refresh();
      toast.success("Semaine mise à jour");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateDay = useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await db.from("days").update(input.patch).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const updateDayProduct = useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await db.from("day_products").update(input.patch).eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      refresh();
      toast.success("Menu du jour enregistré");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addDayProduct = useMutation({
    mutationFn: async (input: {
      day_id: string;
      product_id: string;
      price: number;
      stock_initial: number;
    }) => {
      const { error } = await db.from("day_products").insert(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      refresh();
      toast.success("Produit ajouté au jour");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeDayProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("day_products").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      refresh();
      toast.success("Produit retiré");
    },
    onError: () => toast.error("Impossible de retirer ce produit (commandes existantes)."),
  });

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const date = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
    });
  }

  const selectedDay = openDay ? (daysByDate.get(openDay) ?? null) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menus"
        description="Ouvrez une semaine, composez chaque jour, puis publiez-la pour que les clients puissent commander."
        actions={
          <>
            <div
              role="group"
              aria-label="Affichage du calendrier"
              className="flex h-9 rounded-lg border border-border bg-card p-0.5 shadow-sm"
            >
              {(
                [
                  ["semaine", "Semaine"],
                  ["mois", "Mois"],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={cn(
                    "rounded-md px-3 text-sm font-medium transition-colors",
                    view === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {text}
                </button>
              ))}
            </div>
            {view === "mois" && (
              <div className="flex items-center rounded-lg border border-border bg-card">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Mois précédent"
                  onClick={() => shiftMonth(-1)}
                >
                  <ChevronLeft />
                </Button>
                <p className="min-w-36 text-center text-sm font-semibold first-letter:uppercase">
                  {MONTH_NAMES[cursor.month]} {cursor.year}
                </p>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Mois suivant"
                  onClick={() => shiftMonth(1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </>
        }
      />

      {view === "semaine" ? (
        <WeekBoard
          start={weekStart}
          today={today}
          week={weekByStart.get(weekStart) ?? null}
          daysByDate={daysByDate}
          rowsByDay={rowsByDay}
          creating={createWeek.isPending}
          onShift={(count) => setWeekStart((current) => addDays(current, count * 7))}
          onToday={() => setWeekStart(mondayOf(today))}
          onCreate={() => createWeek.mutate(weekStart)}
          onPublish={() => {
            const row = weekByStart.get(weekStart);
            if (row)
              updateWeek.mutate({
                id: row.id,
                patch: { status: "published", published_at: new Date().toISOString() },
              });
          }}
          onUnpublish={() => {
            const row = weekByStart.get(weekStart);
            if (row) setToUnpublish(row.id);
          }}
          onOpenDay={(date) => daysByDate.has(date) && setOpenDay(date)}
        />
      ) : (
        <>
          <div className="hidden grid-cols-7 gap-2 px-4 text-sm font-medium text-muted-foreground md:grid">
            {SHORT_DAYS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="space-y-4">
            {grid.map((week) => {
              const start = week[0]!;
              const weekRow = weekByStart.get(start);
              const published = weekRow?.status === "published";
              return (
                <section
                  key={start}
                  aria-label={`Semaine du ${formatDay(start)}`}
                  className={cn(
                    "rounded-xl border border-border bg-card p-4 shadow-sm",
                    !weekRow && "border-dashed bg-transparent shadow-none",
                  )}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <p className="font-semibold">Semaine du {formatDay(start)}</p>
                      {weekRow ? (
                        <TonePill
                          tone={
                            published
                              ? "bg-emerald-100 text-emerald-900 ring-emerald-300"
                              : "bg-amber-100 text-amber-900 ring-amber-300"
                          }
                        >
                          {published ? "Visible par les clients" : "Brouillon"}
                        </TonePill>
                      ) : (
                        <span className="text-sm text-muted-foreground">Pas encore ouverte</span>
                      )}
                    </div>
                    {weekRow ? (
                      published ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setToUnpublish(weekRow.id)}
                        >
                          Retirer du site
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            updateWeek.mutate({
                              id: weekRow.id,
                              patch: {
                                status: "published",
                                published_at: new Date().toISOString(),
                              },
                            })
                          }
                        >
                          <Send /> Publier la semaine
                        </Button>
                      )
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={createWeek.isPending}
                        onClick={() => createWeek.mutate(start)}
                      >
                        <CalendarPlus /> Ouvrir cette semaine
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-7">
                    {week.map((date) => {
                      const dayRow = daysByDate.get(date);
                      const items = dayRow ? (rowsByDay.get(dayRow.id) ?? []) : [];
                      const inMonth = Number(date.slice(5, 7)) - 1 === cursor.month;
                      const isToday = date === today;
                      const closed = dayRow && !dayRow.is_open;
                      return (
                        <button
                          key={date}
                          type="button"
                          disabled={!dayRow}
                          title={dayRow ? undefined : "Ouvrez la semaine pour composer ce jour"}
                          onClick={() => setOpenDay(date)}
                          className={cn(
                            "flex min-h-28 flex-col rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                            dayRow
                              ? "border-border bg-background hover:border-primary hover:bg-card"
                              : "cursor-not-allowed border-transparent bg-muted/40",
                            closed && "bg-muted/60",
                            !inMonth && "opacity-45",
                            isToday && "border-primary ring-1 ring-primary",
                          )}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">
                              <span className="md:hidden">{formatDay(date)}</span>
                              <span className="hidden md:inline">{Number(date.slice(8, 10))}</span>
                            </span>
                            {closed ? (
                              <span className="text-xs text-muted-foreground">Fermé</span>
                            ) : (
                              items.length > 0 && (
                                <span className="rounded-full bg-primary/10 px-1.5 text-xs font-semibold tabular-nums text-primary">
                                  {items.length}
                                </span>
                              )
                            )}
                          </span>
                          <span className="mt-2 flex-1 space-y-0.5 text-xs text-muted-foreground">
                            {items.slice(0, 3).map((item) => (
                              <span
                                key={item.day_product_id}
                                className={cn("block truncate", !item.is_active && "line-through")}
                              >
                                {item.name}
                                {item.dish_category && (
                                  <span className="text-primary/70"> · {item.dish_category}</span>
                                )}
                              </span>
                            ))}
                            {items.length > 3 && (
                              <span className="block font-medium">
                                et {items.length - 3} autre(s)
                              </span>
                            )}
                            {dayRow && !closed && items.length === 0 && (
                              <span className="block font-medium text-primary">
                                Ajouter des plats
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      <ConfirmDialog
        open={toUnpublish !== null}
        title="Retirer cette semaine du site ?"
        description="Les clients ne pourront plus voir ni commander les menus de cette semaine. Les commandes déjà passées sont conservées."
        confirmLabel="Retirer du site"
        onCancel={() => setToUnpublish(null)}
        onConfirm={() => {
          if (toUnpublish)
            updateWeek.mutate({
              id: toUnpublish,
              patch: { status: "draft", published_at: null },
            });
          setToUnpublish(null);
        }}
      />

      <DayDialog
        day={selectedDay}
        week={selectedDay ? (weekById.get(selectedDay.week_id) ?? null) : null}
        rows={selectedDay ? (rowsByDay.get(selectedDay.id) ?? []) : []}
        products={products}
        onClose={() => setOpenDay(null)}
        onUpdateDay={(patch) => selectedDay && updateDay.mutate({ id: selectedDay.id, patch })}
        onUpdateDayProduct={(id, patch) => updateDayProduct.mutate({ id, patch })}
        onRemove={(id) => removeDayProduct.mutate(id)}
        onAdd={(input) => addDayProduct.mutate(input)}
        pending={addDayProduct.isPending}
      />
    </div>
  );
}
