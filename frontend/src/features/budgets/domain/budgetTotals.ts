import type { Budget } from "../../../store/budgetStore";
import type { BudgetCatalogEvent } from "../data/budgetCatalog";
import {
  calculateSummaryStepEventTotals,
  type CalcFormValues,
} from "./eventCalculations";
import { isCanonicalEvent } from "./budgetUiRules";

type ApprovedItemRequestLike = {
  eventId: string;
  itemId: string;
  status: "APPROVED";
  requestedPercentage: number;
  /** "FIXED" quando o desconto do item foi pedido em reais. */
  discountMode?: string;
  requestedAmount?: number;
};

type BudgetItemRequestsMap = Record<string, ApprovedItemRequestLike[]>;

export type BudgetComputedTotals = {
  /** Subtotal sem descontos de item (equivale a originalTotalValue). */
  subtotal: number;
  /** Total com descontos de item aplicados (equivale a totalValue). */
  totalDiscounted: number;
  /** Déficit dos eventos cortesia (culto cortesia / 100 dias). */
  deficit: number;
};

// Reconstroi o mapa de descontos de item aprovados a partir do budget,
// na mesma chave que o motor de cálculo espera (formValues.id).
function buildApprovedItemRequestsMap(budget: Budget): BudgetItemRequestsMap {
  const budgetId = budget.id || "temp-budget";
  const requests = Object.entries(budget.approvedItemDiscounts ?? {}).flatMap(
    ([compositeKey, requestedPercentage]) => {
      const separatorIndex = compositeKey.indexOf("-");
      if (separatorIndex <= 0) return [];
      // O valor em reais, quando existe, manda no cálculo: o percentual
      // gravado é só o equivalente da última vez que o orçamento foi salvo.
      const amount = budget.approvedItemDiscountAmounts?.[compositeKey];
      return [
        {
          eventId: compositeKey.slice(0, separatorIndex),
          itemId: compositeKey.slice(separatorIndex + 1),
          status: "APPROVED" as const,
          requestedPercentage: Number(requestedPercentage) || 0,
          discountMode: amount ? "FIXED" : "PERCENT",
          requestedAmount: Number(amount) || 0,
        },
      ];
    },
  );
  return { [budgetId]: requests };
}

// Déficit dos eventos cortesia: soma qty * preço dinâmico dos itens.
function calculateCustomDeficit(
  event: BudgetCatalogEvent,
  formValues: CalcFormValues,
): number {
  if (!isCanonicalEvent(event.id, "culto_cortesia")) return 0;
  return event.items.reduce((acc, item) => {
    const qty = Number(formValues.items?.[event.id]?.[item.id] || 0);
    const dynamicPrice = Number(formValues.items?.[event.id]?.[`${item.id}_price`] || 0);
    return acc + qty * dynamicPrice;
  }, 0);
}

/**
 * Recalcula os totais de um orçamento a partir dos dados versionados
 * (`budget.data`), sem depender do valor persistido em `total_value`.
 *
 * Usa exatamente a mesma lógica do SummaryStep, garantindo que o card exiba
 * o valor real da versão — inclusive para versões antigas salvas com total
 * defasado antes da correção da sincronização de quantidades derivadas.
 */
export function computeBudgetSummaryTotals(
  budget: Budget,
  budgetEvents: BudgetCatalogEvent[],
): BudgetComputedTotals {
  const formValues = { ...(budget.data ?? {}), id: budget.id } as CalcFormValues;
  const itemRequests = buildApprovedItemRequestsMap(budget);
  const selectedEventIds = (formValues.selectedEvents as string[] | undefined) ?? [];

  let subtotal = 0;
  let totalDiscounted = 0;
  let deficit = 0;

  selectedEventIds.forEach((eventId) => {
    const event = budgetEvents.find((candidate) => candidate.id === eventId);
    if (!event) return;

    if (
      isCanonicalEvent(event.id, "culto_cortesia") ||
      isCanonicalEvent(event.id, "evento_100_dias")
    ) {
      deficit += calculateCustomDeficit(event, formValues);
      return;
    }

    const result = calculateSummaryStepEventTotals(event, formValues, itemRequests);
    subtotal += result.total;
    totalDiscounted += result.discountedTotal;
  });

  return { subtotal, totalDiscounted, deficit };
}

/**
 * Valor a exibir no card. Recalcula a partir dos dados; se não houver dados
 * suficientes (sem eventos), faz fallback para o valor persistido.
 */
export function getBudgetDisplayTotal(
  budget: Budget,
  budgetEvents: BudgetCatalogEvent[],
): number {
  const selectedEvents = (budget.data?.selectedEvents as string[] | undefined) ?? [];
  if (selectedEvents.length === 0 || budgetEvents.length === 0) {
    return budget.totalValue;
  }
  return computeBudgetSummaryTotals(budget, budgetEvents).totalDiscounted;
}
