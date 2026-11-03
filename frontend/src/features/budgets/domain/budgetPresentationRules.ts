import type { QuantityRule } from "../data/runtimeBudgetRules";
import { resolveRuleQuantity } from "../data/runtimeBudgetRules";
import {
  getResolvedAuditoriumPrice,
  is100DaysOpenBarItem,
  isAuditoriumItem,
  isParticipationLinkedIncludedItem,
} from "./budgetUiRules";
import {
  getVariationDrivenQuantity,
  getVariationDrivenUnitPrice,
} from "./itemVariations";
import type { ItemVariationDto } from "../../../services/api";

type PresentationBudgetItem = {
  id: string;
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

function toNumber(value: unknown) {
  return Number(value) || 0;
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

export function getPresentationItemQuantity(
  eventId: string,
  item: PresentationBudgetItem,
  itemValues: Record<string, unknown>,
  participants: number,
) {
  const rawQty = itemValues[item.id];
  const additional =
    item.hasAdditional && Number.isFinite(Number(item.additionalQuantity))
      ? Math.max(0, Math.floor(Number(item.additionalQuantity)))
      : 0;
  const multiplier =
    item.hasMultiplier && Number.isFinite(Number(item.multiplierQuantity)) && Number(item.multiplierQuantity) > 0
      ? Math.floor(Number(item.multiplierQuantity))
      : 1;
  const apply = (base: number) => base * multiplier + additional;

  if (item.fixedQty !== undefined) return apply(item.fixedQty);
  if (hasValue(rawQty)) return toNumber(rawQty);
  if (item.quantityRule)
    return apply(resolveRuleQuantity(participants || 1, item.quantityRule));
  if (isAuditoriumItem(item.id)) return 1;
  if (is100DaysOpenBarItem(eventId, item.id)) return apply(participants);
  if (item.dynamicByStudents) return apply(participants || 1);
  if (item.displayValue && participants > 0 && isParticipationLinkedIncludedItem(item.id)) {
    return apply(participants);
  }

  return apply(getVariationDrivenQuantity(item, itemValues, 1));
}

export function getPresentationItemUnitPrice(
  item: PresentationBudgetItem,
  itemValues: Record<string, unknown>,
) {
  const rawEditedPrice = itemValues[`${item.id}_price`];

  if (hasValue(rawEditedPrice)) {
    return toNumber(rawEditedPrice);
  }

  if (isAuditoriumItem(item.id)) {
    return getResolvedAuditoriumPrice(item.id, itemValues);
  }

  return getVariationDrivenUnitPrice(item, itemValues, toNumber(item.unitPrice));
}
