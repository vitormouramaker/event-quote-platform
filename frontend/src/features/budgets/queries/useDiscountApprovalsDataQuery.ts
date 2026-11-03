import { useQuery } from "@tanstack/react-query";
import { discountsApi, editRequestsApi } from "../../../services/api";
import {
  mapDiscountRequest,
  mapEditRequest,
  mapItemRequest,
  type DiscountRequest,
  type EditRequest,
  type ItemDiscountRequest,
} from "../../../store/DiscountRequestsStore";

export const discountApprovalsDataQueryKey = ["discount-approvals-data"] as const;

type DiscountApprovalsData = {
  requests: DiscountRequest[];
  itemRequests: ItemDiscountRequest[];
  editRequests: EditRequest[];
};

async function fetchDiscountApprovalsData(): Promise<DiscountApprovalsData> {
  const [dr, ir, er] = await Promise.all([
    discountsApi.getAll(),
    discountsApi.getAllItems(),
    editRequestsApi.getAll(),
  ]);

  if (!dr.ok) {
    throw new Error(dr.message || "Erro ao carregar solicitações de desconto");
  }

  if (!ir.ok) {
    throw new Error(ir.message || "Erro ao carregar solicitações de desconto de item");
  }

  if (!er.ok) {
    throw new Error(er.message || "Erro ao carregar solicitações de edição");
  }

  return {
    requests: (dr.data ?? []).map(mapDiscountRequest),
    itemRequests: (ir.data ?? []).map(mapItemRequest),
    editRequests: (er.data ?? []).map(mapEditRequest),
  };
}

export function useDiscountApprovalsDataQuery() {
  return useQuery({
    queryKey: discountApprovalsDataQueryKey,
    queryFn: fetchDiscountApprovalsData,
  });
}
