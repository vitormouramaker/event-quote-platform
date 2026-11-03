import { useMutation, useQueryClient } from "@tanstack/react-query";
import { auditoriumsApi, type AuditoriumWriteDto } from "../../../services/api";
import { toast } from "sonner";

export function useAuditoriumMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["auditoriums"] });

  const createMutation = useMutation({
    mutationFn: (data: AuditoriumWriteDto) => auditoriumsApi.create(data),
    onSuccess: () => {
      invalidate();
      toast.success("Auditório criado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar auditório: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AuditoriumWriteDto }) =>
      auditoriumsApi.update(id, data),
    onSuccess: () => {
      invalidate();
      toast.success("Auditório atualizado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar auditório: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => auditoriumsApi.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success("Auditório excluído com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir auditório: ${error.message}`);
    },
  });

  return { createMutation, updateMutation, deleteMutation };
}
