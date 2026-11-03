import { useMutation, useQueryClient } from "@tanstack/react-query";
import { budgetReviewsApi, type BudgetReviewWriteDto } from "../../../services/api";
import { toast } from "sonner";

export function useBudgetReviewMutations() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: BudgetReviewWriteDto) => budgetReviewsApi.create(data),
    onSuccess: (res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["budget-reviews", variables.budget_id] });
      if (res.ok) {
        toast.success(
          variables.kind === "aprovacao"
            ? "Orçamento aprovado pelo analista!"
            : variables.kind === "resposta"
              ? "Resposta enviada ao analista!"
              : "Devolutiva registrada!",
        );
      } else {
        toast.error(res.message || "Não foi possível registrar.");
      }
    },
    onError: (error: Error) => {
      toast.error(`Erro ao registrar: ${error.message}`);
    },
  });

  return { createMutation };
}
