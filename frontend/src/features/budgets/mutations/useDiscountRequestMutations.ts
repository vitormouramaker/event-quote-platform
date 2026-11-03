import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { discountsApi } from "../../../services/api";
import { discountApprovalsDataQueryKey } from "../queries/useDiscountApprovalsDataQuery";

type UpdateDiscountRequestStatusInput = {
  id: string;
  status: "APPROVED" | "REJECTED";
  observation: string;
  newDiscountPercent?: number;
  /** Valor aprovado em reais, quando o pedido era de valor fixo. */
  newDiscountValue?: number;
};

export function useUpdateDiscountRequestStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status, observation, newDiscountPercent, newDiscountValue }: UpdateDiscountRequestStatusInput) => {
      const res = await discountsApi.updateStatus(
        id, status, observation, newDiscountPercent, newDiscountValue,
      );
      if (!res.ok) {
        throw new Error(res.message || "Erro ao atualizar solicitação de desconto");
      }
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discountApprovalsDataQueryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar solicitação de desconto");
    },
  });
}
