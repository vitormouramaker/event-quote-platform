import { getEventParticipationFieldMap } from "../data/runtimeBudgetRules";
import { getRuntimeLegacyAliases } from "./canonicalRuntimeConfig";

type Primitive = string | number | boolean | null | undefined;
type ItemValueMap = Record<string, Primitive>;

export interface CanonicalBudgetItemSnapshot {
  legacyItemId: string;
  canonicalItemSlug: string;
  quantityField: string;
  priceField: string | null;
  quantity: number | null;
  unitPrice: number | null;
  rawValue: Primitive;
  rawPriceValue: Primitive;
}

export interface CanonicalBudgetEventSnapshot {
  legacyEventId: string;
  canonicalEventSlug: string;
  participationField: string;
  participationQty: number;
  items: CanonicalBudgetItemSnapshot[];
}

export interface BudgetCanonicalSnapshot {
  schemaVersion: 1 | 2;
  source: "legacy" | "dynamic";
  selectedEventSlugs: string[];
  participantsByEvent: Record<string, number>;
  eventAliases: Record<string, string>;
  itemAliases: Record<string, Record<string, string>>;
  events: CanonicalBudgetEventSnapshot[];
}

export interface AdaptedBudgetStoredFormData extends Record<string, unknown> {
  schemaVersion?: number;
  selectedEvents?: string[];
  items?: Record<string, ItemValueMap>;
  studentsQuantity?: number;
  canonicalSnapshot?: BudgetCanonicalSnapshot;
}

function getEventAliasMap() {
  return new Map(
    getRuntimeLegacyAliases()
    .filter((alias) => alias.alias_type === "event")
    .map((alias) => [alias.legacy_key, alias.canonical_slug]),
  );
}

function getItemAliasMap() {
  return new Map(
    getRuntimeLegacyAliases()
    .filter((alias) => alias.alias_type === "item")
    .map((alias) => [alias.legacy_key, alias.canonical_slug]),
  );
}

const PARTICIPATION_ALIAS_GROUPS = [
  ["participation_missa", "participation_missa_culto"],
  ["participation_festa_50", "participation_festa50"],
  ["participation_festa_365", "participation_festa365"],
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Normaliza o mapa `items`. Quando os ids de evento/item são numéricos (ex.:
 * `items.27.285_price`), o react-hook-form materializa `items` e cada evento
 * como ARRAY (índices numéricos), e não objeto. Isso causava dois bugs:
 *  - `isRecord(array) === false` zerava todos os itens no save (orçamento novo).
 *  - `JSON.stringify` de array descarta chaves string (`285_price`,
 *    `285_variation_label`), perdendo preço/variação no envio.
 * Aqui convertemos tudo para objeto plano, preservando TODAS as chaves
 * (índices numéricos + props string). Não afeta esquemas legados (já objetos).
 */
function normalizeItemsToPlainObject(items: unknown): Record<string, ItemValueMap> {
  if (!items || typeof items !== "object") return {};
  const out: Record<string, ItemValueMap> = {};
  Object.keys(items as Record<string, unknown>).forEach((eventId) => {
    const eventItems = (items as Record<string, unknown>)[eventId];
    if (!eventItems || typeof eventItems !== "object") return;
    const plain: ItemValueMap = {};
    Object.keys(eventItems as Record<string, unknown>).forEach((key) => {
      plain[key] = (eventItems as Record<string, Primitive>)[key];
    });
    out[eventId] = plain;
  });
  return out;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry)).filter(Boolean);
}

function normalizeParticipationAliases(target: Record<string, unknown>) {
  PARTICIPATION_ALIAS_GROUPS.forEach((keys) => {
    const resolved = keys
      .map((key) => toNumberOrNull(target[key]))
      .find((value) => value !== null);

    if (resolved === null || resolved === undefined) return;
    keys.forEach((key) => {
      target[key] = resolved;
    });
  });
}

function buildCanonicalSnapshot(data: AdaptedBudgetStoredFormData): BudgetCanonicalSnapshot {
  const eventAliasMap = getEventAliasMap();
  const itemAliasMap = getItemAliasMap();
  const participationFieldMap = getEventParticipationFieldMap();
  const source: "legacy" | "dynamic" = Number(data.schemaVersion ?? 1) >= 2 ? "dynamic" : "legacy";
  const selectedEvents = toStringArray(data.selectedEvents);
  const selectedEventSlugs = selectedEvents.map((eventId) => eventAliasMap.get(eventId) ?? eventId);
  const rawItems = isRecord(data.items) ? data.items : {};
  const allEventIds = Array.from(new Set([...selectedEvents, ...Object.keys(rawItems)]));
  const participantsByEvent: Record<string, number> = {};
  const eventAliases: Record<string, string> = {};
  const itemAliases: Record<string, Record<string, string>> = {};

  const events = allEventIds.map<CanonicalBudgetEventSnapshot>((legacyEventId) => {
    const canonicalEventSlug = eventAliasMap.get(legacyEventId) ?? legacyEventId;
    const participationField =
      participationFieldMap[legacyEventId] ??
      participationFieldMap[canonicalEventSlug] ??
      `participation_${legacyEventId}`;
    const participationQty =
      toNumberOrNull(data[participationField]) ??
      toNumberOrNull(data.studentsQuantity) ??
      0;

    participantsByEvent[canonicalEventSlug] = participationQty;
    eventAliases[legacyEventId] = canonicalEventSlug;

    const eventItems = isRecord(rawItems[legacyEventId]) ? (rawItems[legacyEventId] as ItemValueMap) : {};
    const perEventItemAliases: Record<string, string> = {};
    const items = Object.entries(eventItems)
      // `_price` = preço pareado do item; `_price_manual` = flag de auditório
      // escolhido na mão. Nenhum dos dois é uma entrada de item.
      .filter(([fieldName]) => !fieldName.endsWith("_price") && !fieldName.endsWith("_price_manual"))
      .map<CanonicalBudgetItemSnapshot>(([legacyItemId, rawValue]) => {
        const canonicalItemSlug = itemAliasMap.get(legacyItemId) ?? legacyItemId;
        const priceField = Object.prototype.hasOwnProperty.call(eventItems, `${legacyItemId}_price`)
          ? `${legacyItemId}_price`
          : null;
        const rawPriceValue = priceField ? eventItems[priceField] : null;

        perEventItemAliases[legacyItemId] = canonicalItemSlug;

        return {
          legacyItemId,
          canonicalItemSlug,
          quantityField: legacyItemId,
          priceField,
          quantity: toNumberOrNull(rawValue),
          unitPrice: toNumberOrNull(rawPriceValue),
          rawValue,
          rawPriceValue,
        };
      });

    itemAliases[legacyEventId] = perEventItemAliases;

    return {
      legacyEventId,
      canonicalEventSlug,
      participationField,
      participationQty,
      items,
    };
  });

  return {
    schemaVersion: source === "dynamic" ? 2 : 1,
    source,
    selectedEventSlugs,
    participantsByEvent,
    eventAliases,
    itemAliases,
    events,
  };
}

export function adaptBudgetStoredFormData(input: unknown): AdaptedBudgetStoredFormData | undefined {
  if (!isRecord(input)) return undefined;

  const normalized: AdaptedBudgetStoredFormData = {
    ...input,
  };

  normalizeParticipationAliases(normalized);

  if (!Array.isArray(normalized.selectedEvents)) {
    normalized.selectedEvents = toStringArray(normalized.selectedEvents);
  }

  normalized.items = normalizeItemsToPlainObject(normalized.items);

  normalized.schemaVersion = Number(normalized.schemaVersion ?? 1) >= 2 ? 2 : 1;
  normalized.canonicalSnapshot = buildCanonicalSnapshot(normalized);

  return normalized;
}
