import { useMutation, useQueryClient } from "@tanstack/react-query";
import { subItemsApi, type SubItemWriteDto } from "../../../services/api";
import { toast } from "sonner";

export function useSubItemMutations() {
  const queryClient = useQueryClient();

  // Sub-itens aparecem embutidos nos itens, que por sua vez vem embutidos nos
  // eventos base — derruba os tres caches para o orcamento nao usar dado velho.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["sub-items"] });
    queryClient.invalidateQueries({ queryKey: ["items-base"] });
    queryClient.invalidateQueries({ queryKey: ["events-base"] });
  };

  const createMutation = useMutation({
    mutationFn: (data: SubItemWriteDto) => subItemsApi.create(data),
    onSuccess: () => {
      invalidate();
      toast.success("Sub-item criado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar sub-item: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: SubItemWriteDto }) =>
      subItemsApi.update(id, data),
    onSuccess: () => {
      invalidate();
      toast.success("Sub-item atualizado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar sub-item: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => subItemsApi.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success("Sub-item removido com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao remover sub-item: ${error.message}`);
    },
  });

  return { createMutation, updateMutation, deleteMutation };
}
