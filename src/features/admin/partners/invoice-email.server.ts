import { CLIENT } from "@/config/client";

/**
 * Factures des entreprises partenaires envoyées par email (Resend) au responsable de l'entreprise.
 * Variables Vercel : RESEND_API_KEY, INVOICE_FROM_EMAIL (ex. « SESA Catering <factures@sesa-catering.com> »).
 */

type Line = {
  day_date: string;
  employee: string;
  product_name: string;
  quantity: number;
  amount: number;
};

type PartnerRow = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  payment_terms_days: number;
  billing_day: number | null;
  active: boolean;
};

const fmt = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} FCFA`;
const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayDakar() {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Dakar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function admin() {
  const { supabaseAdmin } = await import("@core/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function linesFor(partnerId: string, from: string, to: string): Promise<Line[]> {
  const db = await admin();
  const { data, error } = await db
    .from("order_items")
    .select(
      "day_date, product_name, quantity, amount, orders!inner(first_name, partner_id, status)",
    )
    .eq("orders.partner_id", partnerId)
    .neq("orders.status", "annulee")
    .gte("day_date", from)
    .lte("day_date", to);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const order = r.orders as unknown as { first_name: string };
    return {
      day_date: r.day_date,
      employee: order.first_name,
      product_name: r.product_name,
      quantity: r.quantity,
      amount: r.amount,
    };
  });
}

function invoiceHtml(
  partner: PartnerRow,
  reference: string,
  from: string,
  to: string,
  due: string,
  lines: Line[],
) {
  const days = new Map<string, { meals: number; amount: number }>();
  for (const l of lines) {
    const d = days.get(l.day_date) ?? { meals: 0, amount: 0 };
    d.meals += l.quantity;
    d.amount += l.amount;
    days.set(l.day_date, d);
  }
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const meals = lines.reduce((s, l) => s + l.quantity, 0);
  const rows = [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([day, d]) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">BC-${day.replaceAll("-", "")}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${fmtDate(day)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${d.meals}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(d.amount)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#18202e">
  <div style="max-width:640px;margin:0 auto;background:#fff;padding:28px">
    <p style="margin:0;font-size:13px;color:#5f6b7a">${esc(CLIENT.name)}</p>
    <h1 style="margin:4px 0 0;font-size:22px">Facture ${esc(reference)}</h1>
    <p style="margin:4px 0 20px;color:#5f6b7a">Repas livrés du ${fmtDate(from)} au ${fmtDate(to)}</p>
    <p>Bonjour${partner.contact_name ? ` ${esc(partner.contact_name)}` : ""},</p>
    <p>Veuillez trouver ci-dessous la facture des repas livrés à <b>${esc(partner.name)}</b> sur la période, avec le détail par bon de commande. Le détail par employé est joint (fichier CSV, ouvrable dans Excel).</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <thead><tr style="background:#f5f6f8;text-align:left"><th style="padding:8px">Bon</th><th style="padding:8px">Livraison</th><th style="padding:8px;text-align:right">Repas</th><th style="padding:8px;text-align:right">Montant</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2" style="padding:10px 8px;font-weight:bold;border-top:2px solid #18202e">Total à payer (${meals} repas)</td><td></td><td style="padding:10px 8px;font-weight:bold;text-align:right;border-top:2px solid #18202e">${fmt(total)}</td></tr></tfoot>
    </table>
    <p><b>Échéance :</b> ${fmtDate(due)}</p>
    <p style="color:#5f6b7a;font-size:13px">Pour toute question : WhatsApp ${esc(CLIENT.name)}. Merci pour votre confiance.</p>
  </div></body></html>`;
}

function invoiceCsv(lines: Line[]) {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["Jour", "Employé", "Plat", "Quantité", "Montant"],
    ...[...lines]
      .sort((a, b) => a.day_date.localeCompare(b.day_date) || a.employee.localeCompare(b.employee))
      .map((l) => [l.day_date, l.employee, l.product_name, l.quantity, l.amount]),
  ];
  return "﻿" + rows.map((r) => r.map(q).join(";")).join("\n");
}

async function sendEmail(to: string, subject: string, html: string, csv: string, filename: string) {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["INVOICE_FROM_EMAIL"];
  if (!key || !from) {
    throw new Error(
      "Envoi d'emails non configuré (RESEND_API_KEY et INVOICE_FROM_EMAIL sur Vercel).",
    );
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      attachments: [{ filename, content: Buffer.from(csv, "utf-8").toString("base64") }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`L'email n'a pas pu partir (${res.status}). ${detail.slice(0, 200)}`);
  }
}

/** Crée (ou met à jour) la facture d'une période et l'envoie au responsable de l'entreprise. */
export async function sendPartnerInvoice(partnerId: string, from: string, to: string) {
  const db = await admin();
  const { data: partner, error } = await db
    .from("partners")
    .select("id, name, contact_name, contact_email, payment_terms_days, billing_day, active")
    .eq("id", partnerId)
    .single();
  if (error || !partner) throw new Error("Entreprise introuvable.");
  if (!partner.contact_email) throw new Error(`Aucun email de responsable pour ${partner.name}.`);
  const lines = await linesFor(partnerId, from, to);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  if (total === 0) return { skipped: true, reason: "Aucune commande sur la période." };

  const month = `${to.slice(0, 7)}-01`;
  const reference = `FAC-${to.slice(0, 7).replace("-", "")}-${partner.name.slice(0, 3).toUpperCase()}`;
  const today = todayDakar();
  const due = addDays(today, partner.payment_terms_days);
  const { data: existing } = await db
    .from("partner_invoices")
    .select("id, status, amount_paid")
    .eq("partner_id", partnerId)
    .eq("month", month)
    .maybeSingle();
  if (existing?.status === "payee") return { skipped: true, reason: "Facture déjà payée." };

  await sendEmail(
    partner.contact_email,
    `Facture ${reference} · ${CLIENT.name}`,
    invoiceHtml(partner, reference, from, to, due, lines),
    invoiceCsv(lines),
    `detail-${reference}.csv`,
  );
  const now = new Date().toISOString();
  const { error: upsertError } = await db.from("partner_invoices").upsert(
    {
      partner_id: partnerId,
      month,
      reference,
      total,
      status: existing && existing.amount_paid > 0 ? "partielle" : "envoyee",
      sent_at: now,
      due_date: due,
      period_start: from,
      period_end: to,
      emailed_at: now,
      email_to: partner.contact_email,
    },
    { onConflict: "partner_id,month" },
  );
  if (upsertError) throw new Error(upsertError.message);
  return { sent: true, to: partner.contact_email, total };
}

/** Tâche quotidienne : envoie les factures des entreprises dont c'est le jour d'envoi. */
export async function runAutomaticInvoices() {
  const db = await admin();
  const today = todayDakar();
  const day = Number(today.slice(8, 10));
  const { data: partners, error } = await db
    .from("partners")
    .select("id, name, billing_day")
    .eq("active", true)
    .eq("billing_day", day);
  if (error) throw new Error(error.message);
  const results = [];
  for (const p of partners ?? []) {
    const end = today;
    const startDate = new Date(`${today}T00:00:00Z`);
    startDate.setUTCMonth(startDate.getUTCMonth() - 1);
    startDate.setUTCDate(day + 1);
    const start = startDate.toISOString().slice(0, 10);
    try {
      results.push({ partner: p.name, ...(await sendPartnerInvoice(p.id, start, end)) });
    } catch (e) {
      results.push({ partner: p.name, error: (e as Error).message });
    }
  }
  return { date: today, results };
}
