import type { Budget, BudgetSavePayload } from "../../../store/budgetStore";
import type { BudgetCatalogEvent } from "../../budgets/data/budgetCatalog";
import { computeBudgetSummaryTotals } from "../../budgets/domain/budgetTotals";
import { diffBudgetItems } from "../../budgets/domain/budgetItemChanges";

/** Uma alteração feita pelo usuário dentro do anexo contratual. */
export type AnnexItemEdit = {
  eventId: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
};

/** Marcações gravadas no orçamento: quais itens vieram de edição no anexo. */
export type AnnexEditMarks = Record<string, Record<string, true>>;

export function getAnnexEditMarks(budget: Budget | undefined): AnnexEditMarks {
  const raw = (budget?.data as { annexEdits?: AnnexEditMarks } | undefined)?.annexEdits;
  return raw && typeof raw === "object" ? raw : {};
}

export function isItemEditedByAnnex(
  budget: Budget | undefined,
  eventId: string,
  itemId: string,
): boolean {
  return Boolean(getAnnexEditMarks(budget)[eventId]?.[itemId]);
}

export function wasEditedByAnnex(budget: Budget | undefined): boolean {
  return Boolean((budget?.data as { editedViaAnnex?: boolean } | undefined)?.editedViaAnnex);
}

/**
 * Monta a NOVA VERSÃO do orçamento com as alterações feitas no anexo.
 *
 * Editar o anexo não mexe na versão aprovada: segue a regra de versionamento do
 * sistema (original imutável, edição cria v(N+1)). A nova versão nasce marcada
 * — no orçamento e em cada item alterado — para deixar claro que veio do anexo.
 */
export function buildBudgetVersionFromAnnexEdits(args: {
  budget: Budget;
  edits: AnnexItemEdit[];
  allBudgets: Budget[];
  budgetEvents: BudgetCatalogEvent[];
}): BudgetSavePayload {
  const { budget, edits, allBudgets, budgetEvents } = args;

  const baseData = { ...(budget.data ?? {}) } as Record<string, unknown>;
  const items = { ...((baseData.items as Record<string, Record<string, unknown>>) ?? {}) };
  const marks: AnnexEditMarks = { ...getAnnexEditMarks(budget) };

  for (const edit of edits) {
    const eventItems = { ...(items[edit.eventId] ?? {}) };
    eventItems[edit.itemId] = edit.quantity;
    eventItems[`${edit.itemId}_price`] = edit.unitPrice;
    // Preço mexido à mão não pode ser sobrescrito pelos defaults automáticos.
    eventItems[`${edit.itemId}_price_manual`] = true;
    items[edit.eventId] = eventItems;

    marks[edit.eventId] = { ...(marks[edit.eventId] ?? {}), [edit.itemId]: true };
  }

  // Versionamento: pendura na mesma família e incrementa a partir da maior versão.
  const familyId = budget.parentId || budget.id;
  const family = allBudgets.filter((b) => b.id === familyId || b.parentId === familyId);
  const nextVersion = family.reduce((max, b) => Math.max(max, b.version || 1), 1) + 1;

  // Antes -> depois de cada item tocado pelo anexo, para a tag "alterado".
  const itemChanges = diffBudgetItems({
    previousItems: (baseData.items as Record<string, Record<string, unknown>>) ?? {},
    nextItems: items,
    source: "ANNEX",
  });

  const nextData = {
    ...baseData,
    items,
    annexEdits: marks,
    editedViaAnnex: true,
    itemChanges,
    parentId: familyId,
    version: nextVersion,
  };

  const totals = computeBudgetSummaryTotals(
    { ...budget, data: nextData as Budget["data"] },
    budgetEvents,
  );

  return {
    instituicao: budget.instituicao,
    curso: budget.curso,
    comissao: budget.comissao,
    telefone: budget.telefone,
    controle: budget.controle,
    observation: budget.observation,
    status: budget.status,
    // Versão gerada pelo anexo nasce travada, como o aprovado de origem.
    isLocked: true,
    createdByName: budget.createdByName || budget.createdBy,
    budgetCode: budget.budgetCode,
    totalValue: totals.totalDiscounted,
    originalTotalValue: totals.subtotal,
    deficitValue: totals.deficit,
    discountPercent: budget.discountPercent,
    // Sem o modo e o valor, um desconto pedido em reais voltaria a ser lido
    // como percentual na versao gerada pelo anexo.
    discountMode: budget.discountMode,
    discountAmount: budget.discountAmount,
    approvedItemDiscounts: budget.approvedItemDiscounts ?? {},
    approvedItemDiscountAmounts: budget.approvedItemDiscountAmounts ?? {},
    data: nextData,
  };
}
