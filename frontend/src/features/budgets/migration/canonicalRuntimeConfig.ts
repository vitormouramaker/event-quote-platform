import type {
  BaseItemDto,
  CatalogSelectorDto,
  EventTemplateDto,
  EventTemplateSummaryRuleDto,
  EventTemplateRuntimeCatalogDto,
  LegacyAliasDto,
} from "../../../services/api";
import {
  canonicalSeedBundle,
  type CanonicalEventTemplateItemConfigSeed,
  type CanonicalEventTemplateSeed,
  type CanonicalItemSeed,
  type CanonicalSelectorSeed,
  type CanonicalSummaryRuleSeed,
  type LegacyAliasSeed,
} from "./canonicalSeed";

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type RuntimeCatalogState = {
  items: CanonicalItemSeed[];
  selectors: CanonicalSelectorSeed[];
  eventTemplates: CanonicalEventTemplateSeed[];
  legacyAliases: LegacyAliasSeed[];
};

let runtimeCanonicalItems = canonicalSeedBundle.items;
let runtimeCanonicalSelectors = canonicalSeedBundle.selectors;
let runtimeCanonicalEventTemplates = canonicalSeedBundle.eventTemplates;
let runtimeLegacyAliases = canonicalSeedBundle.legacyAliases;
let runtimeHydratedFromApi = false;

let runtimeEventAliasMap = new Map<string, string>();
let runtimeItemAliasMap = new Map<string, string>();
let runtimeLegacyItemIdsByCanonicalSlug = new Map<string, string[]>();
let runtimeSelectorBySlug = new Map<string, CanonicalSelectorSeed>();
let runtimeItemBySlug = new Map<string, CanonicalItemSeed>();
let runtimeEventTemplateBySlug = new Map<string, CanonicalEventTemplateSeed>();
let runtimeCanonicalSlugByNormalizedItemName = new Map<string, string>();

function rebuildRuntimeIndexes() {
  runtimeEventAliasMap = new Map(
    runtimeLegacyAliases
      .filter((alias) => alias.alias_type === "event")
      .map((alias) => [alias.legacy_key, alias.canonical_slug] as const),
  );

  runtimeItemAliasMap = new Map(
    runtimeLegacyAliases
      .filter((alias) => alias.alias_type === "item")
      .map((alias) => [alias.legacy_key, alias.canonical_slug] as const),
  );

  runtimeLegacyItemIdsByCanonicalSlug = runtimeLegacyAliases
    .filter((alias) => alias.alias_type === "item")
    .reduce<Map<string, string[]>>((map, alias) => {
      const current = map.get(alias.canonical_slug) ?? [];
      current.push(alias.legacy_key);
      map.set(alias.canonical_slug, current);
      return map;
    }, new Map());

  runtimeSelectorBySlug = new Map(
    runtimeCanonicalSelectors.map((selector) => [selector.slug, selector] as const),
  );

  runtimeItemBySlug = new Map(
    runtimeCanonicalItems.map((item) => [item.slug, item] as const),
  );

  runtimeEventTemplateBySlug = new Map(
    runtimeCanonicalEventTemplates.map((eventTemplate) => [eventTemplate.slug, eventTemplate] as const),
  );

  // Mapa nome-normalizado → slug canônico. Construído a partir da base canônica
  // ESTÁTICA (sempre com slug) e depois refinado por itens de runtime que tenham
  // slug real. Sem isto, ao hidratar com itens da API criados pela UI (slug null),
  // rótulos canônicos passariam a mapear para null e detecções por nome (ex.:
  // "LOCACAO DO AUDITORIO" → "locacao_auditorio") quebrariam.
  // A base canônica ESTÁTICA é autoritativa para rótulo→slug canônico. Itens de
  // runtime criados pela UI têm slug = próprio id numérico (ex.: "285"), que
  // sobrescreveria o slug canônico e quebraria a detecção por nome. Por isso o
  // seed estático vem primeiro e só adicionamos itens de runtime cujo nome ainda
  // não tenha mapeamento canônico.
  const nameSlugMap = new Map<string, string>();
  canonicalSeedBundle.items.forEach((item) => {
    if (item.slug) nameSlugMap.set(normalizeLabel(item.name), item.slug);
  });
  runtimeCanonicalItems.forEach((item) => {
    const key = normalizeLabel(item.name);
    if (item.slug && !nameSlugMap.has(key)) nameSlugMap.set(key, item.slug);
  });
  runtimeCanonicalSlugByNormalizedItemName = nameSlugMap;
}

function normalizeSelectorOptions(
  options: Array<{ slug: string; label: string; value?: number }> | undefined,
) {
  return Array.isArray(options)
    ? options
        .filter((option) => option && typeof option.slug === "string" && typeof option.label === "string")
        .map((option) => ({
          slug: option.slug,
          label: option.label,
          value: typeof option.value === "number" ? option.value : undefined,
        }))
    : [];
}

function normalizeRuntimeItem(item: BaseItemDto): CanonicalItemSeed {
  const itemSlug =
    (typeof item.slug === "string" && item.slug.trim()) ||
    (typeof item.legacy_item_id === "string" && item.legacy_item_id.trim()) ||
    String(item.id);

  return {
    legacy_item_id:
      typeof item.legacy_item_id === "string" && item.legacy_item_id.trim()
        ? item.legacy_item_id
        : String(item.id),
    slug: itemSlug,
    name: item.name,
    unit_price: Number(item.unit_price) || 0,
    default_quantity: Number(item.default_quantity) || 1,
    editable: item.editable === true,
    dynamic_by_students: item.dynamic_by_students === true,
    has_subitems: item.has_subitems === true,
    subitems: Array.isArray(item.subitems)
      ? item.subitems
          .filter((subItem) => subItem && typeof subItem.name === "string")
          .map((subItem) => ({
            slug:
              typeof subItem.id === "string" && subItem.id.trim()
                ? subItem.id
                : normalizeLabel(subItem.name).replace(/\s+/g, "_"),
            name: subItem.name,
          }))
      : [],
    kind:
      item.item_kind === "container" ||
      item.item_kind === "selector" ||
      item.item_kind === "computed_reference"
        ? item.item_kind
        : "standard",
    category: item.category || "geral",
  };
}

function normalizeRuntimeSummaryRule(rule: EventTemplateSummaryRuleDto): CanonicalSummaryRuleSeed {
  return {
    slug: rule.slug,
    label: rule.label,
    type: rule.type,
    percentage: typeof rule.percentage === "number" ? rule.percentage : undefined,
    sources: Array.isArray(rule.sources) ? rule.sources : undefined,
    numerator: rule.numerator ?? undefined,
    denominator: rule.denominator ?? undefined,
    value: typeof rule.value === "number" ? rule.value : undefined,
    source: rule.source ?? undefined,
  };
}

function normalizeRuntimeEventTemplate(template: EventTemplateDto): CanonicalEventTemplateSeed {
  const slug =
    (typeof template.slug === "string" && template.slug.trim()) ||
    (typeof template.legacy_event_id === "string" && template.legacy_event_id.trim()) ||
    String(template.id);

  const itemSlugByAnyId = new Map<string, string>();
  (template.items ?? []).forEach((item) => {
    const normalized = normalizeRuntimeItem(item);
    itemSlugByAnyId.set(String(item.id), normalized.slug);
    if (item.db_id) itemSlugByAnyId.set(String(item.db_id), normalized.slug);
    if (item.legacy_item_id) itemSlugByAnyId.set(String(item.legacy_item_id), normalized.slug);
    itemSlugByAnyId.set(normalized.slug, normalized.slug);
  });

  const eventItemConfigs: CanonicalEventTemplateItemConfigSeed[] = (template.event_item_configs ?? []).map(
    (config, index) => {
      const itemSlug =
        (typeof config.item_slug === "string" && config.item_slug.trim()) ||
        itemSlugByAnyId.get(String(config.item_id)) ||
        (config.item_db_id ? itemSlugByAnyId.get(String(config.item_db_id)) : undefined) ||
        (config.item_legacy_id ? itemSlugByAnyId.get(String(config.item_legacy_id)) : undefined) ||
        String(config.item_id);

      return {
        item_slug: itemSlug,
        sort_order: Number(config.sort_order) || index + 1,
        is_group_header: config.is_group_header === true,
        group_title: config.group_title ?? null,
        display_value: config.display_value ?? null,
        fixed_qty: typeof config.fixed_qty === "number" ? config.fixed_qty : null,
        quantity_editable: config.quantity_editable === true,
        price_editable: config.price_editable === true,
        dynamic_by_students: config.dynamic_by_students === true,
        derived_rule_mode: config.derived_rule_mode ?? null,
        derived_rule_value:
          typeof config.derived_rule_value === "number" ? config.derived_rule_value : null,
        item_role: config.item_role ?? "standard",
        summary_group: config.summary_group ?? null,
        selector_slug: config.selector_slug ?? null,
        selector_options: normalizeSelectorOptions(config.selector_options),
        include_in_financial_sum: config.include_in_financial_sum !== false,
        display_only: config.display_only === true,
        formula_slug: config.formula_slug ?? null,
        participant_source: config.participant_source ?? null,
      };
    },
  );

  const itemSlugs =
    template.items?.map((item) => itemSlugByAnyId.get(String(item.id)) || String(item.id)) ?? [];

  return {
    legacy_event_id:
      typeof template.legacy_event_id === "string" && template.legacy_event_id.trim()
        ? template.legacy_event_id
        : String(template.id),
    slug,
    name: template.name,
    city: template.city,
    type: template.type,
    item_slugs: itemSlugs,
    event_item_configs: eventItemConfigs,
    summary_rules: Array.isArray(template.summary_rules)
      ? template.summary_rules.map(normalizeRuntimeSummaryRule)
      : [],
  };
}

function normalizeRuntimeSelector(selector: CatalogSelectorDto): CanonicalSelectorSeed {
  return {
    slug: selector.slug,
    label: selector.label,
    options: normalizeSelectorOptions(selector.options),
  };
}

function normalizeRuntimeAlias(alias: LegacyAliasDto): LegacyAliasSeed {
  return {
    alias_type: alias.alias_type,
    legacy_key: alias.legacy_key,
    canonical_slug: alias.canonical_slug,
    notes: alias.notes ?? undefined,
  };
}

function buildRuntimeStateFromApiCatalog(
  catalog: EventTemplateRuntimeCatalogDto,
): RuntimeCatalogState {
  const items = (catalog.items ?? []).map(normalizeRuntimeItem);
  const eventTemplates = (catalog.eventTemplates ?? []).map(normalizeRuntimeEventTemplate);
  const selectorsFromApi = (catalog.selectors ?? []).map(normalizeRuntimeSelector);
  const selectorsBySlug = new Map(selectorsFromApi.map((selector) => [selector.slug, selector] as const));

  eventTemplates.forEach((eventTemplate) => {
    eventTemplate.event_item_configs.forEach((config) => {
      if (!config.selector_slug || selectorsBySlug.has(config.selector_slug)) return;
      selectorsBySlug.set(config.selector_slug, {
        slug: config.selector_slug,
        label: config.selector_slug,
        options: normalizeSelectorOptions(config.selector_options),
      });
    });
  });

  return {
    items,
    selectors: Array.from(selectorsBySlug.values()),
    eventTemplates,
    legacyAliases: (catalog.legacyAliases ?? []).map(normalizeRuntimeAlias),
  };
}

// Últimas opções vindas da tabela de auditórios (fonte viva). Guardadas para
// reaplicar após cada hydrate — senão hydrate reconstrói selectors do catálogo
// (seed) e apaga auditórios criados pela UI.
let lastAuditoriumOptions: CanonicalSelectorSeed["options"] | null = null;

function applyAuditoriumSelector(options: CanonicalSelectorSeed["options"]) {
  const existing = runtimeCanonicalSelectors.find((s) => s.slug === "locacao_auditorio");
  if (existing) {
    existing.options = options;
  } else {
    runtimeCanonicalSelectors = [
      ...runtimeCanonicalSelectors,
      { slug: "locacao_auditorio", label: "Locação do Auditório", options },
    ];
  }
  rebuildRuntimeIndexes();
}

export function patchAuditoriumsSelector(
  auditoriums: Array<{
    slug: string;
    name: string;
    price: number;
    allow_budget_edit?: boolean;
    city?: string | null;
  }>,
) {
  const options = auditoriums.map((a) => ({
    slug: a.slug,
    label: a.name,
    value: a.price,
    allowBudgetEdit: Boolean(a.allow_budget_edit),
    city: a.city ?? null,
  }));
  lastAuditoriumOptions = options;
  applyAuditoriumSelector(options);
}

export function hydrateCanonicalRuntimeConfig(catalog: EventTemplateRuntimeCatalogDto) {
  const next = buildRuntimeStateFromApiCatalog(catalog);
  runtimeCanonicalItems = next.items;
  runtimeCanonicalSelectors = next.selectors;
  runtimeCanonicalEventTemplates = next.eventTemplates;
  runtimeLegacyAliases = next.legacyAliases;
  runtimeHydratedFromApi = true;
  rebuildRuntimeIndexes();
  // Reaplica auditórios vivos por cima do catálogo recém-hidratado.
  if (lastAuditoriumOptions) applyAuditoriumSelector(lastAuditoriumOptions);
}

export function resetCanonicalRuntimeConfig() {
  runtimeCanonicalItems = canonicalSeedBundle.items;
  runtimeCanonicalSelectors = canonicalSeedBundle.selectors;
  runtimeCanonicalEventTemplates = canonicalSeedBundle.eventTemplates;
  runtimeLegacyAliases = canonicalSeedBundle.legacyAliases;
  runtimeHydratedFromApi = false;
  rebuildRuntimeIndexes();
}

export function isCanonicalRuntimeHydratedFromApi() {
  return runtimeHydratedFromApi;
}

export function getRuntimeCanonicalItems() {
  return runtimeCanonicalItems;
}

export function getRuntimeCanonicalSelectors() {
  return runtimeCanonicalSelectors;
}

export function getRuntimeCanonicalEventTemplates() {
  return runtimeCanonicalEventTemplates;
}

export function getRuntimeLegacyAliases() {
  return runtimeLegacyAliases;
}

export function getRuntimeLegacyItemIdsByCanonicalSlug() {
  return runtimeLegacyItemIdsByCanonicalSlug;
}

export function resolveRuntimeCanonicalEventSlug(eventId: string) {
  return runtimeEventAliasMap.get(eventId) ?? eventId;
}

export function resolveRuntimeCanonicalItemSlug(itemId: string) {
  return runtimeItemAliasMap.get(itemId) ?? itemId;
}

export function getRuntimeCanonicalEventTemplate(
  eventIdOrSlug: string,
): CanonicalEventTemplateSeed | undefined {
  return runtimeEventTemplateBySlug.get(resolveRuntimeCanonicalEventSlug(eventIdOrSlug));
}

export function getRuntimeCanonicalItemSeed(
  itemIdOrSlug: string,
): CanonicalItemSeed | undefined {
  return runtimeItemBySlug.get(resolveRuntimeCanonicalItemSlug(itemIdOrSlug));
}

export function getRuntimeCanonicalSelector(
  slug: string,
): CanonicalSelectorSeed | undefined {
  return runtimeSelectorBySlug.get(slug);
}

export function getRuntimeCanonicalItemConfigBySlug(
  eventIdOrSlug: string,
  itemSlug: string,
): CanonicalEventTemplateItemConfigSeed | undefined {
  return getRuntimeCanonicalEventTemplate(eventIdOrSlug)?.event_item_configs.find(
    (config) => config.item_slug === itemSlug,
  );
}

export function getRuntimeCanonicalSlugByItemName(itemName: string) {
  return runtimeCanonicalSlugByNormalizedItemName.get(normalizeLabel(itemName));
}

rebuildRuntimeIndexes();

export type {
  CanonicalEventTemplateItemConfigSeed as RuntimeCanonicalEventItemConfig,
  CanonicalEventTemplateSeed as RuntimeCanonicalEventTemplate,
  CanonicalItemSeed as RuntimeCanonicalItemSeed,
  CanonicalSelectorSeed as RuntimeCanonicalSelector,
  LegacyAliasSeed as RuntimeLegacyAlias,
};
