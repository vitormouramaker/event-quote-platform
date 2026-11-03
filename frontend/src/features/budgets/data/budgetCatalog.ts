import type {
  BaseItemDto,
  EventTemplateDto,
  EventTemplateItemConfigDto,
  ItemVariationDto,
} from "../../../services/api";
import { getDerivedItemRules, type QuantityRule } from "./runtimeBudgetRules";
import {
  getRuntimeCanonicalItems,
  getRuntimeLegacyItemIdsByCanonicalSlug,
  getRuntimeCanonicalSlugByItemName,
  resolveRuntimeCanonicalItemSlug,
} from "../migration/canonicalRuntimeConfig";
import { EVENT_TYPES, type BudgetItem, type EventType } from "./mockData";
import { canonicalEvents } from "../migration/canonicalCatalog";

export type BudgetCity = EventTemplateDto["city"];

export type BudgetCatalogItem = BudgetItem & {
  defaultQuantity?: number;
  quantityEditable?: boolean;
  priceEditable?: boolean;
  dynamicByStudents?: boolean;
  hasAdditional?: boolean;
  additionalQuantity?: number;
  hasMultiplier?: boolean;
  multiplierQuantity?: number;
  variations?: ItemVariationDto[];
};

export type BudgetCatalogEvent = EventType & {
  source?: "mock" | "api";
  city?: BudgetCity;
  value?: number | null;
  has_administration?: boolean;
  unit_price_editable?: boolean;
  requires_min_events?: boolean;
  /** Fecha um quadro próprio no resumo final (ver `domain/summaryBlocks`). */
  closes_summary_block?: boolean;
  summary_block_label?: string | null;
  items: BudgetCatalogItem[];
};

type LegacyQuantityMeta = Pick<
  BudgetCatalogItem,
  "defaultQuantity" | "fixedQty" | "dynamicByStudents" | "quantityRule"
>;

function toNumber(value: number | string | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function mapBaseItemToBudgetCatalogItem(item: BaseItemDto): BudgetCatalogItem {
  const hasAdditional = Boolean(item.has_additional);
  const additionalRaw = Number(item.additional_quantity ?? 0);
  const hasMultiplier = Boolean(item.has_multiplier);
  const multiplierRaw = Number(item.multiplier_quantity ?? 0);
  return {
    id: String(item.id),
    name: item.name,
    unitPrice: toNumber(item.unit_price, 0),
    defaultQuantity: toNumber(item.default_quantity, 1),
    quantityEditable: Boolean(item.editable),
    priceEditable: Boolean(item.editable),
    dynamicByStudents: Boolean(item.dynamic_by_students),
    valueVisibleToClient: Boolean(item.value_visible_to_client),
    hasSubitems: Boolean(item.has_subitems),
    subitems: Array.isArray(item.subitems) ? item.subitems : [],
    variations: Array.isArray(item.variations) ? item.variations : [],
    hasAdditional,
    additionalQuantity:
      hasAdditional && Number.isFinite(additionalRaw) && additionalRaw > 0
        ? Math.floor(additionalRaw)
        : 0,
    hasMultiplier,
    multiplierQuantity:
      hasMultiplier && Number.isFinite(multiplierRaw) && multiplierRaw > 0
        ? Math.floor(multiplierRaw)
        : 0,
  };
}

function normalizeItemName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Eventos onde "Servi\u00e7os de Buffet" deve aparecer logo abaixo de "Bebidas: Open Bar".
const BUFFET_AFTER_OPENBAR_EVENT_SLUGS = new Set(["aula_saudade", "festa_50", "festa_365"]);

// Move o item de buffet para logo ap\u00f3s o item de open bar (ordem visual est\u00e1vel).
// Independe da ordem original (sort_order da API) e s\u00f3 atua quando ambos existem.
function reorderBuffetAfterOpenBar<T extends { name: string }>(items: T[]): T[] {
  const isOpenBar = (name: string) => normalizeItemName(name).includes("open bar");
  const isBuffet = (name: string) => normalizeItemName(name).includes("servicos de buffet");
  const openBarIndex = items.findIndex((item) => isOpenBar(item.name));
  const buffetIndex = items.findIndex((item) => isBuffet(item.name));
  if (openBarIndex === -1 || buffetIndex === -1) return items;
  if (buffetIndex === openBarIndex + 1) return items;
  const next = [...items];
  const [buffet] = next.splice(buffetIndex, 1);
  const insertAfter = next.findIndex((item) => isOpenBar(item.name));
  next.splice(insertAfter + 1, 0, buffet);
  return next;
}

function buildQuantityMeta(quantityRule: QuantityRule): LegacyQuantityMeta {
  if (quantityRule.mode === "fixed") {
    return {
      defaultQuantity: quantityRule.value,
      fixedQty: quantityRule.value,
      dynamicByStudents: false,
      quantityRule,
    };
  }

  return {
    dynamicByStudents: true,
    quantityRule,
  };
}

function resolveConfiguredQuantityMeta(configQuantityRule?: QuantityRule | null): LegacyQuantityMeta | null {
  return configQuantityRule ? buildQuantityMeta(configQuantityRule) : null;
}

function getConfigQuantityRule(config: EventTemplateItemConfigDto | undefined): QuantityRule | null {
  if (!config?.derived_rule_mode) return null;

  if (config.derived_rule_mode === "fixed") {
    return { mode: "fixed", value: Number(config.derived_rule_value) || 0 };
  }

  if (config.derived_rule_mode === "add" || config.derived_rule_mode === "multiply") {
    return { mode: config.derived_rule_mode, value: Number(config.derived_rule_value) || 0 };
  }

  return { mode: "same" };
}

function resolveLegacyQuantityMeta(eventId: string, itemId: string, itemName: string): LegacyQuantityMeta | null {
  const derivedItemRules = getDerivedItemRules();
  const legacyQuantityRuleByEventItem = new Map(
    derivedItemRules.map((rule) => [`${rule.eventId}::${rule.itemId}`, rule.quantity] as const),
  );
  const legacyItemIdsByCanonicalSlug = getRuntimeLegacyItemIdsByCanonicalSlug();
  const legacyQuantityRuleByEventItemName = new Map(
    EVENT_TYPES.flatMap((event) =>
      event.items.flatMap((item) => {
        const rule = legacyQuantityRuleByEventItem.get(`${event.id}::${item.id}`);
        return rule ? [[`${event.id}::${normalizeItemName(item.name)}`, rule] as const] : [];
      }),
    ),
  );
  const canonicalSlugByNormalizedItemName = new Map(
    getRuntimeCanonicalItems().map((item) => [normalizeItemName(item.name), item.slug] as const),
  );
  const normalizedItemName = normalizeItemName(itemName);
  const canonicalCandidates = [
    resolveRuntimeCanonicalItemSlug(itemId),
    canonicalSlugByNormalizedItemName.get(normalizedItemName) ?? getRuntimeCanonicalSlugByItemName(itemName),
  ].filter((value): value is string => Boolean(value));
  const candidateItemIds = [
    itemId,
    ...canonicalCandidates.flatMap((canonicalSlug) => legacyItemIdsByCanonicalSlug.get(canonicalSlug) ?? []),
  ];
  const quantityRule =
    candidateItemIds
      .map((candidateItemId) => legacyQuantityRuleByEventItem.get(`${eventId}::${candidateItemId}`))
      .find((rule): rule is QuantityRule => Boolean(rule)) ??
    legacyQuantityRuleByEventItemName.get(`${eventId}::${normalizedItemName}`);
  if (!quantityRule) return null;

  return buildQuantityMeta(quantityRule);
}

export function buildBudgetEventsCatalog(
  eventTemplates?: EventTemplateDto[] | null,
): BudgetCatalogEvent[] {
  const merged = new Map<string, BudgetCatalogEvent>();

  // Hardcoded legacy catalog intentionally disabled.
  // Keep source file for rollback/comparison, but runtime now uses API-only templates.
  const useMockCatalog = false;
  if (useMockCatalog) {
    EVENT_TYPES.forEach((event) => {
      merged.set(event.id, {
        ...event,
        source: "mock",
      });
    });
  }

  (eventTemplates ?? []).forEach((eventTemplate) => {
    const configMap = new Map<string, EventTemplateItemConfigDto>();
    (eventTemplate.event_item_configs ?? []).forEach((config) => {
      [config.item_id, config.item_db_id, config.item_legacy_id, config.item_slug]
        .filter((value): value is string | number => value !== null && value !== undefined && value !== "")
        .forEach((value) => {
          configMap.set(String(value), config);
        });
    });

    const mappedItems = (eventTemplate.items ?? []).map((item) => {
      const config =
        configMap.get(String(item.id)) ??
        (item.db_id ? configMap.get(String(item.db_id)) : undefined) ??
        (item.legacy_item_id ? configMap.get(String(item.legacy_item_id)) : undefined) ??
        (item.slug ? configMap.get(String(item.slug)) : undefined);
      const mapped = mapBaseItemToBudgetCatalogItem(item);
      const configQuantityMeta = resolveConfiguredQuantityMeta(getConfigQuantityRule(config));
      const legacyQuantityMeta =
        configQuantityMeta ?? resolveLegacyQuantityMeta(String(eventTemplate.id), mapped.id, mapped.name);

      return {
        ...mapped,
        name: config?.group_title?.trim() && config.is_group_header ? config.group_title : mapped.name,
        isHeader: Boolean(config?.is_group_header),
        displayValue: config?.display_value ?? mapped.displayValue,
        fixedQty:
          typeof config?.fixed_qty === "number"
            ? config.fixed_qty
            : mapped.fixedQty ?? legacyQuantityMeta?.fixedQty,
        quantityRule: legacyQuantityMeta?.quantityRule,
        defaultQuantity:
          typeof config?.default_quantity === "number"
            ? config.default_quantity
            : (mapped.defaultQuantity ?? legacyQuantityMeta?.defaultQuantity),
        quantityEditable:
          typeof config?.quantity_editable === "boolean"
            ? config.quantity_editable
            : mapped.quantityEditable,
        priceEditable:
          eventTemplate.unit_price_editable === true
            ? true
            : typeof config?.price_editable === "boolean"
              ? config.price_editable
              : mapped.priceEditable,
        dynamicByStudents:
          legacyQuantityMeta?.dynamicByStudents ??
          (typeof config?.dynamic_by_students === "boolean"
            ? config.dynamic_by_students
            : mapped.dynamicByStudents),
        unitPrice:
          typeof config?.display_value === "string"
            ? 0
            : // O evento pode ter o item com outro valor: a versao do evento
              // ganha do cadastro do item, que e o padrao.
              (typeof config?.unit_price === "number"
                ? config.unit_price
                : mapped.unitPrice),
        valueVisibleToClient:
          typeof config?.value_visible_to_client === "boolean"
            ? config.value_visible_to_client
            : mapped.valueVisibleToClient,
        hasSubitems:
          typeof config?.has_subitems === "boolean"
            ? config.has_subitems
            : mapped.hasSubitems,
        subitems: Array.isArray(config?.subitems) ? config.subitems : mapped.subitems,
        hasAdditional:
          typeof config?.has_additional === "boolean"
            ? config.has_additional
            : mapped.hasAdditional,
        additionalQuantity:
          typeof config?.additional_quantity === "number"
            ? config.additional_quantity
            : mapped.additionalQuantity,
        hasMultiplier:
          typeof config?.has_multiplier === "boolean"
            ? config.has_multiplier
            : mapped.hasMultiplier,
        multiplierQuantity:
          typeof config?.multiplier_quantity === "number"
            ? config.multiplier_quantity
            : mapped.multiplierQuantity,
        variations:
          Array.isArray(config?.variations) && config.variations.length > 0
            ? config.variations
            : mapped.variations,
      };
    });

    mappedItems.sort((a, b) => {
      const orderA = configMap.get(String(a.id))?.sort_order ?? Number.MAX_SAFE_INTEGER;
      const orderB = configMap.get(String(b.id))?.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name, "pt-BR");
    });

    const eventCanonicalSlug = resolveCanonicalEventSlugByTitle(eventTemplate.name);
    const orderedItems =
      eventCanonicalSlug && BUFFET_AFTER_OPENBAR_EVENT_SLUGS.has(eventCanonicalSlug)
        ? reorderBuffetAfterOpenBar(mappedItems)
        : mappedItems;

    merged.set(String(eventTemplate.id), {
      id: String(eventTemplate.id),
      title: eventTemplate.name,
      city: eventTemplate.city,
      source: "api",
      value: eventTemplate.value ?? null,
      has_administration: eventTemplate.has_administration ?? false,
      unit_price_editable: eventTemplate.unit_price_editable ?? false,
      requires_min_events: eventTemplate.requires_min_events ?? false,
      closes_summary_block: eventTemplate.closes_summary_block ?? false,
      summary_block_label: eventTemplate.summary_block_label ?? null,
      items: orderedItems,
    });
  });

  return Array.from(merged.values());
}

// Ordem de exibição desejada dos eventos (Capital). Codifica as regras fixas:
// - Festa 100 dias sempre por ÚLTIMO; Cobertura fotográfica sempre PENÚLTIMA.
// - Itens da colação logo abaixo da Cerimônia de colação de grau.
// - Festa Meio médico logo abaixo da Festa 365; Festa do Internato logo abaixo
//   do Meio médico.
export const FIXED_EVENT_DISPLAY_ORDER: string[] = [
  "ITENS DO DESCERRAMENTO DE PLACA",
  "DESCERRAMENTO DE PLACA",
  "AULA DA SAUDADE - COMPLEXO AURORA",
  "MISSA EM AÇÃO DE GRAÇAS",
  "CULTO EM AÇÃO DE GRAÇAS - CORTESIA",
  "COLAÇÃO DE GRAU E DESCERRAMENTO NO MESMO LOCAL",
  "CERIMÔNIA DE COLAÇÃO DE GRAU",
  "ITENS DA COLAÇÃO",
  "FESTA 50% - COMPLEXO AURORA",
  "FESTA 365 DIAS - COMPLEXO AURORA",
  "FESTA MEIO MÉDICO",
  "FESTA DO INTERNATO",
  "ENSAIO 50%",
  "ENSAIO 365 DIAS",
  "ENSAIO FOTOGRÁFICO",
  "COBERTURA FOTOGRÁFICA",
  "EVENTO 100 DIAS - CORTESIA",
].map(normalizeItemName);

// Ordem canônica final: a ordem desejada acima + quaisquer eventos canônicos não
// listados (append). Eventos de outra cidade mantêm a posição original.
const CANONICAL_EVENT_ORDER: string[] = [
  ...FIXED_EVENT_DISPLAY_ORDER,
  ...canonicalEvents
    .map((event) => normalizeItemName(event.label))
    .filter((name) => !FIXED_EVENT_DISPLAY_ORDER.includes(name)),
];

export function getCanonicalEventOrderIndex(title: string | undefined | null): number {
  if (!title) return Number.MAX_SAFE_INTEGER;
  const index = CANONICAL_EVENT_ORDER.indexOf(normalizeItemName(title));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

// Mapeia o título do evento (normalizado) para o slug canônico. Usado para
// identificar eventos independentemente do id vindo da API (que pode ser UUID).
const CANONICAL_EVENT_SLUG_BY_NORMALIZED_LABEL = new Map<string, string>(
  canonicalEvents.map((event) => [normalizeItemName(event.label), event.slug] as const),
);

export function resolveCanonicalEventSlugByTitle(
  title: string | undefined | null,
): string | null {
  if (!title) return null;
  return CANONICAL_EVENT_SLUG_BY_NORMALIZED_LABEL.get(normalizeItemName(title)) ?? null;
}

// Ordena eventos de Capital pela sequência canônica. A ordenação só vale
// quando AMBOS os eventos comparados são de Capital; caso contrário mantém
// a ordem original (sort estável via índice decorado).
export function sortEventsByCanonicalOrder<
  T extends { title?: string | null; city?: BudgetCity | null },
>(events: T[]): T[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const bothCapital = a.event.city === "Capital" && b.event.city === "Capital";
      if (!bothCapital) return a.index - b.index;
      const orderA = getCanonicalEventOrderIndex(a.event.title);
      const orderB = getCanonicalEventOrderIndex(b.event.title);
      if (orderA !== orderB) return orderA - orderB;
      return a.index - b.index;
    })
    .map(({ event }) => event);
}

export function filterBudgetEventsByCity(
  budgetEvents: BudgetCatalogEvent[],
  city?: BudgetCity,
): BudgetCatalogEvent[] {
  if (!city) return [];
  return sortEventsByCanonicalOrder(budgetEvents.filter((event) => event.city === city));
}

// Eventos com POSIÇÃO FIXA — não podem ser reordenados por DnD (a menos que o
// usuário ative "Habilitar mover qualquer evento"). Detecção por título (cobre
// eventos criados pela UI, sem slug canônico).
const FIXED_POSITION_TITLE_PATTERNS: RegExp[] = [
  /itens\s+da\s+cola[çc]/i,
  /meio\s+m[eé]dico/i,
  /internato/i,
  /cobertura\s+fotogr/i,
  /100\s+dias/i,
];

export function isFixedPositionEvent(title?: string | null): boolean {
  if (!title) return false;
  return FIXED_POSITION_TITLE_PATTERNS.some((re) => re.test(title));
}

// Reposiciona os eventos FIXOS de volta às suas regras, mantendo a ordem atual
// dos demais (usado ao reordenar por DnD com o toggle "mover qualquer" DESLIGADO):
// - Itens da colação logo após a Cerimônia de colação de grau.
// - Meio médico logo após a Festa 365; Internato logo após o Meio médico.
// - Cobertura fotográfica penúltima; Festa 100 dias última.
export function enforceFixedEventRules<T extends { title?: string | null }>(
  events: T[],
): T[] {
  const t = (e: T) => e.title || "";
  const isItens = (e: T) => /itens\s+da\s+cola[çc]/i.test(t(e));
  const isMeio = (e: T) => /meio\s+m[eé]dico/i.test(t(e));
  const isIntern = (e: T) => /internato/i.test(t(e));
  const isCobertura = (e: T) => /cobertura\s+fotogr/i.test(t(e));
  const is100 = (e: T) => /100\s+dias/i.test(t(e));
  const isCerimonia = (e: T) => /cerim[oô]nia\s+de\s+cola[çc]/i.test(t(e));
  const isFesta365 = (e: T) => /festa\s+365/i.test(t(e));

  const itens = events.find(isItens);
  const meio = events.find(isMeio);
  const intern = events.find(isIntern);
  const cobertura = events.find(isCobertura);
  const cem = events.find(is100);

  const base = events.filter(
    (e) => !isItens(e) && !isMeio(e) && !isIntern(e) && !isCobertura(e) && !is100(e),
  );

  if (itens) {
    const i = base.findIndex(isCerimonia);
    if (i >= 0) base.splice(i + 1, 0, itens);
    else base.push(itens);
  }
  const festaExtras = [meio, intern].filter((e): e is T => Boolean(e));
  if (festaExtras.length) {
    const i = base.findIndex(isFesta365);
    if (i >= 0) base.splice(i + 1, 0, ...festaExtras);
    else base.push(...festaExtras);
  }
  if (cobertura) base.push(cobertura);
  if (cem) base.push(cem);
  return base;
}

// Ordena os eventos selecionados de um orçamento. Se houver uma ordem
// personalizada (DnD, por orçamento) usa ela; senão, a ordem canônica global.
// Eventos fora da ordem personalizada vão para o fim (mantendo a ordem canônica).
export function orderSelectedEvents<
  T extends { id: string; title?: string | null; city?: BudgetCity | null },
>(events: T[], eventOrder?: readonly string[] | null): T[] {
  if (Array.isArray(eventOrder) && eventOrder.length > 0) {
    const pos = new Map(eventOrder.map((id, index) => [String(id), index]));
    const canonical = sortEventsByCanonicalOrder(events);
    return canonical
      .map((event, index) => ({ event, index }))
      .sort((a, b) => {
        const pa = pos.has(a.event.id) ? (pos.get(a.event.id) as number) : Number.MAX_SAFE_INTEGER;
        const pb = pos.has(b.event.id) ? (pos.get(b.event.id) as number) : Number.MAX_SAFE_INTEGER;
        if (pa !== pb) return pa - pb;
        return a.index - b.index; // desempate: ordem canônica
      })
      .map(({ event }) => event);
  }
  return sortEventsByCanonicalOrder(events);
}

export function buildBaseItemsCatalog(baseItems?: BaseItemDto[] | null): BudgetCatalogItem[] {
  return (baseItems ?? []).map(mapBaseItemToBudgetCatalogItem);
}
