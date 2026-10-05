import { useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { Input } from "@ui/components/ui/input";
import { Label } from "@ui/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/components/ui/tabs";
import { supabase } from "@core/integrations/supabase/client";
import { db } from "@core/lib/db";
import logo from "@core/assets/logo.png";
import { SITE_URL } from "@core/lib/urls";
import { CLIENT } from "@/config/client";

export function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // La création de compte ne sert qu'à créer le premier gérant : on la masque ensuite.
  const [allowSignup, setAllowSignup] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin" });
    });
    db.rpc("admin_exists").then(({ data, error }: { data: boolean | null; error: unknown }) => {
      // Sans la migration `admin_exists`, on garde l'ancien comportement (onglet visible).
      setAllowSignup(error ? true : data === false);
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/admin" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + "/admin" },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      navigate({ to: "/admin" });
    } else {
      toast.success("Compte créé. Vérifiez votre email pour confirmer l'inscription.");
    }
  }

  async function resetPassword() {
    if (!email) {
      toast.error("Renseignez votre email d'abord.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    if (error) toast.error(error.message);
    else toast.success("Email de réinitialisation envoyé.");
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
            className="size-20 rounded-full bg-white object-cover"
          />
          <h1 className="mt-4 text-2xl font-semibold">Espace gérant</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Commandes, menus et production de la cuisine.
          </p>
        </div>

        <Tabs defaultValue="signin">
          {allowSignup && (
            <TabsList className="w-full">
              <TabsTrigger value="signin" className="flex-1">
                Connexion
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">
                Créer un compte
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="signin">
            <form className="space-y-4 pt-4" onSubmit={signIn}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Connexion…" : "Se connecter"}
              </Button>
              <button
                type="button"
                onClick={resetPassword}
                className="w-full text-center text-sm text-muted-foreground hover:underline"
              >
                Mot de passe oublié ?
              </button>
            </form>
          </TabsContent>

          {allowSignup && (
            <TabsContent value="signup">
              <form className="space-y-4 pt-4" onSubmit={signUp}>
                <div className="space-y-2">
                  <Label htmlFor="email-up">Email</Label>
                  <Input
                    id="email-up"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-up">Mot de passe</Label>
                  <Input
                    id="password-up"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Le premier compte créé devient automatiquement administrateur.
                </p>
                <Button type="submit" className="w-full" disabled={loading}>
                  Créer mon compte
                </Button>
              </form>
            </TabsContent>
          )}
        </Tabs>

        <a
          href={SITE_URL}
          className="mt-6 block text-center text-sm text-muted-foreground hover:underline"
        >
          Retour au site client
        </a>
      </div>
    </div>
  );
}
