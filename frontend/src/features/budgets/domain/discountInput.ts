/**
 * Desconto pedido em percentual ou em valor fixo.
 *
 * Todo o cálculo do orçamento (motor de eventos, administração, preço unitário
 * na impressão) trabalha com PERCENTUAL. Para não reescrever esse cálculo, um
 * desconto em reais é traduzido aqui para o percentual equivalente sobre a
 * base, e é esse percentual que segue para o motor.
 *
 * O valor em reais continua guardado junto do pedido porque:
 *  - é o que o consultor digitou, e é o que as telas devem mostrar;
 *  - o percentual equivalente quase nunca é redondo (R$ 500 de R$ 7.420 são
 *    6,7385...%), então reconstruir os reais a partir de um percentual
 *    arredondado erraria centavos.
 *
 * No desconto GERAL o valor fixo também manda no cálculo: a base do desconto
 * geral muda a cada item mexido no orçamento, e "R$ 1.000 de desconto" tem de
 * continuar R$ 1.000 depois de qualquer edição — um percentual equivalente
 * cresceria junto com o total.
 */

export type DiscountMode = "PERCENT" | "FIXED";

/** Um pedido de desconto como o usuário digitou. */
export type DiscountInput = {
  mode: DiscountMode;
  /** Percentual quando o modo é PERCENT, reais quando é FIXED. */
  value: number;
};

export const DEFAULT_DISCOUNT_MODE: DiscountMode = "PERCENT";

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Normaliza o que vem do banco, do formulário ou de um orçamento antigo.
 * Qualquer coisa que não seja FIXED é percentual — é o comportamento histórico,
 * e é o que mantém os orçamentos salvos antes desta funcionalidade intactos.
 */
export function resolveDiscountMode(raw: unknown): DiscountMode {
  return String(raw ?? "").toUpperCase() === "FIXED" ? "FIXED" : "PERCENT";
}

/**
 * Traduz o pedido no par (percentual, valor) sobre uma base.
 *
 * Com base zero um pedido em reais não tem percentual equivalente: devolve
 * percentual 0 e preserva o valor pedido, para a tela poder avisar em vez de
 * aplicar um desconto que o motor ignoraria.
 */
export function resolveDiscountAmounts(
  base: number,
  input: DiscountInput,
): { percent: number; amount: number } {
  const baseValue = toNumber(base);
  const value = toNumber(input.value);

  if (input.mode === "FIXED") {
    const amount = roundCurrency(value);
    return {
      // Sem arredondar: é esse percentual que reproduz os centavos pedidos.
      percent: baseValue > 0 ? (amount / baseValue) * 100 : 0,
      amount,
    };
  }

  return { percent: value, amount: roundCurrency(baseValue * (value / 100)) };
}

/**
 * O desconto em reais a abater de uma base, respeitando o modo.
 *
 * É o ponto único que o resumo, a prévia, a aprovação e a impressão usam para
 * o desconto GERAL: em FIXED o valor é o pedido (não escala com o total), em
 * PERCENT é o percentual sobre a base.
 */
export function resolveGlobalDiscountValue(
  base: number,
  source: {
    discountPercent?: number | null;
    discountMode?: unknown;
    discountAmount?: number | null;
  },
): number {
  const baseValue = toNumber(base);
  const mode = resolveDiscountMode(source.discountMode);

  if (mode === "FIXED") {
    const amount = roundCurrency(toNumber(source.discountAmount));
    // Nunca passa do total: um desconto fixo salvo antes de o orçamento
    // encolher não pode virar valor final negativo.
    return Math.min(Math.max(amount, 0), Math.max(baseValue, 0));
  }

  return roundCurrency(baseValue * (toNumber(source.discountPercent) / 100));
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

/** Como o pedido aparece nas telas: "10%" ou "R$ 1.234,56". */
export function formatDiscountInput(input: DiscountInput): string {
  if (input.mode === "FIXED") return currencyFormatter.format(toNumber(input.value));
  return `${percentFormatter.format(toNumber(input.value))}%`;
}

/**
 * Como o desconto já aplicado aparece: em FIXED mostra os reais pedidos, em
 * PERCENT mostra o percentual. Serve para rótulos do tipo
 * "Desconto Global Aplicado (...)".
 */
export function formatAppliedDiscount(source: {
  discountPercent?: number | null;
  discountMode?: unknown;
  discountAmount?: number | null;
}): string {
  const mode = resolveDiscountMode(source.discountMode);
  if (mode === "FIXED") {
    return formatDiscountInput({ mode, value: toNumber(source.discountAmount) });
  }
  return formatDiscountInput({ mode, value: toNumber(source.discountPercent) });
}

/** Mensagem de erro do pedido, ou null quando está válido. */
export function validateDiscountInput(
  input: DiscountInput,
  base: number,
): string | null {
  const value = toNumber(input.value);
  if (value <= 0) {
    return input.mode === "FIXED"
      ? "Informe um valor de desconto maior que zero."
      : "Informe um percentual maior que zero.";
  }

  if (input.mode === "PERCENT") {
    return value > 100 ? "Percentual inválido." : null;
  }

  const baseValue = toNumber(base);
  if (baseValue <= 0) {
    return "Sem valor para descontar: ajuste o orçamento antes de pedir um desconto em reais.";
  }
  if (value > baseValue) {
    return `O desconto não pode passar de ${currencyFormatter.format(baseValue)}.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Desconto por item
// ---------------------------------------------------------------------------

/** Os campos de desconto de uma solicitação de item, no formato do store. */
export type ItemDiscountRequestLike = {
  // `unknown` porque o motor de cálculo carrega esses campos como vieram do
  // formulário (podem ser string); a conversão acontece aqui dentro.
  requestedPercentage?: unknown;
  newDiscountPercent?: unknown;
  discountMode?: unknown;
  requestedAmount?: unknown;
  newDiscountAmount?: unknown;
};

/**
 * O desconto que vale hoje: o que o gestor aprovou, senão o que foi pedido.
 * Mantém a unidade original — um pedido em reais aprovado continua em reais.
 */
export function resolveItemDiscountInput(
  request?: ItemDiscountRequestLike | null,
): DiscountInput {
  const mode = resolveDiscountMode(request?.discountMode);
  if (mode === "FIXED") {
    return {
      mode,
      // `??` e não `||`: um valor aprovado como 0 é uma decisão do gestor.
      value: toNumber(request?.newDiscountAmount ?? request?.requestedAmount),
    };
  }
  return {
    mode,
    value: toNumber(request?.newDiscountPercent ?? request?.requestedPercentage),
  };
}

/**
 * Percentual a aplicar sobre `base`, já convertendo reais quando for o caso.
 *
 * A conversão acontece aqui, contra a base do momento, e não na hora de
 * gravar: assim "R$ 500 de desconto" continua valendo R$ 500 mesmo que a
 * quantidade do item mude depois.
 */
export function resolveItemDiscountPercent(
  base: number,
  request?: ItemDiscountRequestLike | null,
): number {
  const input = resolveItemDiscountInput(request);
  if (input.mode !== "FIXED") return input.value;

  const baseValue = toNumber(base);
  if (baseValue <= 0) return 0;
  // Nunca passa de 100%: um valor fixo maior que o item zera o item, não o
  // transforma em crédito.
  return Math.min((toNumber(input.value) / baseValue) * 100, 100);
}

/** Rótulo do desconto do item: "10%" ou "R$ 500,00". */
export function formatItemDiscount(request?: ItemDiscountRequestLike | null): string {
  return formatDiscountInput(resolveItemDiscountInput(request));
}
