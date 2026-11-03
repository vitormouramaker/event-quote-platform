import { useMutation, useQueryClient } from "@tanstack/react-query";
import { contractsApi, type ContractWriteDto } from "../../../services/api";
import { toast } from "sonner";

export function useContractMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["contracts"] });

  const createMutation = useMutation({
    mutationFn: (data: ContractWriteDto) => contractsApi.create(data),
    onSuccess: () => {
      invalidate();
      toast.success("Contrato salvo com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao salvar contrato: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ContractWriteDto }) =>
      contractsApi.update(id, data),
    onSuccess: () => {
      invalidate();
      toast.success("Contrato atualizado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar contrato: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contractsApi.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success("Contrato excluído com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir contrato: ${error.message}`);
    },
  });

  return { createMutation, updateMutation, deleteMutation };
}
