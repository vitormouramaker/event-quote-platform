import type { QuantityRule } from "../data/runtimeBudgetRules";
import { getParticipationQuantity } from "../data/runtimeBudgetRules";
import { SPECIAL_EVENT_FALLBACK_CONFIGS } from "./specialEventFallbackConfig";
import {
  getPresentationItemQuantity,
  getPresentationItemUnitPrice,
} from "./budgetPresentationRules";
import type { ItemVariationDto } from "../../../services/api";
import {
  resolveItemDiscountPercent,
  type ItemDiscountRequestLike,
} from "./discountInput";

type DiscountSummaryCustomAddedItem = {
  id?: string;
  name?: string;
  quantity?: unknown;
  unitPrice?: unknown;
  isNoFixedValue?: boolean;
};

type DiscountSummaryCustomItems = Record<
  string,
  {
    added?: DiscountSummaryCustomAddedItem[];
    removedIds?: string[];
  }
>;

type DiscountSummaryFormValues = {
  items?: Record<string, Record<string, unknown>>;
  customItems?: DiscountSummaryCustomItems;
  [key: string]: unknown;
};

type DiscountSummaryEventItem = {
  id: string;
  name: string;
  unitPrice?: number;
  fixedQty?: number;
  displayValue?: string;
  dynamicByStudents?: boolean;
  quantityRule?: QuantityRule;
  hasAdditional?: boolean;
  additionalQuantity?: number;
  hasMultiplier?: boolean;
  multiplierQuantity?: number;
  variations?: ItemVariationDto[];
};

type DiscountSummaryEvent = {
  id: string;
  items: DiscountSummaryEventItem[];
  hasAdministration?: boolean;
  has_administration?: boolean;
};

export type ApprovedItemDiscountRequestLike = {
  id: string;
  eventId: string;
  itemId: string;
  itemName: string;
  requestedPercentage: number;
  newDiscountPercent?: number;
  /** "FIXED" quando o desconto do item foi pedido em reais. */
  discountMode?: string;
  requestedAmount?: number;
  newDiscountAmount?: number;
  originalUnitPrice: number;
  status: string;
};

export type ApprovedItemDiscountDetail = ApprovedItemDiscountRequestLike & {
  appliedPercentage: number;
  baseAmount: number;
  discountAmount: number;
  finalAmount: number;
  isCustomAdded: boolean;
  administrationImpactAmount: number;
  totalImpactAmount: number;
};

function toNumber(value: unknown) {
  return Number(value) || 0;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function findCustomAddedItem(
  formValues: DiscountSummaryFormValues,
  eventId: string,
  itemId: string,
) {
  const addedItems = formValues.customItems?.[eventId]?.added ?? [];
  return addedItems.find((item, index) => (item.id || `added_${index}`) === itemId);
}

function findCatalogItem(
  budgetEvents: DiscountSummaryEvent[],
  eventId: string,
  itemId: string,
) {
  return budgetEvents.find((event) => event.id === eventId)?.items.find((item) => item.id === itemId);
}

function getEventAdministrationRate(
  budgetEvents: DiscountSummaryEvent[],
  eventId: string,
) {
  const configuredTaxRate = SPECIAL_EVENT_FALLBACK_CONFIGS[eventId]?.taxRate;
  if (typeof configuredTaxRate === "number") return configuredTaxRate;

  const event = budgetEvents.find((entry) => entry.id === eventId);
  return event?.hasAdministration || event?.has_administration ? 0.1 : 0;
}

function getRequestBaseAmount(
  formValues: DiscountSummaryFormValues,
  budgetEvents: DiscountSummaryEvent[],
  request: ApprovedItemDiscountRequestLike,
) {
  const customAddedItem = findCustomAddedItem(formValues, request.eventId, request.itemId);
  if (customAddedItem) {
    if (customAddedItem.isNoFixedValue) return 0;
    return roundCurrency(toNumber(customAddedItem.quantity) * toNumber(customAddedItem.unitPrice));
  }

  const catalogItem = findCatalogItem(budgetEvents, request.eventId, request.itemId);
  if (!catalogItem) {
    return roundCurrency(toNumber(request.originalUnitPrice));
  }

  if (catalogItem.displayValue) return 0;

  const removedIds = formValues.customItems?.[request.eventId]?.removedIds ?? [];
  if (removedIds.includes(request.itemId)) return 0;

  const eventItems = (formValues.items?.[request.eventId] ?? {}) as Record<string, unknown>;
  const participants = getParticipationQuantity(
    formValues as Record<string, unknown>,
    request.eventId,
    0,
  );
  const quantity = getPresentationItemQuantity(
    request.eventId,
    catalogItem,
    eventItems,
    participants,
  );
  const unitPrice = getPresentationItemUnitPrice(catalogItem, eventItems);
  return roundCurrency(quantity * unitPrice);
}

/**
 * Percentual que vale para o item, sobre `base`.
 *
 * `base` existe por causa do desconto em reais: ele só virou percentual
 * quando se sabe sobre quanto incide. Em desconto percentual a base é
 * ignorada, e por isso quem só lida com percentual pode omiti-la.
 */
export function getAppliedItemDiscountPercentage(
  request: ItemDiscountRequestLike,
  base = 0,
) {
  return resolveItemDiscountPercent(base, request);
}

export function buildApprovedItemDiscountDetails(
  formValues: DiscountSummaryFormValues,
  budgetEvents: DiscountSummaryEvent[],
  requests: ApprovedItemDiscountRequestLike[],
): ApprovedItemDiscountDetail[] {
  return requests
    .map((request) => {
      const isCustomAdded = Boolean(
        findCustomAddedItem(formValues, request.eventId, request.itemId),
      );
      const baseAmount = getRequestBaseAmount(formValues, budgetEvents, request);
      // A base vem antes do percentual: num desconto em reais é ela que define
      // o percentual equivalente.
      const appliedPercentage = getAppliedItemDiscountPercentage(request, baseAmount);
      const discountAmount = roundCurrency(baseAmount * (appliedPercentage / 100));
      const administrationImpactAmount = isCustomAdded
        ? roundCurrency(discountAmount * getEventAdministrationRate(budgetEvents, request.eventId))
        : 0;
      return {
        ...request,
        appliedPercentage,
        baseAmount,
        discountAmount,
        finalAmount: roundCurrency(baseAmount - discountAmount),
        isCustomAdded,
        administrationImpactAmount,
        totalImpactAmount: roundCurrency(discountAmount + administrationImpactAmount),
      };
    })
    .filter((request) => request.appliedPercentage > 0 && request.baseAmount > 0);
}

export function buildApprovedItemRequestsFromDiscountMap(
  formValues: DiscountSummaryFormValues,
  budgetEvents: DiscountSummaryEvent[],
  approvedItemDiscounts: Record<string, number> | undefined,
  approvedItemDiscountAmounts?: Record<string, number>,
): ApprovedItemDiscountRequestLike[] {
  if (!approvedItemDiscounts) return [];

  return Object.entries(approvedItemDiscounts).flatMap(([compositeKey, percentage]) => {
    const separatorIndex = compositeKey.indexOf("-");
    if (separatorIndex <= 0) return [];

    const eventId = compositeKey.slice(0, separatorIndex);
    const itemId = compositeKey.slice(separatorIndex + 1);
    const customAddedItem = findCustomAddedItem(formValues, eventId, itemId);
    const catalogItem = findCatalogItem(budgetEvents, eventId, itemId);
    const amount = approvedItemDiscountAmounts?.[compositeKey];

    return [
      {
        id: compositeKey,
        eventId,
        itemId,
        itemName: customAddedItem?.name || catalogItem?.name || itemId,
        requestedPercentage: toNumber(percentage),
        // O valor em reais, quando existe, manda: o percentual gravado é o
        // equivalente da última vez que o orçamento foi salvo.
        discountMode: amount ? "FIXED" : "PERCENT",
        requestedAmount: toNumber(amount),
        originalUnitPrice: 0,
        status: "APPROVED",
      },
    ];
  });
}
