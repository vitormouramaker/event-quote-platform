import { describe, expect, it } from "vitest";
import { EVENT_TYPES } from "../data/mockData";
import {
  calculateItemsStepEventTotal,
  calculateSummaryStepEventTotals,
} from "./eventCalculations";

function getEvent(id: string) {
  const event = EVENT_TYPES.find((e) => e.id === id);
  expect(event, `Evento ${id} deve existir em EVENT_TYPES`).toBeTruthy();
  return event!;
}

function baseForm(overrides: Record<string, unknown> = {}) {
  return {
    id: "temp-budget",
    studentsQuantity: 10,
    items: {},
    customItems: {},
    ...overrides,
  };
}

describe("eventCalculations (regressao)", () => {
  it("ItemsStep calcula descerramento de placa (baseline)", () => {
    const event = getEvent("descerramento_placa");
    const formValues = baseForm({
      participation_descerramento: 10,
      items: {
        descerramento_placa: {
          coffee_break: 10,
          coffee_break_price: 65,
        },
      },
    });

    const total = calculateItemsStepEventTotal(
      event,
      formValues,
      formValues.customItems,
      {},
    );

    expect(total).toBe(7865);
  });

  it("SummaryStep aplica desconto aprovado no coffee break de descerramento", () => {
    const event = getEvent("descerramento_placa");
    const formValues = baseForm({
      participation_descerramento: 10,
      items: {
        descerramento_placa: {
          coffee_break: 10,
          coffee_break_price: 65,
        },
      },
      customItems: {
        descerramento_placa: {
          added: [{ id: "x1", name: "Extra", unitPrice: 140, quantity: 2 }],
          removedIds: [],
        },
      },
    });
    const itemRequests = {
      "temp-budget": [
        {
          eventId: "descerramento_placa",
          itemId: "coffee_break",
          status: "APPROVED",
          requestedPercentage: 50,
        },
      ],
    };

    const totals = calculateSummaryStepEventTotals(event, formValues, itemRequests);

    expect(totals.total).toBe(8173);
    expect(totals.discountedTotal).toBe(7848);
  });

  it("Descerramento considera replica_placa no total quando qty/preco sao alterados", () => {
    const event = getEvent("descerramento_placa");
    const formValues = baseForm({
      participation_descerramento: 10,
      items: {
        descerramento_placa: {
          replica_placa: 20,
          replica_placa_price: 140,
          coffee_break: 10,
          coffee_break_price: 65,
        },
      },
    });

    const total = calculateItemsStepEventTotal(event, formValues, {}, {});

    // subtotal = replica (20*140) + coffee (10*65) + fixo 5850 = 9300
    // total com 10% = 10230
    expect(total).toBe(10230);
  });

  it("Culto cortesia retorna zero nas duas camadas de calculo", () => {
    const event = getEvent("culto_cortesia");
    const formValues = baseForm({
      items: {
        culto_cortesia: {
          algum_item: 99,
          algum_item_price: 130,
        },
      },
    });

    const itemsStepTotal = calculateItemsStepEventTotal(event, formValues, {}, {});
    const summaryTotals = calculateSummaryStepEventTotals(event, formValues, {});

    expect(itemsStepTotal).toBe(0);
    expect(summaryTotals).toEqual({ total: 0, discountedTotal: 0 });
  });

  it("Evento 100 dias cortesia retorna zero nas duas camadas de calculo", () => {
    const event = getEvent("evento_100_dias");
    const formValues = baseForm({
      participation_evento_100: 35,
      items: {
        evento_100_dias: {
          open_bar_100dias: 35,
          open_bar_100dias_price: 1550,
        },
      },
    });

    const itemsStepTotal = calculateItemsStepEventTotal(event, formValues, {}, {});
    const summaryTotals = calculateSummaryStepEventTotals(event, formValues, {});

    expect(itemsStepTotal).toBe(0);
    expect(summaryTotals).toEqual({ total: 0, discountedTotal: 0 });
  });

  it("SummaryStep e ItemsStep batem para evento especial sem descontos (Aula da Saudade)", () => {
    const event = getEvent("aula_saudade");
    const formValues = baseForm({
      participation_aula_saudade: 20,
      items: {
        aula_saudade: {
          servicos_buffet: 25,
          servicos_buffet_price: 130,
          bebidas_open_bar: 25,
          bebidas_open_bar_price: 65,
          drinks: 20,
          drinks_price: 80,
          atracao_musical_price: 660,
        },
      },
    });

    const itemsStepTotal = calculateItemsStepEventTotal(event, formValues, {}, {});
    const summaryTotals = calculateSummaryStepEventTotals(event, formValues, {});

    expect(summaryTotals.total).toBe(itemsStepTotal);
    expect(summaryTotals.discountedTotal).toBe(itemsStepTotal);
  });

  it("Aula da Saudade preserva total esperado na engine canonica", () => {
    const event = getEvent("aula_saudade");
    const formValues = baseForm({
      participation_aula_saudade: 20,
      items: {
        aula_saudade: {
          servicos_buffet: 25,
          servicos_buffet_price: 130,
          bebidas_open_bar: 25,
          bebidas_open_bar_price: 65,
          drinks: 20,
          drinks_price: 80,
          atracao_musical_price: 660,
        },
      },
    });

    const totals = calculateSummaryStepEventTotals(event, formValues, {});

    expect(totals).toEqual({ total: 38648.5, discountedTotal: 38648.5 });
  });

  it("Aula da Saudade desconta apenas o valor do item, sem reduzir administracao", () => {
    const event = getEvent("aula_saudade");
    const formValues = baseForm({
      participation_aula_saudade: 20,
      items: {
        aula_saudade: {
          servicos_buffet: 25,
          servicos_buffet_price: 130,
          bebidas_open_bar: 25,
          bebidas_open_bar_price: 65,
          drinks: 20,
          drinks_price: 80,
          atracao_musical_price: 660,
        },
      },
    });
    const itemRequests = {
      "temp-budget": [
        {
          eventId: "aula_saudade",
          itemId: "bebidas_open_bar",
          status: "APPROVED",
          requestedPercentage: 10,
        },
      ],
    };

    const totals = calculateSummaryStepEventTotals(event, formValues, itemRequests);

    expect(totals).toEqual({ total: 38648.5, discountedTotal: 38486 });
  });

  it("Aula da Saudade recalcula administracao para desconto em item adicionado", () => {
    const event = getEvent("aula_saudade");
    const formValues = baseForm({
      participation_aula_saudade: 20,
      items: {
        aula_saudade: {
          servicos_buffet: 25,
          servicos_buffet_price: 130,
          bebidas_open_bar: 25,
          bebidas_open_bar_price: 65,
          drinks: 20,
          drinks_price: 80,
          atracao_musical_price: 660,
        },
      },
      customItems: {
        aula_saudade: {
          added: [{ id: "add-1", name: "Extra Premium", unitPrice: 140, quantity: 1 }],
          removedIds: [],
        },
      },
    });
    const itemRequests = {
      "temp-budget": [
        {
          eventId: "aula_saudade",
          itemId: "add-1",
          status: "APPROVED",
          requestedPercentage: 50,
        },
      ],
    };

    const totals = calculateSummaryStepEventTotals(event, formValues, itemRequests);

    expect(totals).toEqual({ total: 38802.5, discountedTotal: 38725.5 });
  });

  it("Missa/Culto preserva total esperado na engine canonica", () => {
    const event = getEvent("missa_culto");
    const formValues = baseForm({
      participation_missa: 20,
      items: {
        missa_culto: {
          livro_missal: 200,
          livro_missal_price: 10,
          musica_sacra_price: 830,
          taxa_igreja_price: 950,
        },
      },
    });

    const totals = calculateSummaryStepEventTotals(event, formValues, {});

    expect(totals).toEqual({ total: 16258, discountedTotal: 16258 });
  });

  it("Aplica desconto por item no fluxo generico (Itens do Descerramento de Placa)", () => {
    const event = getEvent("itens_descerramento_placa");
    const formValues = baseForm({
      items: {
        itens_descerramento_placa: {
          replica_placa: 10,
        },
      },
    });
    const itemRequests = {
      "temp-budget": [
        {
          eventId: "itens_descerramento_placa",
          itemId: "replica_placa",
          status: "APPROVED",
          requestedPercentage: 50,
        },
      ],
    };

    const itemsStepTotal = calculateItemsStepEventTotal(event, formValues, {}, itemRequests);
    const summaryTotals = calculateSummaryStepEventTotals(event, formValues, itemRequests);

    expect(itemsStepTotal).toBe(3075);
    expect(summaryTotals).toEqual({ total: 3400, discountedTotal: 3075 });
  });

  it("usa percentual aprovado final quando difere do solicitado", () => {
    const event = getEvent("itens_descerramento_placa");
    const formValues = baseForm({
      items: {
        itens_descerramento_placa: {
          replica_placa: 10,
        },
      },
    });
    const itemRequests = {
      "temp-budget": [
        {
          eventId: "itens_descerramento_placa",
          itemId: "replica_placa",
          status: "APPROVED",
          requestedPercentage: 50,
          newDiscountPercent: 25,
        },
      ],
    };

    const summaryTotals = calculateSummaryStepEventTotals(event, formValues, itemRequests);

    expect(summaryTotals).toEqual({ total: 3400, discountedTotal: 3237.5 });
  });

  it("usa regra derivada do catalogo para item com id novo da API", () => {
    const event = {
      id: "itens_descerramento_placa",
      title: "Itens do Descerramento de Placa",
      items: [
        { id: "placa_formatura", name: "Placa de Formatura", unitPrice: 2750, fixedQty: 1 },
        {
          id: "uuid-replica",
          name: "Replica da Placa 15x20",
          unitPrice: 65,
          quantityRule: { mode: "same" as const },
          dynamicByStudents: true,
        },
      ],
    };
    const formValues = baseForm({
      studentsQuantity: 10,
      participation_itens_descerramento: 20,
      items: {
        itens_descerramento_placa: {},
      },
    });

    const itemsStepTotal = calculateItemsStepEventTotal(event, formValues, {}, {});

    expect(itemsStepTotal).toBe(4050);
  });

  it("Aplica taxa de 10% no fluxo generico para eventos tributados (festa_365 sintético)", () => {
    const event = {
      id: "festa_365",
      title: "Festa 365 (teste)",
      items: [
        { id: "item_a", name: "Item A", unitPrice: 140 },
        { id: "item_b", name: "Item B", unitPrice: 75 },
      ],
    };
    const formValues = baseForm({
      items: {
        festa_365: {
          item_a: 2,
          item_b: 4,
        },
      },
      customItems: {
        festa_365: {
          added: [{ id: "add-1", name: "Extra", unitPrice: 20, quantity: 1 }],
          removedIds: [],
        },
      },
    });

    // subtotal = (2*140 + 4*75) = 580; + extra 20 = 600; taxa 10% = 60; total = 660
    const itemsStepTotal = calculateItemsStepEventTotal(
      event,
      formValues,
      formValues.customItems,
      {},
    );
    const summaryTotals = calculateSummaryStepEventTotals(event, formValues, {});

    expect(itemsStepTotal).toBe(660);
    expect(summaryTotals).toEqual({ total: 660, discountedTotal: 660 });
  });

  it("recalcula administracao ao descontar item adicionado em evento tributado", () => {
    const event = {
      id: "festa_365",
      title: "Festa 365 (teste)",
      items: [
        { id: "item_a", name: "Item A", unitPrice: 140 },
        { id: "item_b", name: "Item B", unitPrice: 75 },
      ],
    };
    const formValues = baseForm({
      items: {
        festa_365: {
          item_a: 2,
          item_b: 4,
        },
      },
      customItems: {
        festa_365: {
          added: [{ id: "add-1", name: "Extra", unitPrice: 20, quantity: 1 }],
          removedIds: [],
        },
      },
    });
    const itemRequests = {
      "temp-budget": [
        {
          eventId: "festa_365",
          itemId: "add-1",
          status: "APPROVED",
          requestedPercentage: 50,
        },
      ],
    };

    const summaryTotals = calculateSummaryStepEventTotals(event, formValues, itemRequests);

    expect(summaryTotals).toEqual({ total: 660, discountedTotal: 649 });
  });
  it("resolve participação de festa_50 pelo campo canonicalizado do formulário", () => {
    const event = getEvent("festa_50");
    const formValues = baseForm({
      studentsQuantity: 10,
      participation_festa_50: 30,
      items: {
        festa_50: {
          buffet_festa50: 30,
          buffet_festa50_price: 65,
          openbar_festa50: 30,
          openbar_festa50_price: 65,
          drinks_festa50: 30,
          drinks_festa50_price: 80,
          camisa_festa50: 30,
          camisa_festa50_price: 65,
          dj_festa50: 1,
          dj_festa50_price: 660,
        },
      },
    });

    const totals = calculateSummaryStepEventTotals(event, formValues, {});

    expect(totals).toEqual({ total: 30151, discountedTotal: 30151 });
  });

  it("ItemsStep de festa_50 acompanha o total canonicalizado", () => {
    const event = getEvent("festa_50");
    const formValues = baseForm({
      studentsQuantity: 10,
      participation_festa_50: 30,
      items: {
        festa_50: {
          buffet_festa50: 30,
          buffet_festa50_price: 65,
          openbar_festa50: 30,
          openbar_festa50_price: 65,
          drinks_festa50: 30,
          drinks_festa50_price: 80,
          camisa_festa50: 30,
          camisa_festa50_price: 65,
          dj_festa50: 1,
          dj_festa50_price: 660,
        },
      },
    });

    const total = calculateItemsStepEventTotal(event, formValues, {}, {});

    expect(total).toBe(30151);
  });

  it("SummaryStep de festa_365 preserva total canonicalizado", () => {
    const event = getEvent("festa_365");
    const formValues = baseForm({
      studentsQuantity: 10,
      participation_festa_365: 30,
      items: {
        festa_365: {
          buffet_festa365: 30,
          buffet_festa365_price: 65,
          openbar_festa365: 30,
          openbar_festa365_price: 65,
          drinks_festa365: 30,
          drinks_festa365_price: 80,
          camisa_festa365: 30,
          camisa_festa365_price: 65,
          dj_festa365: 1,
          dj_festa365_price: 700,
        },
      },
    });

    const totals = calculateSummaryStepEventTotals(event, formValues, {});

    expect(totals).toEqual({ total: 30195, discountedTotal: 30195 });
  });

  it("ItemsStep de festa_365 acompanha o total canonicalizado", () => {
    const event = getEvent("festa_365");
    const formValues = baseForm({
      studentsQuantity: 10,
      participation_festa_365: 30,
      items: {
        festa_365: {
          buffet_festa365: 30,
          buffet_festa365_price: 65,
          openbar_festa365: 30,
          openbar_festa365_price: 65,
          drinks_festa365: 30,
          drinks_festa365_price: 80,
          camisa_festa365: 30,
          camisa_festa365_price: 65,
          dj_festa365: 1,
          dj_festa365_price: 700,
        },
      },
    });

    const total = calculateItemsStepEventTotal(event, formValues, {}, {});

    expect(total).toBe(30195);
  });

  it("SummaryStep de cerimonia_colacao preserva total canonicalizado", () => {
    const event = getEvent("cerimonia_colacao");
    const formValues = baseForm({
      studentsQuantity: 10,
      participation_colacao: 30,
      items: {
        cerimonia_colacao: {
          becas_formandos_cerimonia: 30,
          becas_formandos_cerimonia_price: 80,
          canudos_cerimonia: 30,
          canudos_cerimonia_price: 35,
          locacao_auditorio_cerimonia: 1,
          locacao_auditorio_cerimonia_price: 7000,
          arquibancada_cerimonia: 30,
          arquibancada_cerimonia_price: 25,
          placa_led_cerimonia: 30,
          placa_led_cerimonia_price: 320,
        },
      },
    });

    const totals = calculateSummaryStepEventTotals(event, formValues, {});

    expect(totals).toEqual({ total: 42680, discountedTotal: 42680 });
  });

  it("ItemsStep de cerimonia_colacao acompanha o total canonicalizado", () => {
    const event = getEvent("cerimonia_colacao");
    const formValues = baseForm({
      studentsQuantity: 10,
      participation_colacao: 30,
      items: {
        cerimonia_colacao: {
          becas_formandos_cerimonia: 30,
          becas_formandos_cerimonia_price: 80,
          canudos_cerimonia: 30,
          canudos_cerimonia_price: 35,
          locacao_auditorio_cerimonia: 1,
          locacao_auditorio_cerimonia_price: 7000,
          arquibancada_cerimonia: 30,
          arquibancada_cerimonia_price: 25,
          placa_led_cerimonia: 30,
          placa_led_cerimonia_price: 320,
        },
      },
    });

    const total = calculateItemsStepEventTotal(event, formValues, {}, {});

    expect(total).toBe(42680);
  });

  it("SummaryStep de colacao_descerramento preserva total canonicalizado", () => {
    const event = getEvent("colacao_descerramento");
    const formValues = baseForm({
      studentsQuantity: 10,
      participation_colacao_descerramento: 30,
      items: {
        colacao_descerramento: {
          recepcionista_apoio_col: 1,
          recepcionista_apoio_col_price: 320,
          placa_formatura_col_price: 2750,
          replica_placa_col: 30,
          replica_placa_col_price: 65,
          becas_formandos_col: 30,
          becas_formandos_col_price: 80,
          canudos_col: 30,
          canudos_col_price: 65,
          locacao_auditorio_col: 1,
          locacao_auditorio_col_price: 7000,
          painel_led_col: 30,
          painel_led_col_price: 320,
          arquibancada_col: 30,
          arquibancada_col_price: 25,
        },
      },
    });

    const totals = calculateSummaryStepEventTotals(event, formValues, {});

    expect(totals).toEqual({ total: 58784, discountedTotal: 58784 });
  });

  it("ItemsStep de colacao_descerramento acompanha o total canonicalizado", () => {
    const event = getEvent("colacao_descerramento");
    const formValues = baseForm({
      studentsQuantity: 10,
      participation_colacao_descerramento: 30,
      items: {
        colacao_descerramento: {
          recepcionista_apoio_col: 1,
          recepcionista_apoio_col_price: 320,
          placa_formatura_col_price: 2750,
          replica_placa_col: 30,
          replica_placa_col_price: 65,
          becas_formandos_col: 30,
          becas_formandos_col_price: 80,
          canudos_col: 30,
          canudos_col_price: 65,
          locacao_auditorio_col: 1,
          locacao_auditorio_col_price: 7000,
          painel_led_col: 30,
          painel_led_col_price: 320,
          arquibancada_col: 30,
          arquibancada_col_price: 25,
        },
      },
    });

    const total = calculateItemsStepEventTotal(event, formValues, {}, {});

    expect(total).toBe(58784);
  });

  it("Ensaio 50 preserva total esperado na engine canonica", () => {
    const event = getEvent("ensaio_50");
    const formValues = baseForm({
      participation_ensaio_50: 15,
      items: {
        ensaio_50: {
          coffee_break_ensaio50: 15,
          coffee_break_ensaio50_price: 65,
        },
      },
    });

    const totals = calculateSummaryStepEventTotals(event, formValues, {});

    expect(totals).toEqual({ total: 21972.5, discountedTotal: 21972.5 });
  });

  it("Ensaio 365 preserva total esperado na engine canonica", () => {
    const event = getEvent("ensaio_365");
    const formValues = baseForm({
      participation_ensaio_365: 18,
      items: {
        ensaio_365: {
          coffee_break_ensaio365: 18,
          coffee_break_ensaio365_price: 65,
        },
      },
    });

    const totals = calculateSummaryStepEventTotals(event, formValues, {});

    expect(totals).toEqual({ total: 22187, discountedTotal: 22187 });
  });

  it("Ensaio FotogrÃ¡fico preserva total esperado na engine canonica", () => {
    const event = getEvent("ensaio_fotografico");
    const formValues = baseForm({
      participation_ensaio: 20,
      items: {
        ensaio_fotografico: {
          beca_formatura_ensaio: 20,
          beca_formatura_ensaio_price: 80,
          coffee_break_ensaio: 20,
          coffee_break_ensaio_price: 65,
        },
      },
    });

    const totals = calculateSummaryStepEventTotals(event, formValues, {});

    expect(totals).toEqual({ total: 24090, discountedTotal: 24090 });
  });
});
