import { useMutation, useQueryClient } from "@tanstack/react-query";
import { citiesApi, type CityWriteDto } from "../../../services/api";
import { toast } from "sonner";

export function useCityMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["cities"] });

  const createMutation = useMutation({
    mutationFn: (data: CityWriteDto) => citiesApi.create(data),
    onSuccess: () => {
      invalidate();
      toast.success("Cidade criada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar cidade: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CityWriteDto }) => citiesApi.update(id, data),
    onSuccess: () => {
      invalidate();
      toast.success("Cidade atualizada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar cidade: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => citiesApi.remove(id),
    onSuccess: (res) => {
      invalidate();
      // Excluir cidade também remove os eventos base dela.
      queryClient.invalidateQueries({ queryKey: ["events-base"] });
      toast.success(res?.message || "Cidade excluída com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir cidade: ${error.message}`);
    },
  });

  return { createMutation, updateMutation, deleteMutation };
}
