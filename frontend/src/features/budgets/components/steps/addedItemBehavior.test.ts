import { describe, expect, it } from "vitest";
import { deriveAddedItemBehavior } from "./addedItemBehavior";

describe("deriveAddedItemBehavior", () => {
  it("mantem item incluido como nao editavel quando a origem nao permite edicao", () => {
    const behavior = deriveAddedItemBehavior({
      sourceItem: {
        id: "placa_formatura",
        name: "Placa de Formatura",
        unitPrice: 2500,
        fixedQty: 1,
        sourceEventId: "itens_descerramento_placa",
      },
      targetParticipationQty: 30,
      manualQuantity: 5,
      manualUnitPrice: 999,
    });

    expect(behavior).toMatchObject({
      quantity: 1,
      unitPrice: 2500,
      quantityEditable: false,
      priceEditable: false,
      isNoFixedValue: false,
    });
  });

  it("torna editavel a quantidade de item vinculado aos formandos", () => {
    const behavior = deriveAddedItemBehavior({
      sourceItem: {
        id: "replica_placa",
        name: "Replica",
        unitPrice: 0,
        displayValue: "Incluso",
        sourceEventId: "descerramento_placa",
      },
      targetParticipationQty: 42,
      manualQuantity: 1,
      manualUnitPrice: 0,
    });

    expect(behavior).toMatchObject({
      quantity: 42,
      quantityEditable: true,
      priceEditable: false,
      isNoFixedValue: true,
      displayValue: "Incluso",
    });
  });

  it("preserva edicao de preco e quantidade para item editavel", () => {
    const behavior = deriveAddedItemBehavior({
      sourceItem: {
        id: "drinks_festa50",
        name: "Drinks",
        unitPrice: 120,
        sourceEventId: "festa_50",
      },
      targetParticipationQty: 55,
      manualQuantity: 1,
      manualUnitPrice: 150,
    });

    expect(behavior).toMatchObject({
      quantity: 55,
      unitPrice: 150,
      quantityEditable: true,
      priceEditable: true,
      isNoFixedValue: false,
    });
  });
});
