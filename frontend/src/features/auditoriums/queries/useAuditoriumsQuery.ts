import { useQuery } from "@tanstack/react-query";
import { auditoriumsApi } from "../../../services/api";
import { patchAuditoriumsSelector } from "../../budgets/migration/canonicalRuntimeConfig";

export function useAuditoriumsQuery() {
  return useQuery({
    queryKey: ["auditoriums"],
    queryFn: async () => {
      const res = await auditoriumsApi.getAll();
      patchAuditoriumsSelector(res.data);
      return res.data;
    },
  });
}
