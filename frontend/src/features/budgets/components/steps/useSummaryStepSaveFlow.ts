import { toast } from "sonner";
import type { DiscountRequest } from "../../../../store/DiscountRequestsStore";
import type { Budget, BudgetSavePayload } from "../../../../store/budgetStore";
import type { SummaryFormValues } from "./SummaryStep.types";
import {
  buildSummaryBudgetData,
  validateBudgetStatusBeforeSave,
} from "./summaryStepSaveHelpers";
import {
  resolveDiscountAmounts,
  resolveDiscountMode,
  type DiscountMode,
} from "../../domain/discountInput";

type SaveFlowDeps = {
  formValues: SummaryFormValues;
  userName?: string;
  isAdmin: boolean;
  subtotal: number;
  totalFinal: number;
  deficit: number;
  requestedDiscount: number;
  requestObservation: string;
  requestedAttachmentName?: string;
  requestedAttachmentFile?: File | null;
  /** Mapa de descontos de item já aprovados a gravar na versão salva. */
  approvedItemDiscounts: Record<string, number>;
  /** Desconto de item pedido em reais, por chave `eventoId-itemId`. */
  approvedItemDiscountAmounts: Record<string, number>;
  /** "FIXED" quando `requestedDiscount` está em reais. */
  requestedDiscountMode: DiscountMode;
  globalRequests: DiscountRequest[];
  getBudgetById: (id: string) => Budget | undefined;
  createBudget: (data: BudgetSavePayload) => Promise<string | undefined>;
  addRequest: (request: Omit<DiscountRequest, "id" | "requestedAt">, attachmentFile?: File | null) => Promise<void>;
  migrateTempBudget: (tempId: string, finalId: string, clientName: string) => void;
  onSavedNavigate: () => void;
  allBudgets: Budget[];
};

export function buildClientTitle(formValues: SummaryFormValues) {
  return `${formValues.instituicao || ""} - ${formValues.curso || ""} - ${formValues.comissao || "Cliente"}`;
}

export function getEditingContext(formValues: SummaryFormValues, getBudgetById: (id: string) => Budget | undefined) {
  const isEditing = !!formValues.id && formValues.id !== "temp-budget";
  const budgetId = isEditing ? (formValues.id as string) : "temp-budget";
  const existingBudget = isEditing ? getBudgetById(budgetId) : undefined;
  return { isEditing, budgetId, existingBudget };
}

export function getOriginalCreator(existingBudget: Budget | undefined, userName?: string) {
  return existingBudget?.createdByName || existingBudget?.createdBy || userName || "Desconhecido";
}

export function migrateTempRequestsIfNeeded(args: {
  isEditing: boolean;
  budgetId: string;
  formValues: SummaryFormValues;
  savedBudgetId?: string;
  clientTitle: string;
  migrateTempBudget: (tempId: string, finalId: string, clientName: string) => void;
}) {
  const { isEditing, budgetId, formValues, savedBudgetId, clientTitle, migrateTempBudget } = args;
  // Id de origem das solicitações staged: a versão sendo editada ou o temp.
  const workingId = isEditing ? budgetId : ((formValues.id as string | undefined) || "temp-budget");
  // Destino: sempre a NOVA versão recém-criada no save.
  const targetId = savedBudgetId || (isEditing ? budgetId : undefined);
  if (!targetId) return;
  migrateTempBudget(workingId, targetId, clientTitle);
}

export async function syncGlobalDiscountRequestAfterSave(args: {
  requestedDiscount: number;
  /** "FIXED" quando `requestedDiscount` está em reais. */
  requestedDiscountMode: DiscountMode;
  savedBudgetId?: string;
  globalRequests: DiscountRequest[];
  requestObservation: string;
  requestedAttachmentName?: string;
  requestedAttachmentFile?: File | null;
  clientTitle: string;
  subtotal: number;
  userName?: string;
  isAdmin: boolean;
  addRequest: (request: Omit<DiscountRequest, "id" | "requestedAt">, attachmentFile?: File | null) => Promise<void>;
}) {
  const {
    requestedDiscount,
    requestedDiscountMode,
    savedBudgetId,
    globalRequests,
    requestObservation,
    requestedAttachmentName,
    requestedAttachmentFile,
    clientTitle,
    subtotal,
    userName,
    isAdmin,
    addRequest,
  } = args;

  if (!(requestedDiscount > 0 && savedBudgetId)) return;

  const pendingGlobalRequest = globalRequests.find(
    (r) => r.budgetId === savedBudgetId && r.status === "PENDING",
  );

  // O pedido salvo é "o mesmo" quando bate unidade, valor e motivo: comparar
  // só o percentual confundiria 10% com R$ 10.
  const pendingMode = resolveDiscountMode(pendingGlobalRequest?.discountMode);
  const pendingValue =
    pendingMode === "FIXED"
      ? pendingGlobalRequest?.requestedAmount ?? pendingGlobalRequest?.discountValue
      : pendingGlobalRequest?.discountPercent;

  const isAlreadyPending =
    !!pendingGlobalRequest &&
    pendingMode === requestedDiscountMode &&
    pendingValue === requestedDiscount &&
    pendingGlobalRequest.requestObservation === requestObservation;

  if (isAlreadyPending) return;

  const { percent, amount } = resolveDiscountAmounts(subtotal, {
    mode: requestedDiscountMode,
    value: requestedDiscount,
  });

  const reqData = {
    budgetId: savedBudgetId,
    clientName: clientTitle,
    totalValue: subtotal,
    discountMode: requestedDiscountMode,
    // Em reais fica o valor pedido; em percentual, o equivalente calculado.
    requestedAmount: requestedDiscountMode === "FIXED" ? amount : undefined,
    discountPercent: percent,
    discountValue: amount,
    finalValue: subtotal - amount,
    requestedBy: userName || "Usuário",
    requestObservation,
    attachmentName: requestedAttachmentName,
  };

  if (isAdmin) {
    await addRequest(
      {
        ...reqData,
        status: "APPROVED",
        approvedBy: userName || "Admin",
        approvedAt: new Date().toISOString(),
        observation: "Desconto aplicado diretamente pelo gestor.",
      },
      requestedAttachmentFile,
    );
    toast.success("Desconto global aplicado com sucesso!");
    return;
  }

  await addRequest(
    { ...reqData, status: "PENDING" },
    requestedAttachmentFile,
  );
  toast.info("Solicitação de desconto enviada para aprovação.");
}

export function useSummaryStepSaveFlow(deps: SaveFlowDeps) {
  const handleFinish = async () => {
    const validation = validateBudgetStatusBeforeSave(deps.formValues);
    if (!validation) return;
    const { status, observation } = validation;

    const { isEditing, budgetId, existingBudget } = getEditingContext(
      deps.formValues,
      deps.getBudgetById,
    );
    const originalCreator = getOriginalCreator(existingBudget, deps.userName);

    const budgetData = buildSummaryBudgetData({
      formValues: deps.formValues,
      isEditing,
      budgetId,
      existingBudget,
      originalCreator,
      status,
      observation,
      totalFinal: deps.totalFinal,
      subtotal: deps.subtotal,
      deficit: deps.deficit,
      allBudgets: deps.allBudgets,
      approvedItemDiscounts: deps.approvedItemDiscounts,
      approvedItemDiscountAmounts: deps.approvedItemDiscountAmounts,
    });

    // Always create a new budget entry for versioning
    const savedVersion = Number((budgetData.data as { version?: number } | undefined)?.version) || 1;
    const { id: _id, ...versionData } = budgetData;
    const savedBudgetId = await deps.createBudget(versionData);

    if (isEditing && !savedBudgetId) {
      return;
    }

    // Feedback contextual: deixa claro que a edição gerou uma NOVA versão
    // (o orçamento original permanece intacto).
    if (savedBudgetId) {
      toast.success(
        isEditing
          ? `Edição salva! Versão ${savedVersion} criada com sucesso.`
          : "Orçamento criado com sucesso!",
      );
    }

    const clientTitle = buildClientTitle(deps.formValues);
    migrateTempRequestsIfNeeded({
      isEditing,
      budgetId,
      formValues: deps.formValues,
      savedBudgetId,
      clientTitle,
      migrateTempBudget: deps.migrateTempBudget,
    });

    await syncGlobalDiscountRequestAfterSave({
      requestedDiscount: deps.requestedDiscount,
      requestedDiscountMode: deps.requestedDiscountMode,
      savedBudgetId,
      globalRequests: deps.globalRequests,
      requestObservation: deps.requestObservation,
      requestedAttachmentName: deps.requestedAttachmentName,
      requestedAttachmentFile: deps.requestedAttachmentFile,
      clientTitle,
      subtotal: deps.subtotal,
      userName: deps.userName,
      isAdmin: deps.isAdmin,
      addRequest: deps.addRequest,
    });

    deps.onSavedNavigate();
  };

  return { handleFinish };
}
