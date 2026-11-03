import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  contractAnnexesApi,
  type ContractAnnexWriteDto,
} from "../../../services/api";
import { toast } from "sonner";

export function useAnnexMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["contract-annexes"] });

  const createMutation = useMutation({
    mutationFn: (data: ContractAnnexWriteDto) => contractAnnexesApi.create(data),
    onSuccess: (res) => {
      invalidate();
      toast.success(res?.message || "Anexo contratual gerado!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao gerar anexo: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ContractAnnexWriteDto }) =>
      contractAnnexesApi.update(id, data),
    onSuccess: () => {
      invalidate();
      toast.success("Anexo atualizado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar anexo: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contractAnnexesApi.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success("Anexo excluído com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir anexo: ${error.message}`);
    },
  });

  return { createMutation, updateMutation, deleteMutation };
}
