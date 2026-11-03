import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  venueProposalsApi,
  type VenueProposalWriteDto,
} from "../../../services/api";
import { venueProposalsQueryKey, venueSettingsQueryKey } from "../queries/useVenueProposalQueries";

export function useVenueProposalMutations() {
  const queryClient = useQueryClient();
  const invalidar = () =>
    queryClient.invalidateQueries({ queryKey: venueProposalsQueryKey });

  const createMutation = useMutation({
    mutationFn: async (data: VenueProposalWriteDto) => {
      const res = await venueProposalsApi.create(data);
      if (!res.ok) throw new Error(res.message || "Erro ao salvar a proposta");
      return res.data;
    },
    onSuccess: () => {
      void invalidar();
      toast.success("Proposta criada!");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: VenueProposalWriteDto }) => {
      const res = await venueProposalsApi.update(id, data);
      if (!res.ok) throw new Error(res.message || "Erro ao atualizar a proposta");
      return res.data;
    },
    onSuccess: () => {
      void invalidar();
      toast.success("Proposta atualizada!");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await venueProposalsApi.remove(id);
      if (!res.ok) throw new Error(res.message || "Erro ao excluir a proposta");
      return res.data;
    },
    onSuccess: () => {
      void invalidar();
      toast.success("Proposta excluída.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createVersionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: VenueProposalWriteDto }) => {
      const res = await venueProposalsApi.createVersion(id, data);
      if (!res.ok) throw new Error(res.message || "Erro ao criar a nova versão");
      return res.data;
    },
    onSuccess: (data) => {
      void invalidar();
      toast.success(`Versão ${data?.version ?? ""} criada!`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      observation,
    }: {
      id: string;
      status: "PENDING" | "SENT_FOR_APPROVAL" | "APPROVED" | "CANCELLED";
      observation?: string;
    }) => {
      const res = await venueProposalsApi.updateStatus(id, { status, observation });
      if (!res.ok) throw new Error(res.message || "Erro ao alterar o status");
      return res.data;
    },
    onSuccess: (_data, variables) => {
      void invalidar();
      // O painel e a comissao leem o valor aprovado; sem invalidar, o numero
      // so mudaria no proximo carregamento da tela.
      void queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success(
        {
          PENDING: "Proposta devolvida para pendente.",
          SENT_FOR_APPROVAL: "Proposta enviada para aprovação!",
          APPROVED: "Proposta aprovada!",
          CANCELLED: "Proposta cancelada.",
        }[variables.status],
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reviewDiscountMutation = useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      status: "APPROVED" | "REJECTED";
      observation: string;
      discountPercent: number;
      discountAmount: number;
      totalValue: number;
    }) => {
      const res = await venueProposalsApi.reviewDiscount(id, body);
      if (!res.ok) throw new Error(res.message || "Erro ao revisar o desconto");
      return res.data;
    },
    onSuccess: (_data, variables) => {
      void invalidar();
      toast.success(
        variables.status === "APPROVED" ? "Desconto aprovado!" : "Desconto rejeitado.",
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: unknown) => {
      const res = await venueProposalsApi.updateSettings(data);
      if (!res.ok) throw new Error(res.message || "Erro ao salvar a tabela de preços");
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: venueSettingsQueryKey });
      toast.success("Tabela de preços atualizada!");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    createMutation,
    updateMutation,
    createVersionMutation,
    updateStatusMutation,
    removeMutation,
    reviewDiscountMutation,
    updateSettingsMutation,
  };
}
