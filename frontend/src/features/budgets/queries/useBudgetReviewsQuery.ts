import { useQuery } from "@tanstack/react-query";
import { budgetReviewsApi } from "../../../services/api";

export function useBudgetReviewsQuery(budgetId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["budget-reviews", budgetId],
    queryFn: async () => {
      const res = await budgetReviewsApi.getByBudget(budgetId as string);
      return res.data;
    },
    enabled: Boolean(budgetId) && enabled,
  });
}
