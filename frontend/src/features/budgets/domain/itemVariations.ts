import type { ItemVariationDto } from "../../../services/api";

type VariationAwareItem = {
  id: string;
  name?: string;
  unitPrice?: number;
  defaultQuantity?: number;
  variations?: ItemVariationDto[] | null;
};

type ItemValues = Record<string, unknown>;

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

function toCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeVariationComparable(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function stripItemNameSuffix(name: string) {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function getAvailableItemVariations(item: VariationAwareItem): ItemVariationDto[] {
  return Array.isArray(item.variations)
    ? item.variations.filter((variation): variation is ItemVariationDto => {
        return Boolean(
          variation &&
            typeof variation.id === "string" &&
            variation.id.trim() &&
            typeof variation.name === "string" &&
            variation.name.trim(),
        );
      })
    : [];
}

export function getSelectedItemVariation(
  item: VariationAwareItem,
  itemValues: ItemValues,
): ItemVariationDto | null {
  const variations = getAvailableItemVariations(item);
  if (variations.length === 0) return null;

  const selectedVariationId = toCleanString(itemValues[`${item.id}_variation`]);
  return variations.find((variation) => variation.id === selectedVariationId) ?? variations[0];
}

export function getSelectedItemVariationLabel(
  item: VariationAwareItem,
  itemValues: ItemValues,
): string | undefined {
  const storedLabel = toCleanString(itemValues[`${item.id}_variation_label`]);
  if (storedLabel) return storedLabel;
  return getSelectedItemVariation(item, itemValues)?.name?.trim() || undefined;
}

export function getVariationDrivenUnitPrice(
  item: VariationAwareItem,
  itemValues: ItemValues,
  fallback: number,
): number {
  const resolvedFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  const variation = getSelectedItemVariation(item, itemValues);
  const parsed = Number(variation?.unit_price);
  return Number.isFinite(parsed) ? parsed : resolvedFallback;
}

export function getVariationDrivenQuantity(
  item: VariationAwareItem,
  itemValues: ItemValues,
  fallback: number,
): number {
  const resolvedFallback =
    Number.isFinite(Number(fallback)) && Number(fallback) > 0 ? Math.floor(Number(fallback)) : 1;
  const variation = getSelectedItemVariation(item, itemValues);
  const parsed = Number(variation?.default_quantity);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : resolvedFallback;
}

export function buildVariationAwareItemLabel(
  item: VariationAwareItem,
  itemValues: ItemValues,
): string {
  const baseName = stripItemNameSuffix(item.name ?? item.id);
  const variationLabel = getSelectedItemVariationLabel(item, itemValues);

  if (!variationLabel) return baseName;
  return `${baseName} (${variationLabel})`;
}

export function shouldSeedVariationDefaults(
  itemValues: ItemValues,
  itemId: string,
) {
  return {
    needsPrice: !hasValue(itemValues[`${itemId}_price`]),
    needsQuantity: !hasValue(itemValues[itemId]),
    needsVariationId: !hasValue(itemValues[`${itemId}_variation`]),
    needsVariationLabel: !hasValue(itemValues[`${itemId}_variation_label`]),
  };
}
