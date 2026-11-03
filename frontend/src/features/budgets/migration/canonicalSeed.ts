import {
  canonicalEvents,
  canonicalItems,
  canonicalSelectors,
  canonicalSubItems,
  canonicalSummaryDefinitions,
  legacyAliases,
  type CanonicalEventDefinition,
  type CanonicalEventItemDefinition,
  type CanonicalEventSummaryLine,
} from "./canonicalCatalog";

export interface CanonicalSubItemSeed {
  slug: string;
  name: string;
  has_price: boolean;
  has_quantity: boolean;
}

export interface CanonicalItemSeed {
  legacy_item_id: string | null;
  slug: string;
  name: string;
  unit_price: number;
  default_quantity: number;
  editable: boolean;
  dynamic_by_students: boolean;
  has_subitems: boolean;
  subitems: Array<{ slug: string; name: string }>;
  kind: "standard" | "container" | "selector" | "computed_reference";
  category: string;
}

export interface CanonicalEventTemplateItemConfigSeed {
  item_slug: string;
  sort_order: number;
  is_group_header: boolean;
  group_title: string | null;
  display_value: string | null;
  fixed_qty: number | null;
  quantity_editable: boolean;
  price_editable: boolean;
  dynamic_by_students: boolean;
  derived_rule_mode: "fixed" | "same" | "add" | "multiply" | null;
  derived_rule_value: number | null;
  item_role: "standard" | "container" | "selector" | "computed_reference";
  summary_group: string | null;
  selector_slug: string | null;
  selector_options: Array<{ slug: string; label: string; value?: number }>;
  include_in_financial_sum: boolean;
  display_only: boolean;
  formula_slug: string | null;
  participant_source: "participants" | null;
}

export interface CanonicalSummaryRuleSeed {
  slug: string;
  label: string;
  type:
    | "sum"
    | "percentage_of"
    | "division"
    | "fixed_value"
    | "display_included"
    | "display_dash"
    | "display_participants"
    | "same_value_of";
  percentage?: number;
  sources?: string[];
  numerator?: string;
  denominator?: string;
  value?: number;
  source?: string;
}

export interface CanonicalEventTemplateSeed {
  legacy_event_id: string;
  slug: string;
  name: string;
  city: string;
  type: "Pago" | "Cortesia";
  item_slugs: string[];
  event_item_configs: CanonicalEventTemplateItemConfigSeed[];
  summary_rules: CanonicalSummaryRuleSeed[];
}

export interface CanonicalSelectorSeed {
  slug: string;
  label: string;
  options: Array<{
    slug: string;
    label: string;
    value?: number;
    allowBudgetEdit?: boolean;
    city?: string | null;
  }>;
}

export interface LegacyAliasSeed {
  alias_type: "event" | "item";
  legacy_key: string;
  canonical_slug: string;
  notes?: string;
}

export interface CanonicalSeedBundle {
  items: CanonicalItemSeed[];
  subItems: CanonicalSubItemSeed[];
  selectors: CanonicalSelectorSeed[];
  summaryDefinitions: typeof canonicalSummaryDefinitions;
  eventTemplates: CanonicalEventTemplateSeed[];
  legacyAliases: LegacyAliasSeed[];
}

function getCanonicalItem(slug: string) {
  const item = canonicalItems.find((entry) => entry.slug === slug);
  if (!item) {
    throw new Error(`Canonical item not found: ${slug}`);
  }
  return item;
}

function getCanonicalSubItem(slug: string) {
  const subItem = canonicalSubItems.find((entry) => entry.slug === slug);
  if (!subItem) {
    throw new Error(`Canonical subitem not found: ${slug}`);
  }
  return subItem;
}

function getSelector(slug: string) {
  return canonicalSelectors.find((entry) => entry.slug === slug) ?? null;
}

function inferUnitPrice(item: CanonicalEventItemDefinition): number {
  if (!item.priceRule) return 0;
  if (item.priceRule.type === "fixed_value") return item.priceRule.value;
  if (item.priceRule.type === "editable_default") return item.priceRule.value;
  if (item.priceRule.type === "selected_variant_value") {
    const selector = getSelector(item.priceRule.selectorSlug);
    return selector?.options.find((option) => typeof option.value === "number")?.value ?? 0;
  }
  return 0;
}

function inferDefaultQuantity(item: CanonicalEventItemDefinition): number {
  if (!item.quantityRule) return 1;
  if (item.quantityRule.type === "fixed") return item.quantityRule.value;
  return 1;
}

function inferEditable(item: CanonicalEventItemDefinition): boolean {
  return item.quantityEditable === true || item.priceEditable === true;
}

function inferDynamicByStudents(item: CanonicalEventItemDefinition): boolean {
  return (
    item.quantityRule?.type === "same" ||
    item.quantityRule?.type === "add" ||
    item.quantityRule?.type === "multiply"
  );
}

function inferIncludedInFinancialSum(item: CanonicalEventItemDefinition): boolean {
  return !(
    item.formulaSlug ||
    getCanonicalItem(item.itemSlug).kind === "container" ||
    (item.priceRule?.type === "included" && item.quantityRule?.type === "included_context")
  );
}

function inferDisplayOnly(item: CanonicalEventItemDefinition): boolean {
  return Boolean(item.formulaSlug) || getCanonicalItem(item.itemSlug).kind === "container";
}

function mapItemConfig(item: CanonicalEventItemDefinition): CanonicalEventTemplateItemConfigSeed {
  const selector =
    item.variantSelectorSlug || item.priceRule?.type === "selected_variant_value"
      ? getSelector(item.variantSelectorSlug ?? (item.priceRule as { selectorSlug: string }).selectorSlug)
      : null;

  return {
    item_slug: item.itemSlug,
    sort_order: item.sortOrder,
    is_group_header: false,
    group_title: null,
    display_value: null,
    fixed_qty: item.quantityRule?.type === "fixed" ? item.quantityRule.value : null,
    quantity_editable: item.quantityEditable === true,
    price_editable: item.priceEditable === true,
    dynamic_by_students: inferDynamicByStudents(item),
    derived_rule_mode:
      item.quantityRule?.type === "fixed" ||
      item.quantityRule?.type === "same" ||
      item.quantityRule?.type === "add" ||
      item.quantityRule?.type === "multiply"
        ? item.quantityRule.type
        : null,
    derived_rule_value:
      item.quantityRule?.type === "fixed" ||
      item.quantityRule?.type === "add" ||
      item.quantityRule?.type === "multiply"
        ? item.quantityRule.value
        : null,
    item_role: getCanonicalItem(item.itemSlug).kind,
    summary_group: null,
    selector_slug: selector?.slug ?? null,
    selector_options: selector?.options ?? [],
    include_in_financial_sum: inferIncludedInFinancialSum(item),
    display_only: inferDisplayOnly(item),
    formula_slug: item.formulaSlug ?? null,
    participant_source:
      item.quantityRule?.type === "same" ||
      item.quantityRule?.type === "add" ||
      item.quantityRule?.type === "multiply"
        ? "participants"
        : null,
  };
}

function mapSummaryLine(line: CanonicalEventSummaryLine): CanonicalSummaryRuleSeed {
  return {
    slug: line.slug,
    label: line.label,
    type: line.type,
    percentage: line.percentage,
    sources: line.sources,
    numerator: line.numerator,
    denominator: line.denominator,
    value: line.value,
    source: line.source,
  };
}

function buildItemSeeds(): CanonicalItemSeed[] {
  const eventItemMap = new Map<string, CanonicalEventItemDefinition[]>();

  canonicalEvents.forEach((event) => {
    event.items.forEach((item) => {
      const existing = eventItemMap.get(item.itemSlug) ?? [];
      existing.push(item);
      eventItemMap.set(item.itemSlug, existing);
    });
  });

  return canonicalItems.map((item) => {
    const usages = eventItemMap.get(item.slug) ?? [];
    const representative = usages[0];
    const subitems = representative?.subItemSlugs?.map((slug) => {
      const sub = getCanonicalSubItem(slug);
      return { slug: sub.slug, name: sub.label };
    }) ?? [];

    return {
      legacy_item_id: item.slug,
      slug: item.slug,
      name: item.label,
      unit_price: representative ? inferUnitPrice(representative) : 0,
      default_quantity: representative ? inferDefaultQuantity(representative) : 1,
      editable: representative ? inferEditable(representative) : false,
      dynamic_by_students: representative ? inferDynamicByStudents(representative) : false,
      has_subitems: subitems.length > 0,
      subitems,
      kind: item.kind,
      category: item.category,
    };
  });
}

function buildSubItemSeeds(): CanonicalSubItemSeed[] {
  return canonicalSubItems.map((item) => ({
    slug: item.slug,
    name: item.label,
    has_price: item.hasPrice === true,
    has_quantity: item.hasQuantity === true,
  }));
}

function inferEventType(event: CanonicalEventDefinition): "Pago" | "Cortesia" {
  if (event.slug === "culto_cortesia" || event.slug === "evento_100_dias") return "Cortesia";
  return "Pago";
}

function buildEventTemplateSeeds(): CanonicalEventTemplateSeed[] {
  return canonicalEvents.map((event) => ({
    legacy_event_id: event.slug,
    slug: event.slug,
    name: event.label,
    city: "Capital",
    type: inferEventType(event),
    item_slugs: event.items.map((item) => item.itemSlug),
    event_item_configs: event.items.map(mapItemConfig),
    summary_rules: event.summary.map(mapSummaryLine),
  }));
}

function buildLegacyAliasSeeds(): LegacyAliasSeed[] {
  return legacyAliases.map((alias) => ({
    alias_type: alias.aliasType,
    legacy_key: alias.legacyKey,
    canonical_slug: alias.canonicalSlug,
    notes: alias.notes,
  }));
}

export function buildCanonicalSeedBundle(): CanonicalSeedBundle {
  return {
    items: buildItemSeeds(),
    subItems: buildSubItemSeeds(),
    selectors: canonicalSelectors.map((selector) => ({
      slug: selector.slug,
      label: selector.label,
      options: selector.options,
    })),
    summaryDefinitions: canonicalSummaryDefinitions,
    eventTemplates: buildEventTemplateSeeds(),
    legacyAliases: buildLegacyAliasSeeds(),
  };
}

export const canonicalSeedBundle = buildCanonicalSeedBundle();
