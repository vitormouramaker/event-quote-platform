import { describe, expect, it } from "vitest";
import { diffBudgetItems } from "./budgetItemChanges";

describe("diffBudgetItems", () => {
  it("registra antes e depois de quantidade e preço", () => {
    const log = diffBudgetItems({
      previousItems: {
        colacao: { convite: 10, convite_price: 50 },
      },
      nextItems: {
        colacao: { convite: 12, convite_price: 60, convite_price_manual: true },
      },
      source: "ANNEX",
      at: "2026-09-25T12:00:00.000Z",
    });

    expect(log.colacao.convite).toEqual({
      quantityFrom: 10,
      quantityTo: 12,
      unitPriceFrom: 50,
      unitPriceTo: 60,
      source: "ANNEX",
      at: "2026-09-25T12:00:00.000Z",
    });
  });

  it("ignora item sem mudança e chaves auxiliares sozinhas", () => {
    const log = diffBudgetItems({
      previousItems: { colacao: { convite: 10, convite_price: 50 } },
      nextItems: {
        colacao: { convite: 10, convite_price: 50, convite_price_manual: true },
      },
      source: "EDIT",
    });

    expect(log).toEqual({});
  });

  it("marca item novo e item removido", () => {
    const log = diffBudgetItems({
      previousItems: { colacao: { antigo: 2 } },
      nextItems: { colacao: { novo: 3 } },
      source: "EDIT",
    });

    expect(log.colacao.antigo.quantityTo).toBeUndefined();
    expect(log.colacao.antigo.quantityFrom).toBe(2);
    expect(log.colacao.novo.quantityTo).toBe(3);
  });
});
