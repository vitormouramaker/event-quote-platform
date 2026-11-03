import type { Budget } from "../../../../store/budgetStore";
import type { SummaryBudgetDataPayload, SummaryCustomItems, SummaryFormValues } from "./SummaryStep.types";
import { toast } from "sonner";
import { adaptBudgetStoredFormData } from "../../migration/legacyBudgetAdapter";
import { diffBudgetItems } from "../../domain/budgetItemChanges";

/**
 * Compara o estado atual do formulário com o snapshot salvo em `ref.current`,
 * ignorando diferenças no campo `id` (que muda ao criar/editar).
 * Retorna `true` se houver alterações reais nos dados do orçamento.
 */
export function hasUnlockedBudgetChanges(
  formValues: SummaryFormValues,
  ref: { current: string | null },
): boolean {
  if (!ref.current) return false;
  try {
    const snapshot = JSON.parse(ref.current) as Record<string, unknown>;
    const current = formValues as unknown as Record<string, unknown>;
    const snapshotWithoutId = { ...snapshot, id: undefined };
    const currentWithoutId = { ...current, id: undefined };
    return JSON.stringify(currentWithoutId) !== JSON.stringify(snapshotWithoutId);
  } catch {
    return false;
  }
}

export function validateBudgetStatusBeforeSave(formValues: SummaryFormValues) {
  const status = (formValues.status || "PENDING") as Budget["status"];
  const observation = formValues.observation || "";

  if (status === "CANCELLED" && !observation.trim()) {
    toast.error("Para status Cancelado, é obrigatório informar o motivo do cancelamento.");
    return null;
  }

  return { status, observation };
}

/**
 * IDs de evento são strings numéricas (ex.: "12"). Ao hidratar via RHF `reset`,
 * `customItems` pode virar um array esparso com buracos `null`. Normaliza de volta
 * para um objeto puro sem entradas nulas antes de persistir.
 */
function normalizeCustomItems(customItems: SummaryCustomItems | undefined): SummaryCustomItems | undefined {
  if (!customItems || typeof customItems !== "object") return undefined;
  const result: SummaryCustomItems = {};
  for (const [key, value] of Object.entries(customItems)) {
    if (value == null) continue;
    result[key] = value;
  }
  return result;
}

export function buildSummaryBudgetData(args: {
  formValues: SummaryFormValues;
  isEditing: boolean;
  budgetId: string;
  existingBudget?: Budget;
  originalCreator: string;
  status: Budget["status"];
  observation: string;
  totalFinal: number;
  subtotal: number;
  deficit: number;
  allBudgets?: Budget[];
  /** Descontos de item já aprovados a gravar na versão (herdados + sessão). */
  approvedItemDiscounts?: Record<string, number>;
  /** Desconto de item pedido em reais, por chave `eventoId-itemId`. */
  approvedItemDiscountAmounts?: Record<string, number>;
  /** Quando `true`, o orçamento salvo é bloqueado imediatamente (isLocked: true). */
  forceRelock?: boolean;
}): SummaryBudgetDataPayload {
  const {
    formValues,
    isEditing,
    budgetId,
    existingBudget,
    originalCreator,
    status,
    observation,
    totalFinal,
    subtotal,
    deficit,
    allBudgets = [],
    approvedItemDiscounts,
    approvedItemDiscountAmounts,
    forceRelock = false,
  } = args;

  const finalParentId = isEditing ? (existingBudget?.parentId || existingBudget?.id) : undefined;
  let nextVersion = 1;
  const existingSchemaVersion = Number(
    formValues.schemaVersion ??
      (existingBudget?.data as { schemaVersion?: number } | undefined)?.schemaVersion ??
      1,
  );
  const targetSchemaVersion = isEditing
    ? (existingSchemaVersion >= 2 ? 2 : 1)
    : 2;

  if (isEditing) {
    const cousins = allBudgets.filter(b =>
      (b.id === finalParentId) || (b.parentId === finalParentId)
    );
    const maxVersion = cousins.reduce((max, curr) => Math.max(max, curr.version || 1), 1);
    nextVersion = maxVersion + 1;
  }

  const normalizedCustomItems = normalizeCustomItems(formValues.customItems);

  // O que mudou nesta versão em relação à anterior: alimenta a tag "alterado"
  // no item e o modal de histórico (antes -> depois).
  const itemChanges = isEditing
    ? diffBudgetItems({
        previousItems: (existingBudget?.data as { items?: Record<string, Record<string, unknown>> } | undefined)?.items,
        nextItems: formValues.items as Record<string, Record<string, unknown>> | undefined,
        source: "EDIT",
      })
    : {};

  const dataWithVersioning = {
    ...formValues,
    ...(normalizedCustomItems ? { customItems: normalizedCustomItems } : {}),
    id: isEditing ? budgetId : undefined,
    parentId: finalParentId,
    version: nextVersion,
    schemaVersion: targetSchemaVersion,
    itemChanges,
  };

  const normalizedData = adaptBudgetStoredFormData(dataWithVersioning) ?? dataWithVersioning;

  return {
    id: isEditing ? budgetId : undefined,
    instituicao: formValues.instituicao,
    curso: formValues.curso,
    comissao: formValues.comissao,
    telefone: formValues.telefone,
    controle: formValues.controle,
    createdAt: isEditing
      ? existingBudget?.createdAt || new Date().toISOString()
      : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status,
    observation,
    createdBy: originalCreator,
    createdByName: originalCreator,
    isLocked: forceRelock,
    totalValue: totalFinal,
    originalTotalValue: subtotal,
    deficitValue: deficit,
    data: normalizedData,
    // As colunas de desconto geral acompanham o que está no formulário: um
    // desconto fixo precisa do valor em reais para nao ser recalculado como
    // percentual quando o orçamento mudar de tamanho.
    discountPercent: Number(formValues.discountPercent) || 0,
    discountMode: formValues.discountMode,
    discountAmount: Number(formValues.discountAmount) || 0,
    approvedItemDiscounts: approvedItemDiscounts ?? existingBudget?.approvedItemDiscounts ?? {},
    approvedItemDiscountAmounts:
      approvedItemDiscountAmounts ?? existingBudget?.approvedItemDiscountAmounts ?? {},
    budgetCode: isEditing ? existingBudget?.budgetCode : undefined,
  };
}
