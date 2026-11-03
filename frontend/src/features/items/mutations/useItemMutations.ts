import { useMutation, useQueryClient } from "@tanstack/react-query";
import { itemsApi, type ItemWriteDto } from "../../../services/api";
import { toast } from "sonner";

export function useItemMutations() {
  const queryClient = useQueryClient();

  // Os eventos base trazem os itens embutidos (inclusive unit_price), e o
  // catalogo do orcamento e montado a partir deles. Sem invalidar "events-base"
  // o orcamento seguia usando o preco antigo do item.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["items-base"] });
    queryClient.invalidateQueries({ queryKey: ["events-base"] });
  };

  const createMutation = useMutation({
    mutationFn: (data: ItemWriteDto) => itemsApi.create(data),
    onSuccess: () => {
      invalidate();
      toast.success("Item criado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar item: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ItemWriteDto }) =>
      itemsApi.update(id, data),
    onSuccess: () => {
      invalidate();
      toast.success("Item atualizado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar item: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => itemsApi.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success("Item excluído com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir item: ${error.message}`);
    },
  });

  return { createMutation, updateMutation, deleteMutation };
}
