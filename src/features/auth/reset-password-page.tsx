import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { supabase } from "@core/integrations/supabase/client";
import logo from "@core/assets/logo.png";
import { CLIENT } from "@/config/client";

/**
 * Page ouverte depuis le lien « Mot de passe oublié » reçu par email.
 * Supabase lit le jeton du lien et ouvre une session de récupération,
 * qui permet ici de choisir un nouveau mot de passe.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setState("ready");
    });
    // Le lien peut avoir déjà été traité avant l'abonnement : on vérifie la session.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setState("ready");
      else setTimeout(() => setState((s) => (s === "checking" ? "invalid" : s)), 2500);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Mot de passe modifié");
    navigate({ to: "/admin" });
  }

  return (
    <div className="admin-shell flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src={logo}
            alt={CLIENT.name}
            width={256}
            height={256}
            className="size-16 rounded-full bg-white object-cover"
          />
          <h1 className="mt-4 text-2xl font-semibold">Nouveau mot de passe</h1>
        </div>

        {state === "checking" && (
          <p className="text-center text-sm text-muted-foreground" role="status">
            Vérification du lien…
          </p>
        )}

        {state === "invalid" && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Ce lien a expiré ou a déjà servi. Demandez-en un nouveau depuis la page de connexion
              avec « Mot de passe oublié ? ».
            </p>
            <Button asChild className="w-full">
              <Link to="/auth">Retour à la connexion</Link>
            </Button>
          </div>
        )}

        {state === "ready" && (
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nouveau mot de passe</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">8 caractères minimum.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                aria-invalid={mismatch}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {mismatch && (
                <p className="text-xs text-destructive">Les deux mots de passe sont différents.</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={saving || mismatch}>
              {saving ? "Enregistrement…" : "Enregistrer le mot de passe"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
