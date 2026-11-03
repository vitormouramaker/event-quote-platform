import { describe, expect, it } from "vitest";
import type { EventType } from "../../budgets/data/mockData";
import { buildCourtesyPrintEvent } from "../../budgets/print/budgetPrint";

const jaleco = {
  id: "cerimonia_jaleco",
  title: "Cerimônia do Jaleco",
  items: [
    { id: "jalecos", name: "Jalecos", unitPrice: 120, dynamicByStudents: true },
    { id: "decoracao", name: "Decoração", unitPrice: 800, fixedQty: 1 },
  ],
} as unknown as EventType;

describe("evento cortesia do anexo contratual", () => {
  it("descreve os itens sem nenhum valor", () => {
    const event = buildCourtesyPrintEvent(jaleco, 20);

    expect(event.title).toBe("Cerimônia do Jaleco");
    expect(event.participants).toBe(20);
    expect(event.finalTotal).toBe(0);
    expect(event.subtotal).toBe(0);
    expect(event.valuePerStudent).toBe(0);

    const [jalecos, decoracao] = event.rows;
    expect(jalecos.quantityLabel).toBe("20");
    expect(jalecos.unitPriceLabel).toBe("Cortesia");
    expect(jalecos.finalTotalLabel).toBe("Cortesia");
    expect(decoracao.quantityLabel).toBe("1");
  });

  it("nao expoe itemId, entao o anexo nao consegue grava-lo no orcamento", () => {
    // O write-back do anexo so mexe em linhas com `itemId`. Sem ele, o evento
    // cortesia nunca vira uma nova versao do orcamento.
    const event = buildCourtesyPrintEvent(jaleco, 20);
    expect(event.rows.every((row) => row.itemId === undefined)).toBe(true);
  });
});
