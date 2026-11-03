import { getDerivedItemRules, getEventParticipationFieldMap } from "./runtimeBudgetRules";
import { EVENT_TYPES } from "./mockData";

export interface LegacyEventItemSnapshot {
  legacy_item_id: string;
  name: string;
  unit_price: number;
  sort_order: number;
  is_group_header: boolean;
  group_title: string | null;
  has_inline_subitems: boolean;
  inline_subitems: string[];
  display_value: string | null;
  fixed_qty: number | null;
  quantity_editable: boolean;
  price_editable: boolean;
  dynamic_by_students: boolean;
  derived_rule:
    | { mode: "fixed"; value: number }
    | { mode: "same" }
    | { mode: "add"; value: number }
    | { mode: "multiply"; value: number }
    | null;
}

export interface LegacyEventSnapshot {
  legacy_event_id: string;
  title: string;
  participation_field: string;
  items: LegacyEventItemSnapshot[];
}

export interface LegacyMigrationSnapshot {
  generated_at: string;
  totals: {
    events: number;
    items: number;
    headers: number;
    items_with_inline_subitems: number;
    items_with_derived_rules: number;
  };
  events: LegacyEventSnapshot[];
}

function splitInlineSubitems(name: string): string[] {
  return name
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildLegacyMigrationSnapshot(): LegacyMigrationSnapshot {
  const derivedItemRules = getDerivedItemRules();
  const participationFieldMap = getEventParticipationFieldMap();
  let totalItems = 0;
  let totalHeaders = 0;
  let totalInlineSubitems = 0;
  let totalDerivedRules = 0;

  const events: LegacyEventSnapshot[] = EVENT_TYPES.map((event) => {
    const items: LegacyEventItemSnapshot[] = event.items.map((item, index) => {
      const inlineSubitems = splitInlineSubitems(item.name);
      const hasInlineSubitems = inlineSubitems.length > 1;
      const derivedRule = derivedItemRules.find(
        (rule) => rule.eventId === event.id && rule.itemId === item.id,
      )?.quantity ?? null;

      totalItems += 1;
      if (item.isHeader) totalHeaders += 1;
      if (hasInlineSubitems) totalInlineSubitems += 1;
      if (derivedRule) totalDerivedRules += 1;

      return {
        legacy_item_id: item.id,
        name: item.name,
        unit_price: Number(item.unitPrice) || 0,
        sort_order: index + 1,
        is_group_header: Boolean(item.isHeader),
        group_title: item.isHeader ? item.name : null,
        has_inline_subitems: hasInlineSubitems,
        inline_subitems: hasInlineSubitems ? inlineSubitems : [],
        display_value: item.displayValue ?? null,
        fixed_qty: typeof item.fixedQty === "number" ? item.fixedQty : null,
        quantity_editable: item.quantityEditable ?? !item.fixedQty,
        price_editable: item.priceEditable ?? !item.displayValue,
        dynamic_by_students: Boolean(item.dynamicByStudents),
        derived_rule: derivedRule,
      };
    });

    return {
      legacy_event_id: event.id,
      title: event.title,
      participation_field:
        participationFieldMap[event.id] ?? `participation_${event.id}`,
      items,
    };
  });

  return {
    generated_at: new Date().toISOString(),
    totals: {
      events: events.length,
      items: totalItems,
      headers: totalHeaders,
      items_with_inline_subitems: totalInlineSubitems,
      items_with_derived_rules: totalDerivedRules,
    },
    events,
  };
}
