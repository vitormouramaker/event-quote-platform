import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { itemsApi, type ItemEventConfigWriteDto } from "../../../services/api";

export function useItemEventConfigMutations() {
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: ({
      id,
      configs,
    }: {
      id: string;
      configs: ItemEventConfigWriteDto[];
    }) => itemsApi.saveEventConfigs(id, configs),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["item-event-configs", variables.id],
      });
      // O catálogo do orçamento é montado a partir dos eventos base, que
      // carregam estas configs — sem invalidar, o orçamento seguiria usando a
      // regra antiga do item.
      queryClient.invalidateQueries({ queryKey: ["events-base"] });
      toast.success("Lógica por evento salva!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao salvar a lógica por evento: ${error.message}`);
    },
  });

  const invalidar = (id: string) => {
    queryClient.invalidateQueries({ queryKey: ["item-event-configs", id] });
    queryClient.invalidateQueries({ queryKey: ["events-base"] });
  };

  const addToEventMutation = useMutation({
    mutationFn: ({ id, eventTemplateId }: { id: string; eventTemplateId: string }) =>
      itemsApi.addToEvent(id, eventTemplateId),
    onSuccess: (_d, v) => {
      invalidar(v.id);
      toast.success("Item incluído no evento!");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao incluir no evento: ${error.message}`);
    },
  });

  const removeFromEventMutation = useMutation({
    mutationFn: ({ id, eventTemplateId }: { id: string; eventTemplateId: string }) =>
      itemsApi.removeFromEvent(id, eventTemplateId),
    onSuccess: (_d, v) => {
      invalidar(v.id);
      toast.success("Item retirado do evento.");
    },
    onError: (error: Error) => {
      toast.error(`Erro ao retirar do evento: ${error.message}`);
    },
  });

  return { saveMutation, addToEventMutation, removeFromEventMutation };
}
