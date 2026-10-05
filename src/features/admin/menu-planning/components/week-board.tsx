import { CalendarPlus, ChevronLeft, ChevronRight, EyeOff, Plus, Send } from "lucide-react";
import { Button } from "@ui/components/ui/button";
import type { MenuRow } from "@core/domain/menu/api";
import type { Day, Week } from "@/features/admin/menu-planning/api";
import { addDays } from "@/features/admin/menu-planning/calendar";
import { ProductThumb } from "@/features/admin/components/admin-ui";
import { weekdayLabel } from "@core/lib/format";
import { cn } from "@core/lib/utils";

const monthDay = (iso: string, withMonth = true) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    ...(withMonth ? { month: "long" } : {}),
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Vue « semaine » du planning : les 7 jours côte à côte, chacun avec ses plats,
 * la part déjà précommandée et un accès direct pour ajouter un plat.
 */
export function WeekBoard({
  start,
  today,
  week,
  daysByDate,
  rowsByDay,
  creating,
  onShift,
  onToday,
  onCreate,
  onPublish,
  onUnpublish,
  onOpenDay,
}: {
  start: string;
  today: string;
  week: Week | null;
  daysByDate: Map<string, Day>;
  rowsByDay: Map<string, MenuRow[]>;
  creating: boolean;
  onShift: (weeks: number) => void;
  onToday: () => void;
  onCreate: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onOpenDay: (date: string) => void;
}) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = dates[6]!;
  const published = week?.status === "published";
  const isCurrentWeek = today >= start && today <= end;

  const dayRows = dates.map((date) => {
    const day = daysByDate.get(date) ?? null;
    return { date, day, rows: day ? (rowsByDay.get(day.id) ?? []) : [] };
  });
  const openDays = dayRows.filter((d) => d.day?.is_open).length;
  const allRows = dayRows.flatMap((d) => d.rows.filter((r) => r.is_active));
  const planned = allRows.reduce((s, r) => s + r.stock_initial, 0);
  const reserved = allRows.reduce((s, r) => s + r.stock_reserved, 0);

  return (
    <div className="space-y-4">
      {/* Barre de la semaine : navigation, statut, action principale */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Semaine précédente"
            onClick={() => onShift(-1)}
          >
            <ChevronLeft />
          </Button>
          <div className="min-w-0 px-1 text-center sm:min-w-56">
            <p className="font-semibold">
              {monthDay(start, start.slice(5, 7) !== end.slice(5, 7))} – {monthDay(end)}
            </p>
            <p className="text-xs text-muted-foreground">
              {isCurrentWeek ? "Cette semaine" : `Semaine du ${weekdayLabel(start).toLowerCase()}`}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Semaine suivante"
            onClick={() => onShift(1)}
          >
            <ChevronRight />
          </Button>
          {!isCurrentWeek && (
            <Button size="sm" variant="outline" className="ml-1" onClick={onToday}>
              Cette semaine
            </Button>
          )}
        </div>

        {week && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              published ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800",
            )}
          >
            <span
              className={cn("size-1.5 rounded-full", published ? "bg-emerald-500" : "bg-amber-500")}
            />
            {published ? "Visible par les clients" : "Brouillon, invisible pour les clients"}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!week ? (
            <Button disabled={creating} onClick={onCreate}>
              <CalendarPlus /> Ouvrir cette semaine
            </Button>
          ) : published ? (
            <Button variant="outline" onClick={onUnpublish}>
              <EyeOff /> Retirer du site
            </Button>
          ) : (
            <Button onClick={onPublish}>
              <Send /> Publier la semaine
            </Button>
          )}
        </div>
      </div>

      {week && (
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border text-sm shadow-sm">
          <Stat label="Jours ouverts" value={`${openDays} / 7`} />
          <Stat label="Plats au menu" value={allRows.length} />
          <Stat label="Portions réservées" value={planned > 0 ? `${reserved} / ${planned}` : "—"} />
        </dl>
      )}

      {!week ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <CalendarPlus className="size-8 text-muted-foreground" />
          <p className="font-semibold">Cette semaine n'est pas encore ouverte</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Ouvrez-la pour créer ses 7 jours (lundi à vendredi ouverts par défaut), puis ajoutez les
            plats jour par jour.
          </p>
          <Button className="mt-2" disabled={creating} onClick={onCreate}>
            <CalendarPlus /> Ouvrir cette semaine
          </Button>
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="grid gap-3 sm:min-w-[980px] sm:grid-cols-7">
            {dayRows.map(({ date, day, rows }) => (
              <DayColumn
                key={date}
                date={date}
                day={day}
                rows={rows}
                isToday={date === today}
                isPast={date < today}
                onOpen={() => onOpenDay(date)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function DayColumn({
  date,
  day,
  rows,
  isToday,
  isPast,
  onOpen,
}: {
  date: string;
  day: Day | null;
  rows: MenuRow[];
  isToday: boolean;
  isPast: boolean;
  onOpen: () => void;
}) {
  const closed = !day?.is_open;
  return (
    <section
      aria-label={`${weekdayLabel(date)} ${monthDay(date)}`}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm sm:min-h-64",
        isToday ? "border-primary ring-1 ring-primary" : "border-border",
        isPast && "opacity-70",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span>
          <span className="block text-xs font-medium text-muted-foreground">
            {weekdayLabel(date)}
          </span>
          <span className="block text-2xl font-semibold leading-tight tabular-nums">
            {Number(date.slice(8, 10))}
          </span>
        </span>
        {isToday ? (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
            Aujourd'hui
          </span>
        ) : closed ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Fermé
          </span>
        ) : (
          day &&
          day.open_time && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {day.open_time.slice(0, 5)}–{day.close_time?.slice(0, 5)}
            </span>
          )
        )}
      </button>

      {closed ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-1 items-center justify-center bg-[repeating-linear-gradient(135deg,transparent,transparent_8px,var(--muted)_8px,var(--muted)_9px)] p-3 text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Pas de service ce jour-là
        </button>
      ) : (
        <>
          <ul className="flex-1 space-y-1 p-2">
            {rows.length === 0 && (
              <li className="px-1 py-6 text-center text-xs text-muted-foreground">
                Aucun plat pour l'instant
              </li>
            )}
            {rows.map((row) => {
              const ratio =
                row.stock_initial > 0 ? Math.min(1, row.stock_reserved / row.stock_initial) : 0;
              return (
                <li key={row.day_product_id}>
                  <button
                    type="button"
                    onClick={onOpen}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-muted/60",
                      !row.is_active && "opacity-50",
                    )}
                  >
                    <ProductThumb
                      name={row.name}
                      photoUrl={row.photo_url}
                      className="size-9 rounded-md"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-xs font-medium",
                          !row.is_active && "line-through",
                        )}
                      >
                        {row.name}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              row.stock_left <= 0
                                ? "bg-rose-500"
                                : ratio >= 0.8
                                  ? "bg-amber-500"
                                  : "bg-[var(--brand-chart)]",
                            )}
                            style={{ width: `${ratio * 100}%` }}
                          />
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {row.stock_reserved}/{row.stock_initial}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={onOpen}
            className="flex items-center justify-center gap-1.5 border-t border-border py-2 text-xs font-medium text-primary hover:bg-[var(--brand-tint)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          >
            <Plus className="size-3.5" /> Ajouter un plat
          </button>
        </>
      )}
    </section>
  );
}
