import { useQuery } from "@tanstack/react-query";
import { itemsApi } from "../../../services/api";

export function useItemsQuery() {
  return useQuery({
    queryKey: ["items-base"],
    queryFn: async () => {
      const res = await itemsApi.getAll();
      return res.data;
    },
  });
}

export function useItemQuery(id: string | undefined) {
  return useQuery({
    queryKey: ["items-base", id],
    queryFn: async () => {
      if (!id) return null;
      const res = await itemsApi.getById(id);
      return res.data;
    },
    enabled: !!id,
  });
}
