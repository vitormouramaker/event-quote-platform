import { describe, expect, it } from "vitest";
import {
  buildSummaryBlocks,
  sumSummaryBlocks,
  type SummaryBlockEvent,
} from "./summaryBlocks";

const FORMANDOS = 10;
const evento = (
  eventId: string,
  title: string,
  valuePerStudent: number,
  extra: Partial<SummaryBlockEvent> = {},
): SummaryBlockEvent => ({
  eventId,
  title,
  valuePerStudent,
  total: valuePerStudent * FORMANDOS,
  ...extra,
});

const pacote: SummaryBlockEvent[] = [
  evento("1", "DESCERRAMENTO DE PLACA", 100),
  evento("2", "COLAÇÃO DE GRAU", 200),
  evento("3", "FESTA 50%", 300),
];

const baile: SummaryBlockEvent = evento("9", "BAILE", 400, {
  closesSummaryBlock: true,
  summaryBlockLabel: "até o baile",
});

describe("resumo final · condições de pagamento", () => {
  it("sem evento marcado, um quadro so com o pacote inteiro", () => {
    const blocks = buildSummaryBlocks({ events: pacote, installments: 10 });

    expect(blocks).toHaveLength(1);
    expect(blocks[0].totalLabel).toBe("Valor total até a colação / aluno");
    expect(blocks[0].totalPerStudent).toBe(600);
    expect(blocks[0].installmentPerStudent).toBe(60);
    expect(blocks[0].discountedInstallmentPerStudent).toBe(54);
  });

  it("o quadro do evento marcado acumula o pacote inteiro mais ele", () => {
    const [base, ateOBaile] = buildSummaryBlocks({
      events: [...pacote, baile],
      installments: 10,
    });

    // "Até o baile" e o que o aluno paga levando o baile: pacote + baile.
    expect(base.totalLabel).toBe("Valor total até a colação / aluno");
    expect(base.totalPerStudent).toBe(600);
    expect(ateOBaile.totalLabel).toBe("Valor total até o baile / aluno");
    expect(ateOBaile.totalPerStudent).toBe(1000);

    // Mesmas parcelas nos dois: muda so o total e o valor da parcela.
    expect(base.installmentPerStudent).toBe(60);
    expect(ateOBaile.installmentPerStudent).toBe(100);
  });

  it("a soma dos quadros e o orcamento inteiro", () => {
    const blocks = buildSummaryBlocks({
      events: [...pacote, baile],
      installments: 10,
    });

    expect(sumSummaryBlocks(blocks)).toEqual({
      total: 10000,
      totalPerStudent: 1000,
    });
  });

  it("a ordem do evento marcado nao muda o quadro base", () => {
    // Mesmo com o baile no meio do orcamento, ele sai do "ate a colacao".
    const blocks = buildSummaryBlocks({
      events: [pacote[0], baile, pacote[1], pacote[2]],
      installments: 10,
    });

    expect(blocks[0].totalPerStudent).toBe(600);
    expect(blocks[1].totalPerStudent).toBe(1000);
  });

  it("varios eventos marcados geram um quadro acumulado para cada um", () => {
    const blocks = buildSummaryBlocks({
      events: [
        ...pacote,
        baile,
        evento("10", "AFTER PARTY", 150, {
          closesSummaryBlock: true,
          summaryBlockLabel: "até o after",
        }),
      ],
      installments: 10,
    });

    // Cada marcado soma sobre o quadro anterior.
    expect(blocks.map((block) => block.totalPerStudent)).toEqual([600, 1000, 1150]);
    expect(blocks.map((block) => block.shortLabel)).toEqual([
      "até a colação",
      "até o baile",
      "até o after",
    ]);
  });

  it("tira o prefixo quando o rotulo do cadastro vem com a frase inteira", () => {
    // Quem preenche costuma digitar "VALOR TOTAL ATE O BAILE"; sem isso o
    // resultado saía "Valor total VALOR TOTAL ATÉ O BAILE".
    const blocks = buildSummaryBlocks({
      events: [
        ...pacote,
        { ...baile, summaryBlockLabel: "VALOR TOTAL ATÉ O BAILE" },
      ],
      installments: 10,
    });

    expect(blocks[1].totalLabel).toBe("Valor total ATÉ O BAILE / aluno");
  });

  it("traz tambem o valor cheio de cada quadro, nao so o por formando", () => {
    const [base, soBaile] = buildSummaryBlocks({
      events: [...pacote, baile],
      installments: 10,
    });

    // O valor cheio segue ISOLADO: a secao de totais soma os quadros, e com
    // ele acumulado o pacote entraria duas vezes no total geral.
    expect(base.total).toBe(6000);
    expect(soBaile.total).toBe(4000);
    expect(base.totalsLabel).toBe("Total geral das solenidades");
    expect(soBaile.totalsLabel).toBe("Total geral — BAILE");
  });

  it("explica em cada quadro o que entra e o que fica de fora", () => {
    const blocks = buildSummaryBlocks({
      events: [...pacote, baile],
      installments: 10,
    });

    expect(blocks[0].caption).toBe("Valor total até a colação");
    expect(blocks[1].caption).toBe("Valor total até a colação + BAILE");
  });

  it("com um quadro so nao tem legenda: nao ha o que desambiguar", () => {
    const blocks = buildSummaryBlocks({ events: pacote, installments: 10 });
    expect(blocks[0].caption).toBeUndefined();
  });

  it("sem rotulo no cadastro, usa o nome do evento", () => {
    const blocks = buildSummaryBlocks({
      events: [
        ...pacote,
        evento("9", "BAILE", 400, { closesSummaryBlock: true }),
      ],
      installments: 10,
    });

    expect(blocks[1].totalLabel).toBe("Valor total até baile / aluno");
  });
});
