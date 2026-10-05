import { useEffect, useState } from "react";
import { BellRing, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import {
  disablePush,
  enablePush,
  getPushState,
  needsHomeScreenInstall,
  type PushState,
} from "@/features/admin/push/push-client";
import { sendTestPush } from "@/features/admin/push/push.functions";

/** Bloc « Notifications sur cet appareil », en bas du panneau des notifications. */
export function PushSettings() {
  const [state, setState] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [iosInstall, setIosInstall] = useState(false);

  useEffect(() => {
    setIosInstall(needsHomeScreenInstall());
    getPushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  return (
    <div className="border-t border-border bg-muted/40 px-4 py-3 text-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-primary">
          {state === "on" ? <BellRing className="size-4" /> : <Smartphone className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {state === "on" ? "Activées sur cet appareil" : "Recevoir sur cet appareil"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {state === "on" && "Vous êtes prévenu même quand l'espace gérant est fermé."}
            {state === "off" &&
              "Soyez prévenu des commandes et des plats épuisés, même application fermée."}
            {state === "denied" &&
              "Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur, puis rechargez la page."}
            {state === "unsupported" &&
              (iosInstall
                ? "Sur iPhone : touchez Partager puis « Sur l'écran d'accueil », et ouvrez l'espace gérant depuis cette icône pour activer les notifications."
                : "Ce navigateur ne permet pas les notifications. Utilisez Chrome, Edge, Firefox ou Safari récent.")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {state === "off" && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const next = await enablePush();
                    setState(next);
                    if (next === "on") {
                      toast.success("Notifications activées sur cet appareil");
                      await sendTestPush();
                    }
                  })
                }
              >
                {busy ? "Activation…" : "Activer"}
              </Button>
            )}
            {state === "on" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const result = await sendTestPush();
                      if (result.sent === 0) throw new Error("Aucun appareil n'a reçu le test.");
                      toast.success("Notification de test envoyée");
                    })
                  }
                >
                  Envoyer un test
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      setState(await disablePush());
                      toast.success("Notifications désactivées sur cet appareil");
                    })
                  }
                >
                  Désactiver
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
