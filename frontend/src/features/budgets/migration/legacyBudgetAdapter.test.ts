import { describe, expect, it } from "vitest";
import { adaptBudgetStoredFormData } from "./legacyBudgetAdapter";

describe("legacyBudgetAdapter", () => {
  it("normaliza aliases legados e gera snapshot canonico sem quebrar o payload atual", () => {
    const adapted = adaptBudgetStoredFormData({
      selectedEvents: ["cerimonia_colacao", "festa_50", "missa_culto"],
      studentsQuantity: 42,
      participation_festa_50: 38,
      participation_missa: 30,
      items: {
        cerimonia_colacao: {
          becas_formandos_cerimonia: 42,
          becas_formandos_cerimonia_price: 120,
          locacao_auditorio_cerimonia: 1,
          locacao_auditorio_cerimonia_price: 10000,
        },
        festa_50: {
          buffet_festa50: 38,
          buffet_festa50_price: 80,
          dj_festa50: 1,
          dj_festa50_price: 700,
        },
      },
    });

    expect(adapted).toBeDefined();
    expect(adapted?.schemaVersion).toBe(1);
    expect(adapted?.participation_festa50).toBe(38);
    expect(adapted?.participation_missa_culto).toBe(30);
    expect(adapted?.canonicalSnapshot?.selectedEventSlugs).toEqual([
      "cerimonia_colacao",
      "festa_50",
      "missa_culto",
    ]);

    const cerimonia = adapted?.canonicalSnapshot?.events.find(
      (event) => event.legacyEventId === "cerimonia_colacao",
    );
    expect(cerimonia?.participationQty).toBe(42);
    expect(cerimonia?.items[0]).toMatchObject({
      legacyItemId: "becas_formandos_cerimonia",
      canonicalItemSlug: "becas_luxo_formandos",
      quantity: 42,
      unitPrice: 120,
    });

    const festa = adapted?.canonicalSnapshot?.events.find(
      (event) => event.legacyEventId === "festa_50",
    );
    expect(festa?.participationQty).toBe(38);
    expect(festa?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          legacyItemId: "buffet_festa50",
          canonicalItemSlug: "servicos_buffet_formandos",
        }),
        expect.objectContaining({
          legacyItemId: "dj_festa50",
          canonicalItemSlug: "atracao_musical_verba",
        }),
      ]),
    );
  });

  it("preserva schemaVersion 2 para payload dinamico futuro", () => {
    const adapted = adaptBudgetStoredFormData({
      schemaVersion: 2,
      selectedEvents: ["cerimonia_colacao"],
      items: {},
    });

    expect(adapted?.schemaVersion).toBe(2);
    expect(adapted?.canonicalSnapshot?.source).toBe("dynamic");
  });

  it("ignora o flag `_price_manual` do auditorio — nao vira item fantasma no snapshot", () => {
    const adapted = adaptBudgetStoredFormData({
      selectedEvents: ["cerimonia_colacao"],
      studentsQuantity: 30,
      items: {
        cerimonia_colacao: {
          locacao_auditorio_cerimonia: 1,
          locacao_auditorio_cerimonia_price: 10000,
          locacao_auditorio_cerimonia_price_manual: true,
        },
      },
    });

    const cerimonia = adapted?.canonicalSnapshot?.events.find(
      (event) => event.legacyEventId === "cerimonia_colacao",
    );
    const itemIds = cerimonia?.items.map((item) => item.legacyItemId) ?? [];
    expect(itemIds).toContain("locacao_auditorio_cerimonia");
    expect(itemIds.some((id) => id.endsWith("_price_manual"))).toBe(false);
  });
});
