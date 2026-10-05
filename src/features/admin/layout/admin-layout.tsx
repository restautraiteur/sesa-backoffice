import { Link, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange,
  ChartColumn,
  ChevronDown,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShoppingBag,
  Calculator,
  CalendarCheck,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@ui/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@ui/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ui/components/ui/dropdown-menu";
import logo from "@core/assets/logo.png";
import { supabase } from "@core/integrations/supabase/client";
import { db } from "@core/lib/db";
import { ordersQuery } from "@/features/admin/orders/api";
import { adminMenuQuery } from "@core/domain/menu/api";
import { NotificationBell } from "@/features/admin/notifications/notification-bell";
import { SITE_URL } from "@core/lib/urls";
import { CLIENT } from "@/config/client";

const NAV = [
  { to: "/admin", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "Commandes", icon: ShoppingBag, exact: false },
  { to: "/admin/weeks", label: "Menus", icon: CalendarRange, exact: false },
  { to: "/admin/products", label: "Catalogue", icon: Package, exact: false },
  { to: "/admin/reports", label: "Bilan", icon: ChartColumn, exact: false },
  { to: "/admin/abonnements", label: "Abonnements", icon: CalendarCheck, exact: false },
  { to: "/admin/simulation", label: "Simulation", icon: Calculator, exact: false },
  // Module « Entreprises partenaires » : visible seulement s'il est activé pour ce client.
  ...(CLIENT.partners
    ? ([{ to: "/admin/entreprises", label: "Entreprises", icon: Building2, exact: false }] as const)
    : []),
] as const;

export function AdminLayout() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<"loading" | "ready" | "denied">("loading");
  const [email, setEmail] = useState<string | null>(null);

  // Thème gérant posé sur <body> : les fenêtres modales (rendues hors du layout) en héritent.
  useEffect(() => {
    document.body.classList.add("admin-shell");
    return () => document.body.classList.remove("admin-shell");
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data.user) {
        navigate({ to: "/auth" });
        return;
      }
      setEmail(data.user.email ?? null);
      const { data: isAdmin } = await db.rpc("is_admin");
      if (!active) return;
      if (isAdmin) {
        setState("ready");
        return;
      }
      const { data: claimed } = await db.rpc("claim_admin");
      if (!active) return;
      setState(claimed ? "ready" : "denied");
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  const { data: orders = [] } = useQuery({ ...ordersQuery(), enabled: state === "ready" });
  const { data: menu = [] } = useQuery({ ...adminMenuQuery(), enabled: state === "ready" });
  const newOrders = orders.filter((o) => o.status === "nouvelle").length;

  // Prévient le gérant quand une commande arrive pendant qu'il travaille.
  const knownIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (state !== "ready" || orders.length === 0) return;
    const ids = new Set(orders.map((o) => o.id));
    if (knownIds.current) {
      const arrived = orders.filter((o) => !knownIds.current!.has(o.id));
      if (arrived.length === 1) {
        const order = arrived[0]!;
        const kind =
          order.order_type === "precommande" ? "Nouvelle précommande" : "Nouvelle commande";
        toast.info(`${kind} de ${order.first_name} ${order.last_name}`, {
          description: order.reference,
          action: {
            label: "Voir",
            onClick: () => navigate({ to: "/admin/orders", search: { q: order.reference } }),
          },
        });
      } else if (arrived.length > 1) {
        toast.info(`${arrived.length} nouvelles commandes`, {
          action: { label: "Voir", onClick: () => navigate({ to: "/admin/orders" }) },
        });
      }
    }
    knownIds.current = ids;
  }, [orders, state, navigate]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    toast.success("Déconnecté");
    router.navigate({ to: "/auth", replace: true });
  }

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <span className="size-4 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none" />
          Chargement de l'espace gérant…
        </div>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Accès réservé au gérant</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Le compte {email ? <strong className="text-foreground">{email}</strong> : "connecté"}{" "}
            n'a pas les droits d'administration.
          </p>
          <Button className="mt-6" onClick={signOut}>
            Changer de compte
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AdminShell
      email={email}
      newOrders={newOrders}
      notifications={<NotificationBell orders={orders} menu={menu} />}
      onSignOut={signOut}
    >
      <Outlet />
    </AdminShell>
  );
}

/** Habillage de l'espace gérant : navigation verticale à gauche, barre du haut, contenu pleine largeur. */
export function AdminShell({
  email,
  newOrders,
  notifications,
  onSignOut,
  children,
}: {
  email: string | null;
  newOrders: number;
  notifications?: ReactNode;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const initial = (email ?? "G").slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen overflow-x-clip bg-background lg:pl-64">
      {/* Navigation verticale (ordinateur) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Brand />
        </div>
        <nav aria-label="Navigation gérant" className="flex-1 overflow-y-auto px-3 py-5">
          <ul className="space-y-1.5">
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  className="relative flex h-12 items-center gap-3 rounded-lg px-4 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  activeProps={{
                    className:
                      "!bg-[var(--brand-tint)] !font-semibold !text-primary before:absolute before:inset-y-2.5 before:-left-3 before:w-1 before:rounded-r before:bg-primary",
                  }}
                >
                  <item.icon className="size-5" />
                  <span className="flex-1">{item.label}</span>
                  {item.to === "/admin/orders" && newOrders > 0 && <NewBadge count={newOrders} />}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-border p-3">
          <a
            href={SITE_URL}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-[18px]" /> Voir le site client
          </a>
        </div>
      </aside>

      {/* Barre du haut : notifications et compte */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex h-16 items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <MobileNav newOrders={newOrders} onSignOut={onSignOut} />
            <Brand />
          </div>
          <p className="hidden text-sm text-muted-foreground lg:block">
            {new Intl.DateTimeFormat("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "Africa/Dakar",
            }).format(new Date())}
          </p>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {notifications}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {initial}
                  </span>
                  <span className="hidden max-w-48 truncate font-medium md:block">
                    {email ?? "Gérant"}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="font-normal">
                  <span className="block text-xs text-muted-foreground">Connecté en tant que</span>
                  <span className="block truncate font-medium">{email ?? "Gérant"}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href={SITE_URL} target="_blank" rel="noreferrer">
                    <ExternalLink /> Voir le site client
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onSignOut}>
                  <LogOut /> Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">{children}</main>
    </div>
  );
}

/** Téléphone et tablette : bouton menu (comme sur le site) qui ouvre la liste des pages. */
function MobileNav({ newOrders, onSignOut }: { newOrders: number; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Ouvrir le menu"
          className="relative flex size-10 items-center justify-center rounded-full border border-border hover:bg-muted"
        >
          <Menu className="size-5" />
          {newOrders > 0 && (
            <span className="absolute -right-1 -top-1">
              <NewBadge count={newOrders} />
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-72 flex-col bg-card p-0">
        <div className="flex h-16 items-center border-b border-border px-5">
          <SheetTitle asChild>
            <div>
              <Brand />
            </div>
          </SheetTitle>
        </div>
        <nav aria-label="Navigation gérant" className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  onClick={() => setOpen(false)}
                  className="flex h-12 items-center gap-3 rounded-lg px-4 text-[15px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  activeProps={{
                    className: "!bg-[var(--brand-tint)] !font-semibold !text-primary",
                  }}
                >
                  <item.icon className="size-5" />
                  <span className="flex-1">{item.label}</span>
                  {item.to === "/admin/orders" && newOrders > 0 && <NewBadge count={newOrders} />}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-1 border-t border-border p-3">
          <a
            href={SITE_URL}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-[18px]" /> Voir le site client
          </a>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex h-11 w-full items-center gap-3 rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-[18px]" /> Se déconnecter
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Brand() {
  return (
    <Link to="/admin" className="flex shrink-0 items-center gap-3">
      <img
        src={logo}
        alt=""
        width={256}
        height={256}
        className="size-10 shrink-0 rounded-full border border-border bg-white object-cover"
      />
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold">{CLIENT.name}</span>
        <span className="block text-xs text-muted-foreground">Espace gérant</span>
      </span>
    </Link>
  );
}

function NewBadge({ count }: { count: number }) {
  return (
    <span
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground"
      aria-label={`${count} nouvelle${count > 1 ? "s" : ""} commande${count > 1 ? "s" : ""}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
