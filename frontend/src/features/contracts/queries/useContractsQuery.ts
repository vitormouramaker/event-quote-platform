import { useQuery } from "@tanstack/react-query";
import { contractsApi } from "../../../services/api";

export function useContractsQuery() {
  return useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const res = await contractsApi.getAll();
      return res.data;
    },
  });
}
