/**
 * Resumo final · Condições de Pagamento.
 *
 * O quadro base são as solenidades: todos os eventos que NÃO fecham quadro
 * próprio. Cada evento marcado com `closesSummaryBlock` no cadastro vira um
 * quadro a mais, ACUMULADO: "até o baile" é o pacote inteiro mais o baile, e
 * não o baile sozinho — é a conta que o aluno paga se levar aquele evento.
 *
 * O valor por aluno (`totalPerStudent` e as parcelas) é acumulado; `total`, o
 * valor cheio usado na seção "Valor Total do Orçamento", continua ISOLADO,
 * senão o total geral de lá contaria as solenidades duas vezes.
 *
 * Nenhum evento marcado = um quadro só com o total, que é o comportamento
 * histórico. Por isso a flag nasce desligada: nada muda até alguém marcar.
 */

export type SummaryBlock = {
  /** Id do evento que fecha o quadro; "total" no quadro base. */
  key: string;
  /** Ex.: "Valor total até a colação / aluno". */
  totalLabel: string;
  /** Rótulo do valor cheio: "Total geral das solenidades". */
  totalsLabel: string;
  /** Só o complemento, para compor outros rótulos: "até a colação". */
  shortLabel: string;
  /**
   * Uma linha dizendo o que entra no quadro ("Não inclui o BAILE"). Só existe
   * quando há mais de um quadro — com um só não há o que desambiguar.
   */
  caption?: string;
  /** Valor cheio em reais, só deste quadro (não acumulado). */
  total: number;
  /** Por aluno, ACUMULADO: este quadro mais todos os anteriores. */
  totalPerStudent: number;
  installmentPerStudent: number;
  /** Parcela com os 10% de desconto até o vencimento. */
  discountedInstallmentPerStudent: number;
};

export type SummaryBlockEvent = {
  eventId: string;
  title: string;
  /** Valor cheio do evento, em reais. */
  total: number;
  valuePerStudent: number;
  closesSummaryBlock?: boolean;
  summaryBlockLabel?: string | null;
};

/** Rótulo do quadro base — o pacote até a colação, não um evento específico. */
export const BASE_SUMMARY_BLOCK_LABEL = "até a colação";

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * O rótulo do cadastro é só o complemento ("até o baile"), mas quem preenche
 * costuma digitar a frase inteira ("VALOR TOTAL ATÉ O BAILE") e o resultado
 * saía duplicado. Tira o prefixo quando ele vem junto.
 */
function stripLabelPrefix(label: string) {
  return label
    .replace(/^\s*valor\s+(total|por\s+formando)\s*/i, "")
    .replace(/^\s*valor\s+/i, "")
    .trim();
}

function resolveShortLabel(event: SummaryBlockEvent) {
  const custom = stripLabelPrefix(event.summaryBlockLabel ?? "");
  if (custom) return custom;
  // Sem rótulo no cadastro, monta a partir do nome do evento.
  return `até ${event.title.trim().toLowerCase()}`;
}

function makeBlock(args: {
  key: string;
  shortLabel: string;
  totalsLabel: string;
  total: number;
  totalPerStudent: number;
  installments: number;
  caption?: string;
}): SummaryBlock {
  const { key, shortLabel, totalsLabel, total, totalPerStudent, installments, caption } =
    args;
  const installmentPerStudent =
    installments > 0 ? roundCurrency(totalPerStudent / installments) : 0;
  return {
    key,
    shortLabel,
    totalsLabel,
    caption,
    total: roundCurrency(total),
    // O "/ aluno" no fim evita a leitura de que é o total do orçamento — a
    // seção de totais, logo acima, mostra valores muito maiores.
    totalLabel: `Valor total ${shortLabel} / aluno`,
    totalPerStudent: roundCurrency(totalPerStudent),
    installmentPerStudent,
    discountedInstallmentPerStudent: roundCurrency(installmentPerStudent * 0.9),
  };
}

/** O orçamento inteiro: solenidades + todos os eventos que fecham quadro. */
export function sumSummaryBlocks(blocks: SummaryBlock[]) {
  // `total` é isolado por quadro, então soma; o por aluno já vem acumulado, e
  // o último quadro é o acumulado de tudo — somar contaria em dobro.
  const last = blocks[blocks.length - 1];
  return {
    total: roundCurrency(blocks.reduce((sum, block) => sum + block.total, 0)),
    totalPerStudent: last ? last.totalPerStudent : 0,
  };
}

export function buildSummaryBlocks(args: {
  /** Eventos na ordem de exibição do orçamento. */
  events: SummaryBlockEvent[];
  installments: number;
}): SummaryBlock[] {
  const { events, installments } = args;
  const closing = events.filter((event) => event.closesSummaryBlock);
  const packageEvents = events.filter((event) => !event.closesSummaryBlock);

  // O quadro base soma tudo que não fecha quadro próprio.
  const baseTotal = packageEvents.reduce(
    (sum, event) => sum + event.valuePerStudent,
    0,
  );
  const baseFullTotal = packageEvents.reduce((sum, event) => sum + event.total, 0);

  // Com um quadro só não há ambiguidade: a legenda só aparece quando existem
  // dois ou mais e o leitor precisa saber o que entra em cada um.
  if (closing.length === 0) {
    return [
      makeBlock({
        key: "total",
        shortLabel: BASE_SUMMARY_BLOCK_LABEL,
        totalsLabel: "Total geral do orçamento",
        total: baseFullTotal,
        totalPerStudent: baseTotal,
        installments,
      }),
    ];
  }

  const base = makeBlock({
    key: "total",
    shortLabel: BASE_SUMMARY_BLOCK_LABEL,
    totalsLabel: "Total geral das solenidades",
    total: baseFullTotal,
    totalPerStudent: baseTotal,
    installments,
    // Legenda do quadro base: o pacote de solenidades, sem os eventos que
    // ganharam conta própria.
    caption: `Valor total ${BASE_SUMMARY_BLOCK_LABEL}`,
  });

  // Cada evento marcado acumula sobre o quadro anterior: "até o baile" é o
  // pacote inteiro mais o baile, porque é isso que o aluno paga.
  let acumulado = baseTotal;
  const extras = closing.map((event) => {
    acumulado += event.valuePerStudent;
    return makeBlock({
      key: event.eventId,
      shortLabel: resolveShortLabel(event),
      totalsLabel: `Total geral — ${event.title.trim()}`,
      // Isolado: a seção de totais soma os quadros para o total geral.
      total: event.total,
      totalPerStudent: acumulado,
      installments,
      caption: `Valor total ${BASE_SUMMARY_BLOCK_LABEL} + ${event.title.trim()}`,
    });
  });

  return [base, ...extras];
}
