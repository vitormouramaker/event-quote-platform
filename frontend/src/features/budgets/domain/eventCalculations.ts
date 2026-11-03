import {
  getEventParticipationFieldMap,
  resolveRuleQuantity,
  type QuantityRule,
} from "../data/runtimeBudgetRules";
import {
  SPECIAL_EVENT_FALLBACK_CONFIGS,
  type SpecialEventFallbackConfig,
  type SpecialEventQtyRule,
} from "./specialEventFallbackConfig";
import { tryCalculateCanonicalEventTotals } from "./canonicalEventCalculations";
import { getResolvedAuditoriumPrice, isAuditoriumItemByIdOrName } from "./budgetUiRules";
import {
  getVariationDrivenQuantity,
  getVariationDrivenUnitPrice,
} from "./itemVariations";
import type { ItemVariationDto } from "../../../services/api";
import { resolveItemDiscountPercent } from "./discountInput";

type Primitive = string | number | boolean | null | undefined;

type ItemInputMap = Record<string, Primitive>;
type FormItemsState = Record<string, ItemInputMap>;

type CustomAddedItem = {
  id?: string;
  quantity?: Primitive;
  unitPrice?: Primitive;
  isNoFixedValue?: boolean;
};

type CustomItemsEntry = {
  added?: CustomAddedItem[];
  removedIds?: string[];
};

type CustomItemsState = Record<string, CustomItemsEntry>;

type ApprovedItemRequestLike = {
  eventId: string;
  itemId: string;
  status: string;
  requestedPercentage?: Primitive;
  newDiscountPercent?: Primitive;
  /** "FIXED" quando o desconto do item foi pedido em reais. */
  discountMode?: Primitive;
  requestedAmount?: Primitive;
  newDiscountAmount?: Primitive;
};

type BudgetItemRequestsMap = Record<string, ApprovedItemRequestLike[]>;

export type CalcFormValues = {
  id?: string;
  items?: FormItemsState;
  customItems?: CustomItemsState;
  studentsQuantity?: number;
  participation_descerramento?: number;
  participation_aula_saudade?: number;
  participation_missa?: number;
  participation_colacao_descerramento?: number;
  participation_colacao?: number;
  participation_festa50?: number;
  participation_ensaio?: number;
  participation_ensaio_50?: number;
  participation_ensaio_365?: number;
  participation_evento_100?: number;
  [key: string]: unknown;
};

type CalculationEventItem = {
  id: string;
  name?: string;
  unitPrice?: number;
  fixedQty?: number;
  defaultQuantity?: number;
  displayValue?: string;
  quantityEditable?: boolean;
  priceEditable?: boolean;
  dynamicByStudents?: boolean;
  quantityRule?: QuantityRule;
  hasAdditional?: boolean;
  additionalQuantity?: number;
  hasMultiplier?: boolean;
  multiplierQuantity?: number;
  variations?: ItemVariationDto[];
};

type CalculationEvent = {
  id: string;
  items: CalculationEventItem[];
  eventValue?: number | null;
  value?: number | null;
  hasAdministration?: boolean;
  has_administration?: boolean;
};

type EventTotals = {
  total: number;
  discountedTotal: number;
};

type CalcMode = "items-step" | "summary-step";

type CalcContext = {
  formValues: CalcFormValues;
  budgetRequests: ApprovedItemRequestLike[];
  eventId: string;
  removedIds: string[];
  addedItems: CustomAddedItem[];
  addedVal: number;
  isActive: (id: string) => 0 | 1;
};

const ITEMS_STEP_GENERIC_TAX_EVENTS = ["aula_saudade", "missa_culto", "festa_365", "cobertura_fotografica"];
const SUMMARY_STEP_GENERIC_TAX_EVENTS = [
  "descerramento_placa",
  "aula_saudade",
  "missa_culto",
  "colacao_descerramento",
  "cerimonia_colacao",
  "ensaio_fotografico",
  "ensaio_50",
  "ensaio_365",
  "festa_365",
  "festa_50",
  "cobertura_fotografica",
];
const COURTESY_EVENT_IDS = new Set(["culto_cortesia", "evento_100_dias"]);

function getBudgetItemRequests(
  itemRequests: BudgetItemRequestsMap | undefined,
  formValues: CalcFormValues,
) {
  return itemRequests?.[formValues.id || "temp-budget"] || [];
}

function toNumber(value: unknown) {
  return Number(value) || 0;
}

function getCustomItemsState(formValues: CalcFormValues, customItems?: CustomItemsState) {
  return customItems ?? formValues.customItems ?? {};
}

function buildCalcContext(
  event: CalculationEvent,
  formValues: CalcFormValues,
  itemRequests: BudgetItemRequestsMap,
  customItems?: CustomItemsState,
): CalcContext {
  const customItemsState = getCustomItemsState(formValues, customItems);
  const removedIds = customItemsState[event.id]?.removedIds || [];
  const addedItems = customItemsState[event.id]?.added || [];
  const addedVal = addedItems.reduce(
    (acc: number, item: CustomAddedItem) =>
      acc + (item.isNoFixedValue ? 0 : toNumber(item.quantity) * toNumber(item.unitPrice)),
    0,
  );

  return {
    formValues,
    budgetRequests: getBudgetItemRequests(itemRequests, formValues),
    eventId: event.id,
    removedIds,
    addedItems,
    addedVal,
    isActive: (id: string) => (!removedIds.includes(id) ? 1 : 0),
  };
}

/**
 * Percentual de desconto aprovado para o item, sobre `base`.
 *
 * A base entra na conta porque um desconto pedido em reais vira percentual
 * aqui, contra o valor atual do item — e não um percentual congelado na hora
 * do pedido, que deixaria de valer os reais pedidos se a quantidade mudasse.
 */
function approvedItemDiscountPercent(ctx: CalcContext, itemId: string, base: number) {
  const req = ctx.budgetRequests.find(
    (r) => r.eventId === ctx.eventId && r.itemId === itemId && r.status === "APPROVED",
  );
  return resolveItemDiscountPercent(base, req);
}

function getCustomAddedTotals(ctx: CalcContext) {
  return ctx.addedItems.reduce(
    (acc, item, index) => {
      const total = item.isNoFixedValue ? 0 : toNumber(item.quantity) * toNumber(item.unitPrice);
      const itemId = item.id || `added_${index}`;
      const discountPct = approvedItemDiscountPercent(ctx, itemId, total);
      const discountedTotal = total - total * (discountPct / 100);

      return {
        total: acc.total + total,
        discountedTotal: acc.discountedTotal + discountedTotal,
      };
    },
    { total: 0, discountedTotal: 0 },
  );
}

function itemInput(formValues: CalcFormValues, eventId: string, key: string, fallback: number): number {
  return toNumber(formValues.items?.[eventId]?.[key] ?? fallback);
}

function getEventParticipationQty(formValues: CalcFormValues, eventId: string): number {
  const participationField = getEventParticipationFieldMap()[eventId] ?? `participation_${eventId}`;
  return toNumber(formValues[participationField]) || toNumber(formValues.studentsQuantity) || 1;
}

function getGenericDefaultQty(
  ctx: CalcContext,
  item: CalculationEventItem,
  itemValues: Record<string, unknown>,
): number {
  const additional =
    item.hasAdditional && Number.isFinite(Number(item.additionalQuantity))
      ? Math.max(0, Math.floor(Number(item.additionalQuantity)))
      : 0;
  const multiplier =
    item.hasMultiplier && Number.isFinite(Number(item.multiplierQuantity)) && Number(item.multiplierQuantity) > 0
      ? Math.floor(Number(item.multiplierQuantity))
      : 1;
  const apply = (base: number) => base * multiplier + additional;

  if (item.quantityRule) {
    return apply(resolveRuleQuantity(getEventParticipationQty(ctx.formValues, ctx.eventId), item.quantityRule));
  }

  if (item.dynamicByStudents) {
    return apply(getEventParticipationQty(ctx.formValues, ctx.eventId));
  }

  if (item.fixedQty !== undefined) return apply(item.fixedQty);

  return apply(getVariationDrivenQuantity(item, itemValues, item.defaultQuantity ?? 1));
}

function eventTotalPair(total: number, discountedTotal = total): EventTotals {
  return { total, discountedTotal };
}

function resolveSpecialEventQty(
  formValues: CalcFormValues,
  currentEventId: string,
  qtyRule: SpecialEventQtyRule,
) {
  if (qtyRule.mode === "fixed") return qtyRule.value;

  const sourceParticipation = qtyRule.sourceEventId
    ? getEventParticipationQty(formValues, qtyRule.sourceEventId)
    : getEventParticipationQty(formValues, currentEventId);
  const baseParticipation =
    sourceParticipation ||
    (qtyRule.fallbackToCurrentEvent ? getEventParticipationQty(formValues, currentEventId) : 0) ||
    1;

  return baseParticipation * (qtyRule.multiplier ?? 1) + (qtyRule.add ?? 0);
}

function computeConfiguredSpecialEventTotals(
  ctx: CalcContext,
  mode: CalcMode,
  config: SpecialEventFallbackConfig,
): EventTotals {
  const { formValues, eventId, isActive } = ctx;
  const customAddedTotals = getCustomAddedTotals(ctx);
  const itemTotals = config.items.map((item) => {
    const qtyDefault = resolveSpecialEventQty(formValues, eventId, item.qtyRule);
    const qty = itemInput(formValues, eventId, item.itemId, qtyDefault);
    const unitPrice = itemInput(formValues, eventId, `${item.itemId}_price`, item.defaultPrice);
    const discountPct =
      mode === "summary-step" && item.allowSummaryDiscount
        ? approvedItemDiscountPercent(ctx, item.itemId, qty * unitPrice)
        : 0;
    const discountedUnitPrice = unitPrice - unitPrice * (discountPct / 100);

    return {
      total: qty * unitPrice * isActive(item.itemId),
      discountedTotal: qty * discountedUnitPrice * isActive(item.itemId),
    };
  });

  const itemsTotal = itemTotals.reduce((acc, item) => acc + item.total, 0);
  const discountedItemsTotal = itemTotals.reduce((acc, item) => acc + item.discountedTotal, 0);
  const fixedAmountsTotal = (config.fixedAmounts ?? []).reduce((acc, value) => acc + value, 0);
  const subtotalMultiplier = config.subtotalMultiplier ?? 1;
  const taxRate = config.taxRate ?? 0;
  const subtotalStd = itemsTotal * subtotalMultiplier + fixedAmountsTotal;
  const subtotalStdWithCustom = subtotalStd + customAddedTotals.total;
  const itemDiscountValue = (itemsTotal - discountedItemsTotal) * subtotalMultiplier;
  const totalStd = subtotalStdWithCustom + subtotalStdWithCustom * taxRate;
  const customAddedDiscountImpact =
    (customAddedTotals.total - customAddedTotals.discountedTotal) * (1 + taxRate);
  const totalDisc = totalStd - itemDiscountValue - customAddedDiscountImpact;

  return eventTotalPair(
    totalStd,
    totalDisc,
  );
}

// Dynamic auditorium logic: Platina if ALL dynamic qty fields > 25
export function shouldUsePlatinaCalc(
  formValues: CalcFormValues,
  eventId: string,
  removedIds: string[],
): boolean {
  const dynamicFields: { field: string; participationKey: keyof CalcFormValues }[] =
    eventId === "colacao_descerramento"
      ? [
          { field: "replica_placa_col", participationKey: "participation_colacao_descerramento" },
          { field: "becas_formandos_col", participationKey: "participation_colacao_descerramento" },
          { field: "canudos_col", participationKey: "participation_colacao_descerramento" },
          { field: "arquibancada_col", participationKey: "participation_colacao_descerramento" },
          { field: "painel_led_col", participationKey: "participation_colacao_descerramento" },
        ]
      : eventId === "cerimonia_colacao"
        ? [
            { field: "becas_formandos_cerimonia", participationKey: "participation_colacao" },
            { field: "canudos_cerimonia", participationKey: "participation_colacao" },
            { field: "arquibancada_cerimonia", participationKey: "participation_colacao" },
            { field: "placa_led_cerimonia", participationKey: "participation_colacao" },
          ]
        : [];

  if (dynamicFields.length === 0) return false;

  return dynamicFields.every(({ field, participationKey }) => {
    if (removedIds.includes(field)) return true;
    const defaultQty = toNumber(formValues[participationKey]) || toNumber(formValues.studentsQuantity) || 1;
    const currentQty = toNumber(formValues.items?.[eventId]?.[field] ?? defaultQty);
    return currentQty > 25;
  });
}

function specialEventTotals(ctx: CalcContext, mode: CalcMode): EventTotals | null {
  const config = SPECIAL_EVENT_FALLBACK_CONFIGS[ctx.eventId];
  return config ? computeConfiguredSpecialEventTotals(ctx, mode, config) : null;
}

function computeGenericTotals(event: CalculationEvent, ctx: CalcContext, taxEvents: string[]): EventTotals {
  let subTotalStd = 0;
  let subTotalDisc = 0;
  const eventInputs = (ctx.formValues.items?.[event.id] ?? {}) as Record<string, unknown>;
  const customAddedTotals = getCustomAddedTotals(ctx);

  event.items.forEach((item) => {
    if (ctx.removedIds.includes(item.id)) return;
    if (item.displayValue) return;

    const defaultQty = getGenericDefaultQty(ctx, item, eventInputs);
    let qty = toNumber(eventInputs[item.id] ?? defaultQty);
    let unitPriceStd = getVariationDrivenUnitPrice(item, eventInputs, item.unitPrice || 0);
    let unitPriceDisc = unitPriceStd;

    if (isAuditoriumItemByIdOrName(item.id, item.name)) {
      qty = 1;
      unitPriceStd = getResolvedAuditoriumPrice(item.id, eventInputs);
      unitPriceDisc = unitPriceStd;
    }

    const editedPrice = eventInputs[`${item.id}_price`];
    if (editedPrice !== undefined && editedPrice !== null && editedPrice !== "") {
      unitPriceStd = toNumber(editedPrice);
      unitPriceDisc = toNumber(editedPrice);
    }

    const discountPct = approvedItemDiscountPercent(ctx, item.id, qty * unitPriceStd);
    if (discountPct > 0) {
      unitPriceDisc = unitPriceStd - unitPriceStd * (discountPct / 100);
    }

    subTotalStd += qty * unitPriceStd;
    subTotalDisc += qty * unitPriceDisc;
  });

  const fixedEventValue = Number(event.eventValue ?? event.value) || 0;
  let totalStd = subTotalStd + customAddedTotals.total + fixedEventValue;
  const itemDiscountValue = subTotalStd - subTotalDisc;
  const hasAdmin = event.hasAdministration ?? event.has_administration ?? false;
  const customAddedDiscountImpact =
    (customAddedTotals.total - customAddedTotals.discountedTotal) * (hasAdmin || taxEvents.includes(event.id) ? 1.1 : 1);

  if (taxEvents.includes(event.id) || hasAdmin) {
    totalStd += totalStd * 0.1;
  }

  const totalDisc = totalStd - itemDiscountValue - customAddedDiscountImpact;

  return eventTotalPair(totalStd, totalDisc);
}

export function calculateItemsStepEventTotal(
  event: CalculationEvent,
  formValues: CalcFormValues,
  customItems: CustomItemsState,
  itemRequests: BudgetItemRequestsMap,
) {
  if (COURTESY_EVENT_IDS.has(event.id)) return 0;

  const canonical = tryCalculateCanonicalEventTotals(event, formValues, customItems, itemRequests);
  if (canonical) {
    return canonical.discountedTotal;
  }

  const ctx = buildCalcContext(event, formValues, itemRequests, customItems);
  const special = specialEventTotals(ctx, "items-step");
  if (special) {
    return special.discountedTotal;
  }

  const generic = computeGenericTotals(event, ctx, ITEMS_STEP_GENERIC_TAX_EVENTS);
  return generic.discountedTotal;
}

export function calculateSummaryStepEventTotals(
  event: CalculationEvent,
  formValues: CalcFormValues,
  itemRequests: BudgetItemRequestsMap,
) {
  if (COURTESY_EVENT_IDS.has(event.id)) return { total: 0, discountedTotal: 0 };

  const canonical = tryCalculateCanonicalEventTotals(event, formValues, undefined, itemRequests);
  if (canonical) {
    return canonical;
  }

  const ctx = buildCalcContext(event, formValues, itemRequests);
  const special = specialEventTotals(ctx, "summary-step");
  if (special) {
    return special;
  }

  return computeGenericTotals(event, ctx, SUMMARY_STEP_GENERIC_TAX_EVENTS);
}
