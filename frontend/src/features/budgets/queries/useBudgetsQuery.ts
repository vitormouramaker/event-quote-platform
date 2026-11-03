import { useQuery } from "@tanstack/react-query";
import { budgetsApi } from "../../../services/api";
import { mapBudget, type Budget } from "../../../store/budgetStore";

export const budgetsQueryKey = ["budgets"] as const;

async function fetchBudgetsQuery(): Promise<Budget[]> {
  const res = await budgetsApi.getAll();
  if (!res.ok) {
    throw new Error(res.message || "Erro ao carregar orcamentos");
  }

  return (res.data ?? []).map(mapBudget);
}

export function useBudgetsQuery() {
  return useQuery({
    queryKey: budgetsQueryKey,
    queryFn: fetchBudgetsQuery,
  });
}
