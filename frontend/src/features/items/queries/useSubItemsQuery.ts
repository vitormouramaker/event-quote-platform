import { useQuery } from "@tanstack/react-query";
import { subItemsApi } from "../../../services/api";

export function useSubItemsQuery() {
  return useQuery({
    queryKey: ["sub-items"],
    queryFn: async () => {
      const res = await subItemsApi.getAll();
      return res.data;
    },
  });
}

export function useSubItemQuery(id?: string) {
  return useQuery({
    queryKey: ["sub-items", id],
    queryFn: async () => {
      if (!id) return null;
      const res = await subItemsApi.getById(id);
      return res.data;
    },
    enabled: !!id,
  });
}
