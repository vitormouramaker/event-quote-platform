import { useDiscountApprovalsDataQuery } from "./useDiscountApprovalsDataQuery";
import { useBudgetsQuery } from "./useBudgetsQuery";
import { useAuthStore } from "../../../store/authStore";
import { useBudgetStore } from "../../../store/budgetStore";
import { useDiscountRequestsStore } from "../../../store/DiscountRequestsStore";
import {
  usePendingVenueApprovals,
  usePendingVenueDiscounts,
} from "../../venueProposals/queries/useVenueProposalQueries";

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]) {
  const merged = new Map<string, T>();

  primary.forEach((item) => {
    merged.set(item.id, item);
  });

  secondary.forEach((item) => {
    merged.set(item.id, item);
  });

  return Array.from(merged.values());
}

/**
 * Returns pending approval counts visible to the current user.
 * Admins see all pending; regular users see only their own.
 */
export function usePendingApprovalsCount() {
  const { user } = useAuthStore();
  const { data } = useDiscountApprovalsDataQuery();
  const { data: budgetsData } = useBudgetsQuery();
  const { budgets: storedBudgets } = useBudgetStore();
  const {
    requests: storedRequests,
    editRequests: storedEditRequests,
  } = useDiscountRequestsStore();

  const pendingVenueDiscounts = usePendingVenueDiscounts();
  const pendingVenueApprovals = usePendingVenueApprovals();

  const isAdminByRole = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";
  const canApproveDiscounts = isAdminByRole || user?.perm_approve_discounts === true;
  const canApproveEdits = isAdminByRole || user?.perm_approve_edit_requests === true;
  const userName = user?.name ?? "";

  const globalRequests = mergeById(data?.requests ?? [], storedRequests);
  const editRequests = mergeById(data?.editRequests ?? [], storedEditRequests);
  // Item requests vêm apenas do backend (query); nada volátil/local entra aqui.
  const allItemRequests = data?.itemRequests ?? [];
  const allBudgets = mergeById(budgetsData ?? [], storedBudgets);

  const discounts =
    globalRequests.filter((r) => r.status === "PENDING" && (canApproveDiscounts || r.requestedBy === userName)).length +
    allItemRequests.filter((r) => r.status === "PENDING" && (canApproveDiscounts || r.requestedBy === userName)).length;

  const edits = editRequests.filter(
    (r) => r.status === "PENDING" && (canApproveEdits || r.requestedBy === userName),
  ).length;

  // Budget approvals: only admins approve budgets sent for approval
  const budgetApprovals = isAdminByRole
    ? allBudgets.filter((b) => b.status === "SENT_FOR_APPROVAL").length
    : allBudgets.filter((b) => b.status === "SENT_FOR_APPROVAL" && (b.createdByName || b.createdBy) === userName).length;

  // Desconto de proposta de locacao: aba propria na tela, mas a mesma fila
  // para quem aprova.
  const meuOuPossoAprovar = (row: { created_by_name?: string | null }) =>
    canApproveDiscounts || (row.created_by_name ?? "") === userName;

  // Locacao: desconto pedido + proposta aguardando aprovacao, na mesma aba.
  const venue =
    pendingVenueDiscounts.filter(meuOuPossoAprovar).length +
    pendingVenueApprovals.filter((row) => isAdminByRole || meuOuPossoAprovar(row))
      .length;

  return {
    discounts,
    edits,
    budgetApprovals,
    venue,
    total: discounts + edits + budgetApprovals + venue,
  };
}
