import { EVENT_TYPES } from "./mockData";
import {
  getRuntimeCanonicalEventTemplates,
  getRuntimeLegacyAliases,
  getRuntimeLegacyItemIdsByCanonicalSlug,
  resolveRuntimeCanonicalEventSlug,
  resolveRuntimeCanonicalItemSlug,
} from "../migration/canonicalRuntimeConfig";

export type QuantityRule =
  | { mode: "fixed"; value: number }
  | { mode: "same" }
  | { mode: "add"; value: number }
  | { mode: "multiply"; value: number };

export interface DerivedItemRule {
  eventId: string;
  itemId: string;
  quantity: QuantityRule;
}

const CANONICAL_EVENT_PARTICIPATION_FIELD_MAP: Record<string, string> = {
  itens_descerramento_placa: "participation_itens_descerramento",
  descerramento_placa: "participation_descerramento",
  aula_saudade: "participation_aula_saudade",
  missa_culto: "participation_missa",
  culto_cortesia: "participation_culto",
  colacao_descerramento: "participation_colacao_descerramento",
  cerimonia_colacao: "participation_colacao",
  festa_50: "participation_festa_50",
  ensaio_fotografico: "participation_ensaio",
  ensaio_50: "participation_ensaio_50",
  ensaio_365: "participation_ensaio_365",
  festa_365: "participation_festa_365",
  cobertura_fotografica: "participation_cobertura",
  evento_100_dias: "participation_evento_100",
};

const EVENT_PARTICIPATION_FIELD_ALIASES: Record<string, string[]> = {
  missa_culto: ["participation_missa_culto"],
  festa_50: ["participation_festa50"],
  festa_365: ["participation_festa365"],
};

function getEventIdsByCanonicalSlug() {
  const map = new Map<string, string[]>();

  Object.keys(CANONICAL_EVENT_PARTICIPATION_FIELD_MAP).forEach((eventId) => {
    const canonicalSlug = resolveRuntimeCanonicalEventSlug(eventId);
    const current = map.get(canonicalSlug) ?? [];
    current.push(eventId);
    map.set(canonicalSlug, current);
  });

  getRuntimeLegacyAliases()
    .filter((alias) => alias.alias_type === "event")
    .forEach((alias) => {
      const current = map.get(alias.canonical_slug) ?? [];
      current.push(alias.legacy_key);
      map.set(alias.canonical_slug, current);
    });

  EVENT_TYPES.forEach((event) => {
    const canonicalSlug = resolveRuntimeCanonicalEventSlug(event.id);
    const current = map.get(canonicalSlug) ?? [];
    current.push(event.id);
    map.set(canonicalSlug, current);
  });

  return new Map(
    Array.from(map.entries()).map(([canonicalSlug, eventIds]) => [
      canonicalSlug,
      Array.from(new Set(eventIds)),
    ]),
  );
}

function getLegacyItemIdsByCanonicalEventItem() {
  const map = new Map<string, string[]>();

  EVENT_TYPES.forEach((event) => {
    const canonicalEventSlug = resolveRuntimeCanonicalEventSlug(event.id);
    event.items.forEach((item) => {
      const canonicalItemSlug = resolveRuntimeCanonicalItemSlug(item.id);
      const key = `${canonicalEventSlug}::${canonicalItemSlug}`;
      const current = map.get(key) ?? [];
      current.push(item.id);
      map.set(key, current);
    });
  });

  return map;
}

function toQuantityRule(
  derivedRuleMode: "fixed" | "same" | "add" | "multiply" | null,
  derivedRuleValue: number | null,
): QuantityRule | null {
  if (!derivedRuleMode) return null;
  if (derivedRuleMode === "same") return { mode: "same" };
  return {
    mode: derivedRuleMode,
    value: Number(derivedRuleValue) || 0,
  };
}

export function getEventParticipationFieldMap() {
  const eventIdsByCanonicalSlug = getEventIdsByCanonicalSlug();
  return Object.entries(CANONICAL_EVENT_PARTICIPATION_FIELD_MAP).reduce<Record<string, string>>(
    (acc, [canonicalSlug, field]) => {
      acc[canonicalSlug] = field;
      (eventIdsByCanonicalSlug.get(canonicalSlug) ?? []).forEach((eventId) => {
        acc[eventId] = field;
      });
      return acc;
    },
    {},
  );
}

export function getDerivedItemRules(): DerivedItemRule[] {
  const eventIdsByCanonicalSlug = getEventIdsByCanonicalSlug();
  const legacyItemIdsByCanonicalEventItem = getLegacyItemIdsByCanonicalEventItem();
  const runtimeLegacyItemIdsByCanonicalSlug = getRuntimeLegacyItemIdsByCanonicalSlug();

  return getRuntimeCanonicalEventTemplates().flatMap((eventTemplate) => {
    const eventIds = eventIdsByCanonicalSlug.get(eventTemplate.slug) ?? [eventTemplate.slug];

    return eventTemplate.event_item_configs.flatMap((config) => {
      const quantityRule = toQuantityRule(config.derived_rule_mode, config.derived_rule_value);
      if (!quantityRule) return [];

      const eventSpecificLegacyItemIds =
        legacyItemIdsByCanonicalEventItem.get(`${eventTemplate.slug}::${config.item_slug}`) ?? [];
      const aliasedItemIds = runtimeLegacyItemIdsByCanonicalSlug.get(config.item_slug) ?? [];
      const itemIds = Array.from(
        new Set([config.item_slug, ...eventSpecificLegacyItemIds, ...aliasedItemIds]),
      );

      return eventIds.flatMap((eventId) =>
        itemIds.map((itemId) => ({
          eventId,
          itemId,
          quantity: quantityRule,
        })),
      );
    });
  });
}

export function getParticipationField(eventId: string) {
  return getEventParticipationFieldMap()[eventId] || `participation_${eventId}`;
}

export function getParticipationFieldCandidates(eventId: string) {
  const canonicalEventSlug = resolveRuntimeCanonicalEventSlug(eventId);
  return Array.from(new Set([
    getParticipationField(eventId),
    ...(EVENT_PARTICIPATION_FIELD_ALIASES[eventId] || []),
    ...(EVENT_PARTICIPATION_FIELD_ALIASES[canonicalEventSlug] || []),
  ]));
}

export function getParticipationQuantity(
  values: Record<string, unknown> | null | undefined,
  eventId: string,
  fallback = 0,
) {
  for (const field of getParticipationFieldCandidates(eventId)) {
    const value = Number(values?.[field]);
    if (value) return value;
  }

  const studentsQuantity = Number(values?.studentsQuantity);
  if (studentsQuantity) return studentsQuantity;

  return fallback;
}

export function resolveRuleQuantity(baseQty: number, rule: QuantityRule): number {
  if (rule.mode === "fixed") return rule.value;
  if (rule.mode === "same") return baseQty;
  if (rule.mode === "add") return baseQty + rule.value;
  return baseQty * rule.value;
}
