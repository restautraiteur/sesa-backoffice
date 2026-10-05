import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { ConfirmDialog, EmptyState } from "@/features/admin/components/admin-ui";
import type { Product } from "@/features/admin/products/api";
import {
  HISTORY_SIZE,
  logCost,
  type Ingredient,
  type ProductionLog,
} from "@/features/admin/simulation/api";
import { ProductionDialog } from "@/features/admin/simulation/components/production-dialog";
import { db } from "@core/lib/db";
import { formatDay, formatPrice } from "@core/lib/format";
import { cn } from "@core/lib/utils";

/** Journal de production : chaque cuisson, ce qu'elle a coûté et combien de plats elle a donnés. */
export function ProductionPanel({
  logs,
  dishes,
  ingredients,
}: {
  logs: ProductionLog[];
  dishes: Product[];
  ingredients: Ingredient[];
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ log: ProductionLog | null } | null>(null);
  const [toDelete, setToDelete] = useState<ProductionLog | null>(null);
  const dishById = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);

  const toggleExcluded = useMutation({
    mutationFn: async (log: ProductionLog) => {
      const { error } = await db
        .from("production_logs")
        .update({ excluded: !log.excluded })
        .eq("id", log.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["production_logs"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("production_logs").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production_logs"] });
      toast.success("Fiche supprimée");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-semibold">Journal de production</h2>
          <p className="text-sm text-muted-foreground">
            Une fiche par cuisson. Le plus simple : depuis Menus, bouton « Cuisson » sur le plat du
            jour. Les prévisions se basent sur les {HISTORY_SIZE} dernières cuissons de chaque plat.
          </p>
        </div>
        <Button
          onClick={() => setDialog({ log: null })}
          disabled={dishes.length === 0 || ingredients.length === 0}
        >
          <Plus className="size-4" /> Nouvelle cuisson
        </Button>
      </div>

      {ingredients.length === 0 ? (
        <EmptyState title="Ajoutez d'abord vos ingrédients">
          Créez vos ingrédients (riz, poulet, tomate…) dans l'onglet « Ingrédients ».
        </EmptyState>
      ) : logs.length === 0 ? (
        <EmptyState title="Aucune cuisson enregistrée">
          Après votre prochaine cuisson, notez ce que vous avez utilisé et le nombre de plats
          obtenus : c'est ce qui rendra les prévisions justes.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                <th className="px-5 py-2.5">Date</th>
                <th className="px-3 py-2.5">Plat</th>
                <th className="px-3 py-2.5 text-right">Plats obtenus</th>
                <th className="px-3 py-2.5 text-right">Dépense</th>
                <th className="px-3 py-2.5 text-right">Coût par plat</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => {
                const cost = logCost(log);
                return (
                  <tr key={log.id} className={cn(log.excluded && "text-muted-foreground")}>
                    <td className="px-5 py-3 first-letter:uppercase">{formatDay(log.cooked_on)}</td>
                    <td className="px-3 py-3">
                      <span className="font-medium">
                        {dishById.get(log.product_id)?.name ?? "—"}
                      </span>
                      {log.excluded && (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                          écartée
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">{log.plates_obtained}</td>
                    <td className="px-3 py-3 text-right">{formatPrice(cost)}</td>
                    <td className="px-3 py-3 text-right">
                      {formatPrice(Math.round(cost / log.plates_obtained))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        title={
                          log.excluded ? "Réintégrer dans les calculs" : "Écarter (cuisson ratée)"
                        }
                        aria-label={log.excluded ? "Réintégrer la fiche" : "Écarter la fiche"}
                        onClick={() => toggleExcluded.mutate(log)}
                      >
                        {log.excluded ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Modifier la fiche"
                        onClick={() => setDialog({ log })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Supprimer la fiche"
                        onClick={() => setToDelete(log)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProductionDialog
        open={dialog !== null}
        log={dialog?.log ?? null}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette fiche de cuisson ?"
        description="Elle ne sera plus utilisée dans les prévisions ni dans les dépenses réelles."
        confirmLabel="Supprimer"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id);
          setToDelete(null);
        }}
      />
    </section>
  );
}
