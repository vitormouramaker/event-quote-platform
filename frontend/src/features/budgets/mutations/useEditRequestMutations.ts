import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { editRequestsApi } from "../../../services/api";
import { discountApprovalsDataQueryKey } from "../queries/useDiscountApprovalsDataQuery";
import { editRequestsQueryKey } from "../queries/useEditRequestsQuery";

type CreateEditRequestInput = {
  budgetId: string;
  clientName: string;
  requestedBy: string;
  reason: string;
  status?: "PENDING" | "APPROVED" | "REJECTED";
};

type UpdateEditRequestStatusInput = {
  id: string;
  status: "APPROVED" | "REJECTED";
  observation: string;
};

async function invalidateEditRequestQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: editRequestsQueryKey }),
    queryClient.invalidateQueries({ queryKey: discountApprovalsDataQueryKey }),
  ]);
}

export function useCreateEditRequestMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateEditRequestInput) => {
      const res = await editRequestsApi.create(input);
      if (!res.ok) {
        throw new Error(res.message || "Erro ao criar solicitação de edição");
      }
      return res.data;
    },
    onSuccess: async () => {
      await invalidateEditRequestQueries(queryClient);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao criar solicitação de edição");
    },
  });
}

export function useUpdateEditRequestStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status, observation }: UpdateEditRequestStatusInput) => {
      const res = await editRequestsApi.updateStatus(id, status, observation);
      if (!res.ok) {
        throw new Error(res.message || "Erro ao atualizar solicitação de edição");
      }
      return res.data;
    },
    onSuccess: async () => {
      await invalidateEditRequestQueries(queryClient);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar solicitação de edição");
    },
  });
}
