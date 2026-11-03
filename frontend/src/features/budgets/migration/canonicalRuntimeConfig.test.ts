import { afterEach, describe, expect, it } from "vitest";
import {
  getRuntimeCanonicalEventTemplate,
  getRuntimeCanonicalSelector,
  hydrateCanonicalRuntimeConfig,
  isCanonicalRuntimeHydratedFromApi,
  resetCanonicalRuntimeConfig,
  resolveRuntimeCanonicalEventSlug,
  resolveRuntimeCanonicalItemSlug,
} from "./canonicalRuntimeConfig";
import { getDerivedItemRules } from "../data/runtimeBudgetRules";

afterEach(() => {
  resetCanonicalRuntimeConfig();
});

describe("canonicalRuntimeConfig", () => {
  it("hidrata aliases, selectors e summary rules vindos da API", () => {
    hydrateCanonicalRuntimeConfig({
      items: [
        {
          id: "legacy_item_x",
          db_id: "501",
          legacy_item_id: "legacy_item_x",
          slug: "item_canonico_x",
          name: "Item Canônico X",
          unit_price: 25,
          default_quantity: 1,
          editable: true,
          dynamic_by_students: false,
          has_subitems: false,
          subitems: [],
          item_kind: "standard",
          category: "geral",
          created_at: new Date().toISOString(),
        },
      ],
      selectors: [
        {
          slug: "selector_teste",
          label: "Selector Teste",
          options: [{ slug: "op_a", label: "Opção A", value: 90 }],
        },
      ],
      eventTemplates: [
        {
          id: "legacy_event_x",
          db_id: "701",
          legacy_event_id: "legacy_event_x",
          slug: "evento_canonico_x",
          name: "Evento Canônico X",
          city: "Capital",
          type: "Pago",
          items: [
            {
              id: "legacy_item_x",
              db_id: "501",
              legacy_item_id: "legacy_item_x",
              slug: "item_canonico_x",
              name: "Item Canônico X",
              unit_price: 25,
              default_quantity: 1,
              editable: true,
              dynamic_by_students: false,
              has_subitems: false,
              subitems: [],
              item_kind: "standard",
              category: "geral",
              created_at: new Date().toISOString(),
            },
          ],
          event_item_configs: [
            {
              item_id: "legacy_item_x",
              item_db_id: "501",
              item_legacy_id: "legacy_item_x",
              item_slug: "item_canonico_x",
              sort_order: 1,
              quantity_editable: true,
              price_editable: true,
              dynamic_by_students: true,
              derived_rule_mode: "same",
              selector_slug: "selector_teste",
              selector_options: [{ slug: "op_a", label: "Opção A", value: 90 }],
              include_in_financial_sum: true,
              display_only: false,
            },
          ],
          summary_rules: [
            {
              slug: "subtotal",
              label: "Subtotal",
              type: "sum",
              sources: ["item_canonico_x"],
            },
            {
              slug: "total_geral",
              label: "Total Geral",
              type: "same_value_of",
              source: "subtotal",
            },
          ],
          created_at: new Date().toISOString(),
        },
      ],
      legacyAliases: [
        {
          alias_type: "event",
          legacy_key: "legacy_event_x",
          canonical_slug: "evento_canonico_x",
        },
        {
          alias_type: "item",
          legacy_key: "legacy_item_x",
          canonical_slug: "item_canonico_x",
        },
      ],
    });

    expect(isCanonicalRuntimeHydratedFromApi()).toBe(true);
    expect(resolveRuntimeCanonicalEventSlug("legacy_event_x")).toBe("evento_canonico_x");
    expect(resolveRuntimeCanonicalItemSlug("legacy_item_x")).toBe("item_canonico_x");
    expect(getRuntimeCanonicalSelector("selector_teste")?.options[0]?.value).toBe(90);
    expect(getRuntimeCanonicalEventTemplate("legacy_event_x")?.summary_rules).toHaveLength(2);
    expect(getDerivedItemRules()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "legacy_event_x",
          itemId: "legacy_item_x",
          quantity: { mode: "same" },
        }),
      ]),
    );
  });
});
