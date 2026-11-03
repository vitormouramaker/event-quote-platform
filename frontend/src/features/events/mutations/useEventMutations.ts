import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  eventTemplatesApi,
  type EventTemplateCloneDto,
  type EventTemplateWriteDto,
} from "../../../services/api";
import { toast } from "sonner";

export function useEventMutations() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: EventTemplateWriteDto) => eventTemplatesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-base"] });
      toast.success("Evento criado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao criar evento: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EventTemplateWriteDto }) =>
      eventTemplatesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-base"] });
      toast.success("Evento atualizado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar evento: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => eventTemplatesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events-base"] });
      toast.success("Evento excluído com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir evento: ${error.message}`);
    },
  });

  // Cria o evento para outra cidade (mesma família), copiando itens/configs/regras.
  const cloneMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EventTemplateCloneDto }) =>
      eventTemplatesApi.clone(id, data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["events-base"] });
      toast.success(res?.message || "Evento criado para a nova cidade!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao copiar evento: ${error.message}`);
    },
  });

  // "Aplicar às outras cidades": irmãos passam a ter a config deste evento.
  const applyToFamilyMutation = useMutation({
    mutationFn: (id: string) => eventTemplatesApi.applyToFamily(id),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["events-base"] });
      const cities = res?.data?.applied_to ?? [];
      toast.success(
        cities.length
          ? `Configuração aplicada a: ${cities.join(", ")}`
          : "Nenhuma outra cidade nesta família.",
      );
    },
    onError: (error: Error) => {
      toast.error(`Erro ao aplicar às outras cidades: ${error.message}`);
    },
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    cloneMutation,
    applyToFamilyMutation,
  };
}
