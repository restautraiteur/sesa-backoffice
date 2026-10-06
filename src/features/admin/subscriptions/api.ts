import { queryOptions } from "@tanstack/react-query";
import { db, run, runAll } from "@core/lib/db";

export type Plan = {
  id: string;
  name: string;
  meals_count: number;
  price: number;
  delivery_included: boolean;
  active: boolean;
  sort_order: number;
};

/** Repas utilisé par une commande : commandé (« prevu »), livré (« pris ») ou annulé avec la commande. */
export type Meal = {
  id: string;
  subscription_id: string;
  meal_date: string;
  status: "prevu" | "pris" | "annule";
  order_id: string | null;
  orders: {
    reference: string;
    status: string;
    order_items: { product_name: string; category: string; day_date: string }[];
  } | null;
};

export type SubscriptionPayment = {
  id: string;
  subscription_id: string;
  amount: number;
  method: "paydunya" | "manuel";
  status: "en_attente" | "paye" | "echec";
  note: string | null;
  created_at: string;
};

export type Subscription = {
  id: string;
  plan_name: string;
  meals_count: number;
  price: number;
  customer_name: string;
  phone: string;
  address: string | null;
  start_date: string;
  end_date: string;
  status: "en_attente" | "active" | "annulee";
  payment_status: "non_paye" | "acompte" | "paye";
  payment_choice: "total" | "moitie";
  payment_mode: "telephone" | "en_ligne";
  amount_paid: number;
  pin: string;
  pin_failures: number;
  notes: string | null;
  created_at: string;
  meals: Meal[];
  payments: SubscriptionPayment[];
};

export const SUBSCRIPTION_STATUS_LABELS: Record<Subscription["status"], string> = {
  en_attente: "À confirmer",
  active: "Confirmé",
  annulee: "Annulé",
};

export const plansAdminQuery = () =>
  queryOptions({
    queryKey: ["subscription_plans", "admin"],
    queryFn: () =>
      run<Plan[]>(
        db.from("subscription_plans").select("*").order("sort_order").order("meals_count", {
          ascending: false,
        }),
      ),
  });

export const subscriptionsQuery = () =>
  queryOptions({
    queryKey: ["subscriptions"],
    queryFn: async () => {
      const [subs, meals, payments] = await Promise.all([
        runAll<Omit<Subscription, "meals" | "payments">>(() =>
          db
            .from("subscriptions")
            .select("*")
            .order("created_at", { ascending: false })
            .order("id"),
        ),
        runAll<Meal>(() =>
          db
            .from("subscription_meals")
            .select("*, orders(reference, status, order_items(product_name, category, day_date))")
            .order("meal_date")
            .order("id"),
        ),
        runAll<SubscriptionPayment>(() =>
          db.from("subscription_payments").select("*").order("created_at").order("id"),
        ),
      ]);
      return subs.map((s) => ({
        ...s,
        meals: meals.filter((m) => m.subscription_id === s.id),
        payments: payments.filter((p) => p.subscription_id === s.id),
      }));
    },
  });

/** Repas encore disponibles (non utilisés par une commande). */
export function remainingMeals(sub: Subscription) {
  return sub.meals_count - sub.meals.filter((m) => m.status !== "annule").length;
}

/** Plat(s) commandé(s) pour le repas d'abonnement de ce jour. */
export function mealDish(meal: Meal) {
  const names = (meal.orders?.order_items ?? [])
    .filter((i) => i.category === "plat" && i.day_date === meal.meal_date)
    .map((i) => i.product_name);
  return [...new Set(names)].join(", ");
}

/** Numéro lisible : 221771234567 → +221 77 123 45 67 (format sénégalais quand c'est possible). */
export function formatPhone(digits: string) {
  const m = digits.match(/^(221)?(\d{2})(\d{3})(\d{2})(\d{2})$/);
  if (!m) return digits;
  return `${m[1] ? "+221 " : ""}${m[2]} ${m[3]} ${m[4]} ${m[5]}`;
}

/** Lien SMS avec un message prêt à envoyer : ouvre l'application Messages du téléphone
 * (numéros sénégalais à 9 chiffres complétés). */
export function smsLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.length === 9 ? `221${digits}` : digits;
  return `sms:+${intl}?body=${encodeURIComponent(text)}`;
}

/** Lien WhatsApp avec le même message prêt à envoyer. */
export function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.length === 9 ? `221${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

/** Message envoyé à l'abonné quand son repas est livré. */
export function deliveredMessage(
  sub: Pick<Subscription, "customer_name" | "meals_count" | "price" | "amount_paid">,
  remaining: number,
  siteName: string,
) {
  const balance = sub.price - sub.amount_paid;
  return [
    `Bonjour ${sub.customer_name}, votre repas est livré. Bon appétit !`,
    remaining > 0
      ? `Il vous reste ${remaining} repas sur ${sub.meals_count} dans votre abonnement.`
      : "C'était le dernier repas de votre abonnement. Merci ! Vous pouvez vous réabonner sur notre site.",
    balance > 0 && remaining > 0
      ? `Reste à régler : ${new Intl.NumberFormat("fr-FR").format(balance)} FCFA, avant votre dernier repas.`
      : "",
    `— ${siteName}`,
  ]
    .filter(Boolean)
    .join("\n");
}
