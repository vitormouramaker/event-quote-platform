import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { budgetsApi } from "../../../services/api";
import { budgetsQueryKey } from "../queries/useBudgetsQuery";
import { dashboardSummaryQueryKey } from "../../dashboard/queries/useDashboardSummaryQuery";

export function useDeleteBudgetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await budgetsApi.remove(id);
      if (!res.ok) {
        throw new Error(res.message || "Erro ao excluir orcamento");
      }
      return res;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: budgetsQueryKey });
      await queryClient.invalidateQueries({ queryKey: dashboardSummaryQueryKey });
      toast.success("Orcamento excluido!");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir orcamento");
    },
  });
}
