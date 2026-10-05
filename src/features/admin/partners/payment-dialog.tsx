import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/components/ui/dialog";
import {
  PAYMENT_METHODS,
  invoiceRemaining,
  monthLabel,
  type Partner,
  type PartnerInvoice,
  type PartnerPayment,
} from "@/features/admin/partners/api";
import { db } from "@core/lib/db";
import { formatPrice, todayISO } from "@core/lib/format";

const SELECT = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Enregistre l'argent reçu d'une entreprise (total ou partiel) : la facture se met à jour seule. */
export function PaymentDialog({
  partner,
  invoices,
  invoiceId,
  open,
  onClose,
}: {
  partner: Partner | null;
  /** Factures de l'entreprise encore à régler. */
  invoices: PartnerInvoice[];
  /** Facture présélectionnée. */
  invoiceId?: string | null | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    invoice: "",
    amount: "",
    date: todayISO(),
    method: "virement" as PartnerPayment["method"],
    reference: "",
    note: "",
  });
  useEffect(() => {
    if (!open) return;
    const first = invoices.find((i) => i.id === invoiceId) ?? invoices[0];
    setForm({
      invoice: first?.id ?? "",
      amount: first ? String(invoiceRemaining(first)) : "",
      date: todayISO(),
      method: "virement",
      reference: "",
      note: "",
    });
    // Réinitialise seulement à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  const selected = invoices.find((i) => i.id === form.invoice);
  const amount = Number(form.amount);
  const valid = Number.isInteger(amount) && amount > 0 && !!form.date;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.from("partner_payments").insert({
        partner_id: partner!.id,
        invoice_id: form.invoice || null,
        amount,
        paid_on: form.date,
        method: form.method,
        reference: form.reference.trim() || null,
        note: form.note.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner_payments"] });
      queryClient.invalidateQueries({ queryKey: ["partner_invoices"] });
      toast.success(`Paiement de ${formatPrice(amount)} enregistré`);
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Encaisser · {partner?.name}</DialogTitle>
          <DialogDescription>
            Argent reçu de l'entreprise (en une ou plusieurs fois). La facture passe à « partielle »
            puis « payée » automatiquement.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay-invoice">Facture</Label>
            <select
              id="pay-invoice"
              className={SELECT}
              value={form.invoice}
              onChange={(e) => {
                const inv = invoices.find((i) => i.id === e.target.value);
                setForm({
                  ...form,
                  invoice: e.target.value,
                  amount: inv ? String(invoiceRemaining(inv)) : form.amount,
                });
              }}
            >
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.reference} · {monthLabel(i.month.slice(0, 7))} · reste{" "}
                  {formatPrice(invoiceRemaining(i))}
                </option>
              ))}
              <option value="">Sans facture (acompte, avance…)</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">Montant reçu (FCFA)</Label>
              <Input
                id="pay-amount"
                type="number"
                min={1}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-date">Date de réception</Label>
              <Input
                id="pay-date"
                type="date"
                max={todayISO()}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-method">Mode</Label>
              <select
                id="pay-method"
                className={SELECT}
                value={form.method}
                onChange={(e) =>
                  setForm({ ...form, method: e.target.value as PartnerPayment["method"] })
                }
              >
                {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-ref">Référence (facultatif)</Label>
              <Input
                id="pay-ref"
                placeholder="N° de virement, de chèque…"
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-note">Note (facultatif)</Label>
            <Input
              id="pay-note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
          {selected && valid && amount > invoiceRemaining(selected) && (
            <p className="text-xs text-amber-700">
              Montant supérieur au reste de la facture ({formatPrice(invoiceRemaining(selected))}).
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            Enregistrer {valid ? formatPrice(amount) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
