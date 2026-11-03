import { useQuery } from "@tanstack/react-query";
import { itemsApi } from "../../../services/api";

/** A lógica que este item tem em cada evento que o utiliza. */
export function useItemEventConfigsQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["item-event-configs", id],
    queryFn: async () => {
      if (!id) return [];
      const res = await itemsApi.getEventConfigs(id);
      return res.data ?? [];
    },
    enabled: !!id,
  });
}
