import {
  getRuntimeCanonicalEventTemplate,
  getRuntimeCanonicalItemSeed,
  getRuntimeCanonicalSelector,
  getRuntimeLegacyAliases,
  getRuntimeLegacyItemIdsByCanonicalSlug,
  type RuntimeCanonicalEventItemConfig,
  type RuntimeCanonicalEventTemplate,
  type RuntimeCanonicalItemSeed,
} from "../migration/canonicalRuntimeConfig";
import { getEventParticipationFieldMap } from "../data/runtimeBudgetRules";
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

type CalcFormValuesLike = {
  id?: string;
  items?: FormItemsState;
  customItems?: CustomItemsState;
  studentsQuantity?: number;
  canonicalSnapshot?: {
    participantsByEvent?: Record<string, number>;
  };
  [key: string]: unknown;
};

type CalculationEventLike = {
  id: string;
  items: Array<{ id: string }>;
};

type EventTotals = {
  total: number;
  discountedTotal: number;
};

type CanonicalCalcContext = {
  event: CalculationEventLike;
  formValues: CalcFormValuesLike;
  itemRequests: ApprovedItemRequestLike[];
  eventItemsState: ItemInputMap;
  removedIds: string[];
  customAddedItems: CustomAddedItem[];
  customAddedValue: number;
  canonicalEventSlug: string;
};

const SUPPORTED_CANONICAL_EVENT_SLUGS = new Set([
  "itens_descerramento_placa",
  "descerramento_placa",
  "cobertura_fotografica",
  "aula_saudade",
  "missa_culto",
  "festa_50",
  "festa_365",
  "colacao_descerramento",
  "cerimonia_colacao",
  "ensaio_50",
  "ensaio_365",
  "ensaio_fotografico",
]);

function getEventAliasMap() {
  return new Map(
    getRuntimeLegacyAliases()
      .filter((alias) => alias.alias_type === "event")
      .map((alias) => [alias.legacy_key, alias.canonical_slug]),
  );
}

function toNumber(value: unknown) {
  return Number(value) || 0;
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getCanonicalEvent(eventId: string): RuntimeCanonicalEventTemplate | undefined {
  return getRuntimeCanonicalEventTemplate(eventId);
}

function buildContext(
  event: CalculationEventLike,
  formValues: CalcFormValuesLike,
  itemRequests: BudgetItemRequestsMap,
  customItems?: CustomItemsState,
): CanonicalCalcContext {
  const canonicalEventSlug = getEventAliasMap().get(event.id) ?? event.id;
  const customEntry =
    customItems?.[event.id] ??
    formValues.customItems?.[event.id] ??
    customItems?.[canonicalEventSlug] ??
    formValues.customItems?.[canonicalEventSlug] ??
    {};
  const addedItems = customEntry.added ?? [];
  const customAddedValue = addedItems.reduce(
    (acc, item) => acc + (item.isNoFixedValue ? 0 : toNumber(item.quantity) * toNumber(item.unitPrice)),
    0,
  );

  return {
    event,
    formValues,
    itemRequests: itemRequests?.[formValues.id || "temp-budget"] ?? [],
    eventItemsState:
      formValues.items?.[event.id] ??
      formValues.items?.[canonicalEventSlug] ??
      {},
    removedIds: customEntry.removedIds ?? [],
    customAddedItems: addedItems,
    customAddedValue,
    canonicalEventSlug,
  };
}

function getParticipationQty(ctx: CanonicalCalcContext): number {
  const participationFieldMap = getEventParticipationFieldMap();
  const snapshotQty = ctx.formValues.canonicalSnapshot?.participantsByEvent?.[ctx.canonicalEventSlug];
  if (typeof snapshotQty === "number" && Number.isFinite(snapshotQty) && snapshotQty > 0) {
    return snapshotQty;
  }

  const field =
    participationFieldMap[ctx.event.id] ??
    participationFieldMap[ctx.canonicalEventSlug] ??
    `participation_${ctx.event.id}`;

  return toNumber(ctx.formValues[field]) || toNumber(ctx.formValues.studentsQuantity) || 1;
}

function getItemCandidates(ctx: CanonicalCalcContext, canonicalItemSlug: string): string[] {
  const reverseItemAliasMap = getRuntimeLegacyItemIdsByCanonicalSlug();
  const eventItemIds = ctx.event.items
    .map((item) => String(item.id))
    .filter(
      (itemId) =>
        itemId === canonicalItemSlug ||
        (reverseItemAliasMap.get(canonicalItemSlug) ?? []).includes(itemId),
    );

  return uniq([
    canonicalItemSlug,
    ...(reverseItemAliasMap.get(canonicalItemSlug) ?? []),
    ...eventItemIds,
  ]);
}

function resolveStoredItemKey(ctx: CanonicalCalcContext, canonicalItemSlug: string): string {
  const candidates = getItemCandidates(ctx, canonicalItemSlug);
  return (
    candidates.find(
      (candidate) =>
        Object.prototype.hasOwnProperty.call(ctx.eventItemsState, candidate) ||
        Object.prototype.hasOwnProperty.call(ctx.eventItemsState, `${candidate}_price`) ||
        ctx.removedIds.includes(candidate),
    ) ??
    candidates[0] ??
    canonicalItemSlug
  );
}

function isRemoved(ctx: CanonicalCalcContext, canonicalItemSlug: string) {
  return getItemCandidates(ctx, canonicalItemSlug).some((candidate) =>
    ctx.removedIds.includes(candidate),
  );
}

function getDiscountPct(
  ctx: CanonicalCalcContext,
  canonicalItemSlug: string,
  storedItemKey: string,
  base: number,
) {
  const candidates = uniq([storedItemKey, canonicalItemSlug, ...getItemCandidates(ctx, canonicalItemSlug)]);
  const eventAliasMap = getEventAliasMap();
  const request = ctx.itemRequests.find((entry) => {
    const normalizedEventId = eventAliasMap.get(entry.eventId) ?? entry.eventId;
    return (
      normalizedEventId === ctx.canonicalEventSlug &&
      entry.status === "APPROVED" &&
      candidates.includes(entry.itemId)
    );
  });

  return resolveItemDiscountPercent(base, request);
}

function getCustomAddedTotals(ctx: CanonicalCalcContext) {
  const eventAliasMap = getEventAliasMap();

  return ctx.customAddedItems.reduce(
    (acc, item, index) => {
      const total = item.isNoFixedValue ? 0 : toNumber(item.quantity) * toNumber(item.unitPrice);
      const itemId = item.id || `added_${index}`;
      const request = ctx.itemRequests.find((entry) => {
        const normalizedEventId = eventAliasMap.get(entry.eventId) ?? entry.eventId;
        return (
          normalizedEventId === ctx.canonicalEventSlug &&
          entry.status === "APPROVED" &&
          entry.itemId === itemId
        );
      });
      const discountPct = resolveItemDiscountPercent(total, request);
      const discountedTotal = total - total * (discountPct / 100);

      return {
        total: acc.total + total,
        discountedTotal: acc.discountedTotal + discountedTotal,
      };
    },
    { total: 0, discountedTotal: 0 },
  );
}

function resolveDefaultQty(participants: number, item: RuntimeCanonicalEventItemConfig) {
  if (typeof item.fixed_qty === "number") return item.fixed_qty;
  if (item.derived_rule_mode === "fixed") return Number(item.derived_rule_value) || 0;
  if (item.derived_rule_mode === "same") return participants;
  if (item.derived_rule_mode === "add") return participants + (Number(item.derived_rule_value) || 0);
  if (item.derived_rule_mode === "multiply") return participants * (Number(item.derived_rule_value) || 0);
  return 0;
}

function resolveDefaultPrice(
  item: RuntimeCanonicalEventItemConfig,
  itemSeed: RuntimeCanonicalItemSeed | undefined,
) {
  const selector =
    item.selector_slug ? getRuntimeCanonicalSelector(item.selector_slug) : undefined;
  const selectorPrice =
    item.selector_options.find((option) => typeof option.value === "number")?.value ??
    selector?.options.find((option) => typeof option.value === "number")?.value;

  if (typeof selectorPrice === "number") return selectorPrice;
  return Number(itemSeed?.unit_price) || 0;
}

function resolveItemValue(ctx: CanonicalCalcContext, item: RuntimeCanonicalEventItemConfig) {
  const participants = getParticipationQty(ctx);
  const storedItemKey = resolveStoredItemKey(ctx, item.item_slug);
  const itemSeed = getRuntimeCanonicalItemSeed(item.item_slug);
  const rawQty = ctx.eventItemsState[storedItemKey];
  const rawPrice = ctx.eventItemsState[`${storedItemKey}_price`];
  const qty =
    rawQty !== undefined && rawQty !== null && rawQty !== ""
      ? toNumber(rawQty)
      : resolveDefaultQty(participants, item);
  const unitPrice =
    rawPrice !== undefined && rawPrice !== null && rawPrice !== ""
      ? toNumber(rawPrice)
      : resolveDefaultPrice(item, itemSeed);
  // A base do desconto é o valor do item (qty x preço): é o que permite
  // converter um desconto pedido em reais no percentual equivalente.
  const discountPct = getDiscountPct(ctx, item.item_slug, storedItemKey, qty * unitPrice);
  const discountedUnitPrice = unitPrice - unitPrice * (discountPct / 100);
  const included = item.display_only || item.include_in_financial_sum === false;

  if (included || isRemoved(ctx, item.item_slug)) {
    return { amount: 0, discountedAmount: 0 };
  }

  return {
    amount: qty * unitPrice,
    discountedAmount: qty * discountedUnitPrice,
  };
}

function resolveSourceValue(
  source: string,
  itemValues: Record<string, number>,
  computedValues: Record<string, number>,
) {
  return computedValues[source] ?? itemValues[source] ?? 0;
}

function evaluateSummaryLine(
  line: RuntimeCanonicalEventTemplate["summary_rules"][number],
  itemValues: Record<string, number>,
  computedValues: Record<string, number>,
  customAddedValue: number,
  hasSubtotalLine: boolean,
) {
  if (line.type === "sum") {
    const base = (line.sources ?? []).reduce(
      (acc, source) => acc + resolveSourceValue(source, itemValues, computedValues),
      0,
    );
    if (line.slug === "subtotal") return base + customAddedValue;
    if (!hasSubtotalLine && line.slug === "total_geral") return base + customAddedValue;
    return base;
  }

  if (line.type === "percentage_of") {
    const sourceValue = line.source ? resolveSourceValue(line.source, itemValues, computedValues) : 0;
    return sourceValue * ((line.percentage ?? 0) / 100);
  }

  if (line.type === "fixed_value") return line.value ?? 0;
  if (line.type === "same_value_of") {
    return line.source ? resolveSourceValue(line.source, itemValues, computedValues) : 0;
  }

  if (line.type === "division") {
    const numerator = line.numerator ? resolveSourceValue(line.numerator, itemValues, computedValues) : 0;
    const denominator =
      line.denominator === "participants"
        ? resolveSourceValue("participants", itemValues, computedValues)
        : line.denominator
          ? resolveSourceValue(line.denominator, itemValues, computedValues)
          : 0;
    return denominator > 0 ? numerator / denominator : 0;
  }

  if (line.type === "display_participants") {
    return resolveSourceValue("participants", itemValues, computedValues);
  }

  return 0;
}

function isCanonicalEventCompatible(
  ctx: CanonicalCalcContext,
  canonicalEvent: RuntimeCanonicalEventTemplate,
) {
  const candidateSet = new Set(
    canonicalEvent.event_item_configs.flatMap((item) => getItemCandidates(ctx, item.item_slug)),
  );

  return (
    ctx.event.items.some((item) => candidateSet.has(String(item.id))) ||
    Object.keys(ctx.eventItemsState).some((key) => {
      const baseKey = key.endsWith("_price") ? key.slice(0, -6) : key;
      return candidateSet.has(baseKey);
    })
  );
}

export function tryCalculateCanonicalEventTotals(
  event: CalculationEventLike,
  formValues: CalcFormValuesLike,
  customItems: CustomItemsState | undefined,
  itemRequests: BudgetItemRequestsMap,
): EventTotals | null {
  const canonicalEvent = getCanonicalEvent(event.id);
  if (!canonicalEvent) return null;
  if (!SUPPORTED_CANONICAL_EVENT_SLUGS.has(canonicalEvent.slug)) return null;
  if (canonicalEvent.slug === "culto_cortesia" || canonicalEvent.slug === "evento_100_dias") {
    return { total: 0, discountedTotal: 0 };
  }

  const ctx = buildContext(event, formValues, itemRequests, customItems);
  if (!isCanonicalEventCompatible(ctx, canonicalEvent)) return null;
  const participants = getParticipationQty(ctx);
  const customAddedTotals = getCustomAddedTotals(ctx);
  const itemValues: Record<string, number> = { participants };
  const discountedItemValues: Record<string, number> = { participants };

  canonicalEvent.event_item_configs.forEach((item) => {
    const resolved = resolveItemValue(ctx, item);
    itemValues[item.item_slug] = resolved.amount;
    discountedItemValues[item.item_slug] = resolved.discountedAmount;
  });

  if (canonicalEvent.summary_rules.length === 0) {
    const total =
      Object.entries(itemValues).reduce(
        (acc, [key, value]) => acc + (key === "participants" ? 0 : value),
        0,
      ) + ctx.customAddedValue;
    const itemDiscountValue = Object.entries(itemValues).reduce((acc, [key, value]) => {
      if (key === "participants") return acc;
      return acc + (value - (discountedItemValues[key] ?? 0));
    }, 0);
    const customAddedDiscountValue = customAddedTotals.total - customAddedTotals.discountedTotal;
    return { total, discountedTotal: total - itemDiscountValue - customAddedDiscountValue };
  }

  const hasSubtotalLine = canonicalEvent.summary_rules.some((line) => line.slug === "subtotal");
  const summaryBySlug = new Map(canonicalEvent.summary_rules.map((line) => [line.slug, line]));
  const resolveSummaryTotal = (values: Record<string, number>, customAddedValue: number) => {
    const computed: Record<string, number> = { participants };
    const resolving = new Set<string>();

    const resolveComputed = (slug: string): number => {
      if (slug in computed) return computed[slug];
      const line = summaryBySlug.get(slug);
      if (!line) return values[slug] ?? 0;
      if (resolving.has(slug)) return 0;

      resolving.add(slug);
      const proxy = new Proxy(computed, {
        get(_target, key: string) {
          if (key in computed) return computed[key];
          if (summaryBySlug.has(key)) return resolveComputed(key);
          return values[key] ?? 0;
        },
      }) as Record<string, number>;
      const nextValue = evaluateSummaryLine(
        line,
        values,
        proxy,
        customAddedValue,
        hasSubtotalLine,
      );
      computed[slug] = nextValue;
      resolving.delete(slug);
      return nextValue;
    };

    canonicalEvent.summary_rules.forEach((line) => {
      resolveComputed(line.slug);
    });

    return computed.total_geral ?? computed.subtotal ?? customAddedValue;
  };

  const total = resolveSummaryTotal(itemValues, ctx.customAddedValue);
  const itemDiscountValue = canonicalEvent.event_item_configs.reduce(
    (acc, item) =>
      acc + ((itemValues[item.item_slug] ?? 0) - (discountedItemValues[item.item_slug] ?? 0)),
    0,
  );
  const customAddedDiscountValue = customAddedTotals.total - customAddedTotals.discountedTotal;
  const totalWithAdjustedCustomAdded =
    customAddedDiscountValue > 0
      ? resolveSummaryTotal(itemValues, ctx.customAddedValue - customAddedDiscountValue)
      : total;

  return {
    total,
    discountedTotal: totalWithAdjustedCustomAdded - itemDiscountValue,
  };
}
