import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/features/admin/components/admin-ui";
import { orderItemsQuery, ordersQuery } from "@/features/admin/orders/api";
import { productsQuery } from "@/features/admin/products/api";
import { ingredientsQuery, productionLogsQuery } from "@/features/admin/simulation/api";
import { ForecastPanel } from "@/features/admin/simulation/components/forecast-panel";
import { IngredientsPanel } from "@/features/admin/simulation/components/ingredients-panel";
import { ProductionPanel } from "@/features/admin/simulation/components/production-panel";
import { ReferenceSimulator } from "@/features/admin/simulation/components/reference-simulator";
import { adminMenuQuery } from "@core/domain/menu/api";
import { cn } from "@core/lib/utils";

const TABS = [
  ["simuler", "Simuler"],
  ["previsions", "Prévisions"],
  ["production", "Journal de production"],
  ["ingredients", "Ingrédients"],
] as const;

type Tab = (typeof TABS)[number][0];

export function SimulationPage() {
  const [tab, setTab] = useState<Tab>("simuler");
  const { data: ingredients = [] } = useQuery(ingredientsQuery());
  const { data: logs = [] } = useQuery(productionLogsQuery());
  const { data: products = [] } = useQuery(productsQuery());
  const { data: menu = [] } = useQuery(adminMenuQuery());
  const { data: orders = [] } = useQuery(ordersQuery());
  const { data: orderItems = [] } = useQuery(orderItemsQuery());
  const dishes = products.filter((p) => p.category === "plat");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulation"
        description="Repartez d'une journée de référence pour prévoir les plats, les courses et le chiffre d'affaires."
      />

      <div
        role="tablist"
        aria-label="Simulation"
        className="flex w-fit flex-wrap rounded-lg bg-muted p-1"
      >
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "h-9 rounded-md px-4 text-sm font-medium transition-colors",
              tab === value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "simuler" && (
        <ReferenceSimulator menu={menu} products={products} ingredients={ingredients} logs={logs} />
      )}
      {tab === "previsions" && (
        <ForecastPanel
          menu={menu}
          ingredients={ingredients}
          logs={logs}
          orders={orders}
          orderItems={orderItems}
        />
      )}
      {tab === "production" && (
        <ProductionPanel logs={logs} dishes={dishes} ingredients={ingredients} />
      )}
      {tab === "ingredients" && <IngredientsPanel ingredients={ingredients} />}
    </div>
  );
}
