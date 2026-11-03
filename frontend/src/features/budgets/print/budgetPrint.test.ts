import { describe, expect, it } from "vitest";
import type { Budget } from "../../../store/budgetStore";
import type { EventType } from "../data/mockData";
import {
  buildBudgetPrintFileName,
  buildBudgetPrintDocument,
  generateBudgetPrintHtml,
  generateBudgetPrintHtmlV2,
} from "./budgetPrint";

describe("budgetPrint", () => {
  it("evento marcado no cadastro vira um quadro proprio no resumo final", () => {
    // O corte vem da flag do cadastro, nao do nome do evento.
    const catalog = [
      {
        id: "ev_colacao",
        title: "COLAÇÃO DE GRAU",
        items: [{ id: "convite", name: "Convite", unitPrice: 140, fixedQty: 1 }],
      },
      {
        id: "ev_baile",
        title: "BAILE",
        closes_summary_block: true,
        summary_block_label: "até o baile",
        items: [{ id: "buffet", name: "Buffet", unitPrice: 230, fixedQty: 1 }],
      },
    ] as unknown as EventType[];

    const budget: Budget = {
      id: "budget-baile",
      instituicao: "UNIDEMO",
      curso: "Medicina 2026",
      comissao: "Comissao Alfa",
      telefone: "(11) 99999-0000",
      controle: "CTRL-BAILE",
      createdAt: "2026-03-20T10:00:00.000Z",
      status: "APPROVED",
      totalValue: 0,
      data: {
        eventStartDate: "2026-10-10",
        eventEndDate: "2026-12-12",
        studentsQuantity: 10,
        selectedEvents: ["ev_colacao", "ev_baile"],
        items: {},
      },
    };

    const doc = buildBudgetPrintDocument(budget, catalog);
    const [colacao, baile] = doc.events;
    const [base, soBaile] = doc.summaryBlocks;

    expect(doc.summaryBlocks).toHaveLength(2);
    // O pacote e, acumulado, o pacote mais o evento marcado.
    expect(base.totalPerStudent).toBeCloseTo(colacao.valuePerStudent, 2);
    expect(soBaile.totalPerStudent).toBeCloseTo(
      colacao.valuePerStudent + baile.valuePerStudent,
      2,
    );

    // Mesmas parcelas nos dois quadros: muda so o total e o valor da parcela.
    for (const block of doc.summaryBlocks) {
      expect(block.installmentPerStudent).toBeCloseTo(
        block.totalPerStudent / doc.installments,
        2,
      );
      expect(block.discountedInstallmentPerStudent).toBeCloseTo(
        block.installmentPerStudent * 0.9,
        2,
      );
    }

    for (const view of ["TEAM", "CLIENT"] as const) {
      const v2 = generateBudgetPrintHtmlV2(doc, view);
      expect(v2).toContain("Valor total até o baile / aluno");
      // Valor cheio do orcamento, acima do resumo de pagamento.
      expect(v2).toContain("Valor Total do Orçamento");
      expect(v2).toContain("Total geral das solenidades");
      expect(v2).toContain("Total geral do orçamento");

      const legacy = generateBudgetPrintHtml(doc, view);
      expect(legacy).toContain("até o baile");
      expect(legacy).toContain("Valor Total do Orçamento");
    }
  });

  it("sem evento marcado, segue com um unico quadro de resumo", () => {
    const catalog = [
      {
        id: "ev_colacao",
        title: "COLAÇÃO DE GRAU",
        items: [{ id: "convite", name: "Convite", unitPrice: 140, fixedQty: 1 }],
      },
    ] as unknown as EventType[];

    const budget: Budget = {
      id: "budget-sem-baile",
      instituicao: "UNIDEMO",
      curso: "Medicina 2026",
      comissao: "Comissao Alfa",
      telefone: "(11) 99999-0000",
      controle: "CTRL-SB",
      createdAt: "2026-03-20T10:00:00.000Z",
      status: "APPROVED",
      totalValue: 0,
      data: {
        eventStartDate: "2026-10-10",
        eventEndDate: "2026-12-12",
        studentsQuantity: 10,
        selectedEvents: ["ev_colacao"],
        items: {},
      },
    };

    const doc = buildBudgetPrintDocument(budget, catalog);
    expect(doc.summaryBlocks).toHaveLength(1);
    expect(doc.summaryBlocks[0].totalPerStudent).toBeCloseTo(
      doc.totalValuePerStudent,
      2,
    );
    expect(generateBudgetPrintHtmlV2(doc, "CLIENT")).not.toContain("até o baile");
  });

  it("usa o numero de parcelas definido manualmente no lugar do calculo por datas", () => {
    const base: Budget = {
      id: "budget-parcelas",
      instituicao: "UNIDEMO",
      curso: "Medicina 2026",
      comissao: "Comissao Alfa",
      telefone: "(11) 99999-0000",
      controle: "CTRL-09",
      createdAt: "2026-03-20T10:00:00.000Z",
      status: "APPROVED",
      totalValue: 1000,
      data: {
        eventStartDate: "2026-10-10",
        eventEndDate: "2026-12-12",
        studentsQuantity: 10,
        selectedEvents: [],
        items: {},
      },
    };

    // Sem override: 3 parcelas (outubro -> dezembro).
    expect(buildBudgetPrintDocument(base).installments).toBe(3);

    const withOverride: Budget = {
      ...base,
      data: { ...base.data, installmentsOverride: 24 },
    };
    expect(buildBudgetPrintDocument(withOverride).installments).toBe(24);
  });

  it("fecha cada evento com o valor do evento e o valor por formando", () => {
    const budget: Budget = {
      id: "budget-por-evento",
      instituicao: "UNIDEMO",
      curso: "Medicina 2026",
      comissao: "Comissao Alfa",
      telefone: "(11) 99999-0000",
      controle: "CTRL-10",
      createdAt: "2026-03-20T10:00:00.000Z",
      status: "APPROVED",
      totalValue: 800,
      data: {
        eventStartDate: "2026-10-10",
        eventEndDate: "2026-10-12",
        studentsQuantity: 10,
        selectedEvents: ["descerramento_placa"],
        participation_descerramento: 10,
        items: {
          descerramento_placa: {
            replica_placa: 10,
            replica_placa_price: 65,
          },
        },
      },
    };

    const printable = buildBudgetPrintDocument(budget);
    const event = printable.events[0];
    // Valor por formando do evento = total do evento / participantes DELE.
    expect(event.finalTotal).toBeGreaterThan(0);
    expect(event.valuePerStudent).toBeCloseTo(event.finalTotal / event.participants, 2);

    // Modelo moderno: linha-resumo ao final do card (casa a marcacao, nao o CSS).
    for (const view of ["TEAM", "CLIENT"] as const) {
      const html = generateBudgetPrintHtmlV2(printable, view);
      const sumLines = html.match(/<div class="v2-ev-sumline">/g) ?? [];
      expect(sumLines).toHaveLength(printable.events.length);
      expect(html).toContain("Por formando");
    }

    // Modelo legado: rodape do evento ja traz os dois valores.
    for (const view of ["TEAM", "CLIENT"] as const) {
      const legacy = generateBudgetPrintHtml(printable, view);
      expect(legacy).toContain("Valor final do evento");
      expect(legacy).toContain("Valor por formando");
    }
  });

  it("mantem subtotal do evento, desconto por item e desconto global distintos na impressao", () => {
    const budget: Budget = {
      id: "budget-1",
      instituicao: "UNIDEMO",
      curso: "Medicina 2026",
      comissao: "Comissao Alfa",
      telefone: "(11) 99999-0000",
      controle: "CTRL-01",
      createdAt: "2026-03-20T10:00:00.000Z",
      status: "APPROVED",
      totalValue: 8279.25,
      discountPercent: 5,
      approvedItemDiscounts: {
        "descerramento_placa-coffee_break": 10,
      },
      data: {
        id: "budget-1",
        instituicao: "UNIDEMO",
        curso: "Medicina 2026",
        comissao: "Comissao Alfa",
        telefone: "(11) 99999-0000",
        controle: "CTRL-01",
        eventStartDate: "2026-10-10",
        eventEndDate: "2026-10-12",
        studentsQuantity: 10,
        selectedEvents: ["descerramento_placa"],
        participation_descerramento: 10,
        items: {
          descerramento_placa: {
            replica_placa: 10,
            replica_placa_price: 65,
            coffee_break: 10,
            coffee_break_price: 140,
          },
        },
        customItems: {
          descerramento_placa: {
            added: [
              {
                id: "extra-foto",
                name: "Item adicional",
                quantity: 2,
                unitPrice: 75,
              },
            ],
            removedIds: [],
          },
        },
      },
    };

    const printable = buildBudgetPrintDocument(budget);
    const printFileName = buildBudgetPrintFileName(printable);

    expect(printable.studentsQuantity).toBe(10);
    expect(printable.subtotal).toBe(8855);
    expect(printable.discountedSubtotal).toBe(8715);
    expect(printable.itemDiscountValue).toBe(140);
    expect(printable.finalTotal).toBe(8279.25);
    expect(printable.discountValue).toBe(435.75);
    expect(printable.participations).toEqual([
      {
        eventId: "descerramento_placa",
        label: "Descerramento de Placa",
        quantity: 10,
      },
    ]);

    const event = printable.events[0];
    expect(event.originalTotal).toBe(8855);
    expect(event.finalTotal).toBe(8715);

    const coffeeBreakRow = event.rows.find(
      (row) => row.label === "Coffee Break para Formandos",
    );
    expect(coffeeBreakRow?.unitPriceLabel).toMatch(/R\$\s*140,00/);
    expect(coffeeBreakRow?.originalTotalLabel).toMatch(/R\$\s*1\.400,00/);
    expect(coffeeBreakRow?.finalTotalLabel).toMatch(/R\$\s*1\.260,00/);
    expect(
      event.rows.some((row) => row.label.includes("Composição base")),
    ).toBe(false);

    const teamHtml = generateBudgetPrintHtml(printable, "TEAM");
    expect(teamHtml).toContain("Subtotal do evento");
    expect(teamHtml).toContain("Valor final do evento");
    expect(teamHtml).toContain("Descontos por item (Aprovados)");
    expect(teamHtml).toContain("Desconto global (5%)");
    expect(teamHtml).toContain("size: A4;");
    expect(teamHtml).toContain("margin: 0;");
    expect(teamHtml).toContain("page-break-inside: avoid;");
    expect(teamHtml).toContain("display: table-header-group;");
    expect(teamHtml).toContain("border-collapse: separate;");
    expect(teamHtml).toContain("border-bottom: 0;");
    expect(teamHtml).toContain("border-top-left-radius: 13px;");
    expect(teamHtml).toContain("border-top-right-radius: 13px;");
    expect(teamHtml).toContain('class="letterhead"');
    // Espaço do timbrado reservado via running header/footer (.print-frame),
    // que se repete em todas as páginas no WebKit.
    expect(teamHtml).toContain('class="print-frame"');
    expect(teamHtml).toContain('class="frame-spacer-top"');
    expect(teamHtml).toContain("display: table-footer-group;");
    expect(teamHtml).toContain("z-index: 20;");
    expect(teamHtml).not.toContain('class="watermark"');
    expect(teamHtml).toContain("Quantidade de formandos");
    expect(teamHtml).toContain("event-summary-primary");
    expect(teamHtml.indexOf("Valor final do evento")).toBeLessThan(
      teamHtml.indexOf("Quantidade de formandos"),
    );
    expect(teamHtml.indexOf("Quantidade de formandos")).toBeLessThan(
      teamHtml.indexOf("Valor por formando"),
    );
    expect(teamHtml).toContain("Orçamento Orça Eventos");
    expect(printFileName).toBe("Orcamento - Medicina 2026 - UNIDEMO - Comissao Alfa");
    expect(teamHtml).toContain(
      "<title>Orcamento - Medicina 2026 - UNIDEMO - Comissao Alfa</title>",
    );
    expect(teamHtml).toContain("@media screen and (max-width: 720px)");

    const clientHtml = generateBudgetPrintHtml(printable, "CLIENT");
    expect(clientHtml).toContain("Valor final do evento");
    expect(clientHtml).toContain("Quantidade de formandos");
    expect(clientHtml.indexOf("Valor final do evento")).toBeLessThan(
      clientHtml.indexOf("Quantidade de formandos"),
    );
    expect(clientHtml.indexOf("Quantidade de formandos")).toBeLessThan(
      clientHtml.indexOf("Valor por formando"),
    );
    expect(clientHtml).not.toContain("Subtotal do evento");
    expect(clientHtml).not.toContain("Qtd. de eventos");
    expect(clientHtml).not.toContain("Qtd. geral de formandos");
    expect(clientHtml).not.toContain("<td>Valor final</td>");
    expect(clientHtml).toContain("UNIDEMO");
    expect(clientHtml).not.toContain("Valor unitário");
    expect(clientHtml).toContain("Coffee Break para Formandos");
    expect(clientHtml).toContain("Valor total até a colação / aluno");
    expect(clientHtml).toContain("Quantidade de parcelas");
    expect(clientHtml).toContain("Valor da parcela com 10% de desconto");
    expect(clientHtml).toContain("summary-highlight");
    expect(clientHtml).not.toContain("Valor da parcela por formando (");
    expect(clientHtml).toContain(
      '<th class="right quantityCol">Quantidade</th>',
    );
  });

  it("remove caracteres invalidos do nome sugerido para salvar o PDF", () => {
    const budget: Budget = {
      id: "budget-file-name",
      instituicao: "Faculdade / Exemplo",
      curso: "Medicina: Turma 2026?",
      comissao: "Comissao <Alpha>|Beta",
      telefone: "",
      controle: "CTRL/03",
      createdAt: "2026-03-20T10:00:00.000Z",
      status: "APPROVED",
      totalValue: 0,
      discountPercent: 0,
      data: {
        selectedEvents: [],
      },
    };

    const printable = buildBudgetPrintDocument(budget);

    expect(buildBudgetPrintFileName(printable)).toBe(
      "Orcamento - Medicina Turma 2026 - Faculdade Exemplo - Comissao Alpha Beta",
    );
  });

  it("imprime os itens do culto cortesia com a marcacao de cortesia", () => {
    const budget: Budget = {
      id: "budget-culto",
      instituicao: "Faculdade Exemplo",
      curso: "Direito 2026",
      comissao: "Comissao Beta",
      telefone: "(11) 98888-0000",
      controle: "CTRL-02",
      createdAt: "2026-03-20T10:00:00.000Z",
      status: "APPROVED",
      totalValue: 0,
      discountPercent: 0,
      data: {
        id: "budget-culto",
        instituicao: "Faculdade Exemplo",
        curso: "Direito 2026",
        comissao: "Comissao Beta",
        telefone: "(11) 98888-0000",
        controle: "CTRL-02",
        eventStartDate: "2026-10-10",
        eventEndDate: "2026-10-12",
        studentsQuantity: 20,
        selectedEvents: ["culto_cortesia"],
        participation_culto: 20,
        items: {
          culto_cortesia: {},
        },
        customItems: {},
      },
    };

    const printable = buildBudgetPrintDocument(budget);
    const event = printable.events[0];

    expect(event.title).toContain("Culto");
    expect(event.rows.length).toBeGreaterThan(0);
    expect(
      event.rows.some(
        (row) =>
          row.kind === "item" &&
          row.label.includes("Arranjos para Nave da Igreja") &&
          row.finalTotalLabel === "Cortesia",
      ),
    ).toBe(true);

    const clientHtml = generateBudgetPrintHtml(printable, "CLIENT");
    const teamHtml = generateBudgetPrintHtml(printable, "TEAM");

    expect(clientHtml).toContain("Culto");
    expect(clientHtml).toContain("Cortesia");
    expect(clientHtml).toContain("Arranjos para Nave da Igreja");
    expect(clientHtml).toContain('class="note note-strong"');
    expect(clientHtml).toContain("<td class=\"right quantityCol\">Cortesia</td>");
    expect(clientHtml).toContain("Quantidade de formandos");
    expect(teamHtml).toContain("Cortesia");
    expect(teamHtml).toContain('class="note note-strong"');
    expect(teamHtml).toContain("Quantidade de formandos");
    expect(teamHtml).not.toContain("R$ 0,00");
  });

  it("imprime o evento 100 dias como cortesia com open bar na quantidade dos formandos", () => {
    const budget: Budget = {
      id: "budget-100",
      instituicao: "Faculdade Exemplo",
      curso: "Odontologia 2026",
      comissao: "Comissao Gama",
      telefone: "(11) 97777-0000",
      controle: "CTRL-100",
      createdAt: "2026-03-20T10:00:00.000Z",
      status: "APPROVED",
      totalValue: 0,
      discountPercent: 0,
      data: {
        id: "budget-100",
        instituicao: "Faculdade Exemplo",
        curso: "Odontologia 2026",
        comissao: "Comissao Gama",
        telefone: "(11) 97777-0000",
        controle: "CTRL-100",
        eventStartDate: "2026-10-10",
        eventEndDate: "2026-10-12",
        studentsQuantity: 35,
        selectedEvents: ["evento_100_dias"],
        participation_evento_100: 35,
        items: {
          evento_100_dias: {},
        },
        customItems: {},
      },
    };

    const printable = buildBudgetPrintDocument(budget);
    const event = printable.events[0];
    const openBarRow = event.rows.find(
      (row) => row.kind === "item" && row.label.includes("Open Bar para 04 Horas"),
    );

    expect(openBarRow?.quantityLabel).toBe("35");
    expect(openBarRow?.finalTotalLabel).toBe("Cortesia");

    const clientHtml = generateBudgetPrintHtml(printable, "CLIENT");
    const teamHtml = generateBudgetPrintHtml(printable, "TEAM");

    expect(clientHtml).toContain("Evento 100 Dias - Cortesia");
    expect(clientHtml).toContain("Open Bar para 04 Horas");
    expect(clientHtml).not.toContain("R$ 0,00");
    expect(teamHtml).toContain("Cortesia");
  });

  it("mostra o valor de itens marcados 'valor aparece para cliente' na visao do cliente", () => {
    const catalog: EventType[] = [
      {
        id: "evento_teste",
        title: "Evento Teste",
        items: [
          { id: "item_visivel", name: "Item Visivel Cliente", unitPrice: 150, valueVisibleToClient: true },
          { id: "item_oculto", name: "Item Oculto Cliente", unitPrice: 230 },
        ],
      },
    ];

    const budget: Budget = {
      id: "budget-vis",
      instituicao: "Faculdade Exemplo",
      curso: "Enfermagem 2026",
      comissao: "Comissao Delta",
      telefone: "(11) 96666-0000",
      controle: "CTRL-VIS",
      createdAt: "2026-03-20T10:00:00.000Z",
      status: "APPROVED",
      totalValue: 500,
      discountPercent: 0,
      data: {
        id: "budget-vis",
        eventStartDate: "2026-10-10",
        eventEndDate: "2026-10-12",
        studentsQuantity: 10,
        selectedEvents: ["evento_teste"],
        participation_evento_teste: 10,
        items: {
          evento_teste: {
            item_visivel: 1,
            item_visivel_price: 150,
            item_oculto: 1,
            item_oculto_price: 230,
          },
        },
        customItems: {},
      },
    };

    const printable = buildBudgetPrintDocument(budget, catalog);
    const event = printable.events[0];
    const visRow = event.rows.find((row) => row.label.includes("Visivel"));
    const ocultoRow = event.rows.find((row) => row.label.includes("Oculto"));

    expect(visRow?.clientVisibleValue).toBe(true);
    expect(Boolean(ocultoRow?.clientVisibleValue)).toBe(false);

    const clientHtml = generateBudgetPrintHtml(printable, "CLIENT");
    // Item marcado expoe o valor (linha estilizada) na visao do cliente.
    expect(clientHtml).toContain("client-item-value");
    expect(clientHtml).toMatch(/R\$\s*150,00/);
    // Item nao marcado NAO expoe seu valor na visao do cliente.
    expect(clientHtml).not.toMatch(/R\$\s*230,00/);
  });
});
