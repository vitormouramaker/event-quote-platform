import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { runEditApprovalFlow } from "./discountApprovalsEditFlow";
import type { EditRequest } from "../../../store/DiscountRequestsStore";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const editRequest: EditRequest = {
  id: "req-1",
  budgetId: "budget-1",
  clientName: "Cliente X",
  requestedBy: "Usuário",
  requestedAt: "2026-01-01T00:00:00.000Z",
  reason: "Precisa ajustar itens",
  status: "PENDING",
};

describe("runEditApprovalFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bloqueia submit sem observação", () => {
    const submit = vi.fn();
    const unlock = vi.fn();
    const reset = vi.fn();

    runEditApprovalFlow({
      selectedEditRequest: editRequest,
      editActionType: "APPROVE",
      editObservation: "   ",
      submitEditRequestStatus: submit,
      unlockBudget: unlock,
      resetDialog: reset,
    });

    expect(toast.error).toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("aprova edição e desbloqueia orçamento", () => {
    const submit = vi.fn();
    const unlock = vi.fn();
    const reset = vi.fn();

    runEditApprovalFlow({
      selectedEditRequest: editRequest,
      editActionType: "APPROVE",
      editObservation: "Aprovado",
      submitEditRequestStatus: submit,
      unlockBudget: unlock,
      resetDialog: reset,
    });

    expect(submit).toHaveBeenCalledWith({
      id: "req-1",
      status: "APPROVED",
      observation: "Aprovado",
    });
    expect(unlock).toHaveBeenCalledWith("budget-1");
    expect(toast.success).toHaveBeenCalledWith("Edição aprovada! O orçamento foi desbloqueado.");
    expect(reset).toHaveBeenCalled();
  });

  it("rejeita edição sem desbloquear orçamento", () => {
    const submit = vi.fn();
    const unlock = vi.fn();
    const reset = vi.fn();

    runEditApprovalFlow({
      selectedEditRequest: editRequest,
      editActionType: "REJECT",
      editObservation: "Sem justificativa suficiente",
      submitEditRequestStatus: submit,
      unlockBudget: unlock,
      resetDialog: reset,
    });

    expect(submit).toHaveBeenCalledWith({
      id: "req-1",
      status: "REJECTED",
      observation: "Sem justificativa suficiente",
    });
    expect(unlock).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Solicitação de edição rejeitada.");
    expect(reset).toHaveBeenCalled();
  });
});
