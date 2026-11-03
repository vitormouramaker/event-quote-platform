import { useQuery } from "@tanstack/react-query";
import { editRequestsApi } from "../../../services/api";
import { mapEditRequest, type EditRequest } from "../../../store/DiscountRequestsStore";

export const editRequestsQueryKey = ["edit-requests"] as const;

async function fetchEditRequests(): Promise<EditRequest[]> {
  const res = await editRequestsApi.getAll();
  if (!res.ok) {
    throw new Error(res.message || "Erro ao carregar solicitações de edição");
  }
  return (res.data ?? []).map(mapEditRequest);
}

export function useEditRequestsQuery() {
  return useQuery({
    queryKey: editRequestsQueryKey,
    queryFn: fetchEditRequests,
  });
}
