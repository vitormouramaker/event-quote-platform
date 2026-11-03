import { useQuery } from "@tanstack/react-query";
import { contractAnnexesApi } from "../../../services/api";

export function useAnnexesQuery(enabled = true) {
  return useQuery({
    queryKey: ["contract-annexes"],
    queryFn: async () => {
      const res = await contractAnnexesApi.getAll();
      return res.data;
    },
    enabled,
  });
}
