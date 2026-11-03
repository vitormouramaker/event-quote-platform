import type { Budget } from "../../../store/budgetStore";

/**
 * Registro do que mudou em um item de um evento entre uma versão do orçamento
 * e a anterior. É gravado dentro de `form_data.itemChanges` no momento em que a
 * nova versão nasce — tanto na edição normal quanto na edição via anexo — para
 * que a tag "alterado" possa mostrar o antes e o depois.
 */
export type BudgetItemChange = {
  quantityFrom?: number;
  quantityTo?: number;
  unitPriceFrom?: number;
  unitPriceTo?: number;
  source: "EDIT" | "ANNEX";
  at: string;
};

export type BudgetItemChangeLog = Record<
  string,
  Record<string, BudgetItemChange>
>;

/** Sufixos usados nas chaves auxiliares de `items[eventId]`. */
const KEY_SUFFIXES = ["_price_manual", "_price", "_variation"];

function isAuxKey(key: string) {
  return KEY_SUFFIXES.some((suffix) => key.endsWith(suffix));
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

type ItemsMap = Record<string, Record<string, unknown>>;

export function getBudgetItemChangeLog(
  budget: Budget | undefined,
): BudgetItemChangeLog {
  const raw = (budget?.data as { itemChanges?: BudgetItemChangeLog } | undefined)
    ?.itemChanges;
  return raw && typeof raw === "object" ? raw : {};
}

export function getBudgetItemChange(
  budget: Budget | undefined,
  eventId: string,
  itemId: string,
): BudgetItemChange | undefined {
  return getBudgetItemChangeLog(budget)[eventId]?.[itemId];
}

export function hasBudgetItemChanges(budget: Budget | undefined): boolean {
  const log = getBudgetItemChangeLog(budget);
  return Object.values(log).some((items) => Object.keys(items).length > 0);
}

/**
 * Compara os itens de duas versões e devolve só o que mudou (quantidade e/ou
 * preço unitário). Chaves auxiliares (`_price_manual`, `_variation`) não geram
 * entrada por si só — elas são detalhe de implementação, não alteração visível.
 */
export function diffBudgetItems(args: {
  previousItems: ItemsMap | undefined;
  nextItems: ItemsMap | undefined;
  source: BudgetItemChange["source"];
  at?: string;
}): BudgetItemChangeLog {
  const { previousItems = {}, nextItems = {}, source } = args;
  const at = args.at ?? new Date().toISOString();
  const log: BudgetItemChangeLog = {};

  const eventIds = new Set([
    ...Object.keys(previousItems),
    ...Object.keys(nextItems),
  ]);

  for (const eventId of eventIds) {
    const prev = previousItems[eventId] ?? {};
    const next = nextItems[eventId] ?? {};
    const itemIds = new Set(
      [...Object.keys(prev), ...Object.keys(next)].filter(
        (key) => !isAuxKey(key),
      ),
    );

    for (const itemId of itemIds) {
      const quantityFrom = toNumberOrUndefined(prev[itemId]);
      const quantityTo = toNumberOrUndefined(next[itemId]);
      const unitPriceFrom = toNumberOrUndefined(prev[`${itemId}_price`]);
      const unitPriceTo = toNumberOrUndefined(next[`${itemId}_price`]);

      const quantityChanged =
        quantityFrom !== quantityTo &&
        !(quantityFrom === undefined && quantityTo === undefined);
      const priceChanged =
        unitPriceFrom !== unitPriceTo &&
        !(unitPriceFrom === undefined && unitPriceTo === undefined);

      if (!quantityChanged && !priceChanged) continue;

      log[eventId] = log[eventId] ?? {};
      log[eventId][itemId] = {
        ...(quantityChanged ? { quantityFrom, quantityTo } : {}),
        ...(priceChanged ? { unitPriceFrom, unitPriceTo } : {}),
        source,
        at,
      };
    }
  }

  return log;
}
