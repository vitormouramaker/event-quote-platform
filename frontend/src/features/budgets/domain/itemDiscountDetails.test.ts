import { describe, expect, it } from "vitest";
import { EVENT_TYPES } from "../data/mockData";
import {
  buildApprovedItemDiscountDetails,
  getAppliedItemDiscountPercentage,
} from "./itemDiscountDetails";

function getEvent(id: string) {
  const event = EVENT_TYPES.find((entry) => entry.id === id);
  expect(event, `Evento ${id} deve existir em EVENT_TYPES`).toBeTruthy();
  return event!;
}

describe("itemDiscountDetails", () => {
  it("calcula desconto sobre o total atual do item", () => {
    const formValues = {
      participation_aula_saudade: 20,
      items: {
        aula_saudade: {
          bebidas_open_bar: 25,
          bebidas_open_bar_price: 40,
        },
      },
      customItems: {},
    };

    const details = buildApprovedItemDiscountDetails(
      formValues,
      [getEvent("aula_saudade")],
      [
        {
          id: "aula_saudade-bebidas_open_bar",
          eventId: "aula_saudade",
          itemId: "bebidas_open_bar",
          itemName: "Bebidas Open Bar",
          requestedPercentage: 10,
          originalUnitPrice: 40,
          status: "APPROVED",
        },
      ],
    );

    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({
      appliedPercentage: 10,
      baseAmount: 1000,
      discountAmount: 100,
      finalAmount: 900,
    });
  });

  it("prioriza percentual aprovado final", () => {
    expect(
      getAppliedItemDiscountPercentage({
        requestedPercentage: 10,
        newDiscountPercent: 12,
      }),
    ).toBe(12);
  });

  describe("desconto do item em valor fixo", () => {
    const pedidoEmReais = {
      id: "aula_saudade-bebidas_open_bar",
      eventId: "aula_saudade",
      itemId: "bebidas_open_bar",
      itemName: "Bebidas Open Bar",
      // O percentual gravado e so o equivalente de quando o pedido foi feito.
      requestedPercentage: 20,
      discountMode: "FIXED",
      requestedAmount: 200,
      originalUnitPrice: 40,
      status: "APPROVED",
    };

    const formValues = (quantidade: number) => ({
      participation_aula_saudade: 20,
      items: {
        aula_saudade: {
          bebidas_open_bar: quantidade,
          bebidas_open_bar_price: 40,
        },
      },
      customItems: {},
    });

    it("desconta exatamente os reais pedidos", () => {
      const [detalhe] = buildApprovedItemDiscountDetails(
        formValues(25),
        [getEvent("aula_saudade")],
        [pedidoEmReais],
      );

      expect(detalhe.baseAmount).toBe(1000);
      expect(detalhe.discountAmount).toBe(200);
      expect(detalhe.finalAmount).toBe(800);
    });

    it("continua valendo os mesmos reais quando a quantidade do item muda", () => {
      const [detalhe] = buildApprovedItemDiscountDetails(
        formValues(50),
        [getEvent("aula_saudade")],
        [pedidoEmReais],
      );

      // Base dobrou (R$ 2.000), o desconto segue R$ 200 - nao escalou.
      expect(detalhe.baseAmount).toBe(2000);
      expect(detalhe.discountAmount).toBe(200);
      expect(detalhe.finalAmount).toBe(1800);
    });

    it("um valor fixo maior que o item zera o item, nao vira credito", () => {
      const [detalhe] = buildApprovedItemDiscountDetails(
        formValues(25),
        [getEvent("aula_saudade")],
        [{ ...pedidoEmReais, requestedAmount: 5000 }],
      );

      expect(detalhe.appliedPercentage).toBe(100);
      expect(detalhe.discountAmount).toBe(1000);
      expect(detalhe.finalAmount).toBe(0);
    });

    it("o valor aprovado pelo gestor manda sobre o pedido", () => {
      const [detalhe] = buildApprovedItemDiscountDetails(
        formValues(25),
        [getEvent("aula_saudade")],
        [{ ...pedidoEmReais, newDiscountAmount: 150 }],
      );

      expect(detalhe.discountAmount).toBe(150);
    });
  });
});
