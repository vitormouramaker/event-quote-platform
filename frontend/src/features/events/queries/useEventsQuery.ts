import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { eventTemplatesApi } from "../../../services/api";
import { hydrateCanonicalRuntimeConfig } from "../../budgets/migration/canonicalRuntimeConfig";

export function useEventsQuery() {
  return useQuery({
    queryKey: ["events-base"],
    queryFn: async () => {
      const [res, runtimeRes] = await Promise.all([
        eventTemplatesApi.getAll(),
        eventTemplatesApi.getRuntimeCatalog().catch(() => null),
      ]);

      if (runtimeRes?.data) {
        hydrateCanonicalRuntimeConfig(runtimeRes.data);
      }

      return res.data;
    },
  });
}

export function useEventQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["events-base", id],
    queryFn: async () => {
      if (!id) return null;
      const [res, runtimeRes] = await Promise.all([
        eventTemplatesApi.getById(id),
        eventTemplatesApi.getRuntimeCatalog().catch(() => null),
      ]);
      if (runtimeRes?.data) {
        hydrateCanonicalRuntimeConfig(runtimeRes.data);
      }
      return res.data;
    },
    enabled: !!id,
    // Ao trocar de aba (cidade), mantém os dados anteriores enquanto busca —
    // evita desmontar a tela e "piscar" o loading.
    placeholderData: keepPreviousData,
  });
}
