import { useQuery } from "@tanstack/react-query";
import { citiesApi } from "../../../services/api";

export function useCitiesQuery() {
  return useQuery({
    queryKey: ["cities"],
    queryFn: async () => {
      const res = await citiesApi.getAll();
      return res.data;
    },
  });
}
