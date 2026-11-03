import { toast } from "sonner";
import type { EditRequest } from "../../../store/DiscountRequestsStore";

type EditDecisionAction = "APPROVE" | "REJECT";

type RunEditApprovalFlowArgs = {
  selectedEditRequest: EditRequest | null;
  editActionType: EditDecisionAction | null;
  editObservation: string;
  userName?: string;
  submitEditRequestStatus: (args: {
    id: string;
    status: "APPROVED" | "REJECTED";
    observation: string;
  }) => void;
  unlockBudget: (budgetId: string) => void;
  resetDialog: () => void;
};

export function runEditApprovalFlow(args: RunEditApprovalFlowArgs) {
  const {
    selectedEditRequest,
    editActionType,
    editObservation,
    submitEditRequestStatus,
    unlockBudget,
    resetDialog,
  } = args;

  if (!selectedEditRequest || !editActionType) return;

  if (!editObservation.trim()) {
    toast.error("É obrigatório informar uma observação.");
    return;
  }

  submitEditRequestStatus({
    id: selectedEditRequest.id,
    status: editActionType === "APPROVE" ? "APPROVED" : "REJECTED",
    observation: editObservation,
  });

  if (editActionType === "APPROVE" && selectedEditRequest.budgetId) {
    unlockBudget(selectedEditRequest.budgetId);
    toast.success("Edição aprovada! O orçamento foi desbloqueado.");
  } else {
    toast.success("Solicitação de edição rejeitada.");
  }

  resetDialog();
}
