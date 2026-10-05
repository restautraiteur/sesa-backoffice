import { supabase } from "@core/integrations/supabase/client";
import { db } from "@core/lib/db";

export type PushState = "unsupported" | "denied" | "off" | "on";

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Sur iPhone / iPad, les notifications ne marchent que depuis l'icône ajoutée à l'écran d'accueil. */
export function needsHomeScreenInstall() {
  if (typeof window === "undefined") return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const subscription = await reg?.pushManager.getSubscription();
  return subscription && Notification.permission === "granted" ? "on" : "off";
}

function keyToBytes(base64Url: string) {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Demande l'autorisation, abonne cet appareil et l'enregistre pour le gérant connecté. */
export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const response = await fetch("/api/public/push-key");
  const { publicKey } = (await response.json()) as { publicKey: string | null };
  if (!publicKey) {
    throw new Error("Les notifications push ne sont pas encore configurées sur le serveur.");
  }

  const reg = await registration();
  await navigator.serviceWorker.ready;
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(publicKey),
    }));
  const json = subscription.toJSON();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user || !json.endpoint || !json.keys?.["p256dh"] || !json.keys["auth"]) {
    throw new Error("Abonnement impossible. Reconnectez-vous puis réessayez.");
  }
  const { error } = await db.from("push_subscriptions").upsert(
    {
      user_id: user.user.id,
      endpoint: json.endpoint,
      p256dh: json.keys["p256dh"],
      auth: json.keys["auth"],
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message);
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const subscription = await reg?.pushManager.getSubscription();
  if (subscription) {
    await db.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    await subscription.unsubscribe();
  }
  return "off";
}
