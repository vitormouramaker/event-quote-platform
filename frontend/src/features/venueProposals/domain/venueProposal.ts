/**
 * Proposta de locação do Centro de Eventos Aurora Hall.
 *
 * É um produto à parte do orçamento de formatura: não tem formandos, eventos
 * nem parcela por aluno. O que existe é uma tabela de preços pequena e fechada
 * — três entradas mutuamente exclusivas, quatro opcionais e duas cobranças que
 * nascem das condições da proposta.
 *
 * Toda a conta mora aqui para a tela e a impressão mostrarem exatamente o
 * mesmo, e para a proposta salva guardar o que foi cobrado.
 */

import {
  resolveGlobalDiscountValue,
  type DiscountMode,
} from "../../budgets/domain/discountInput";

/** Uma das três formas de acesso ao salão. Escolha exclusiva. */
export type VenueEntrance = {
  id: string;
  name: string;
  description: string;
  price: number;
};

/** Serviço opcional; `perDay` cobra por diária em vez de valor fechado. */
export type VenueOptional = {
  id: string;
  name: string;
  condition: string;
  price: number;
  perDay: boolean;
};

export type VenueSettings = {
  entrances: VenueEntrance[];
  optionals: VenueOptional[];
  /** Climatização na montagem/desmontagem, por dia. */
  climateControlDailyRate: number;
  /** Diária extra de montagem/desmontagem, em % da tarifa do espaço. */
  extraDailyPercent: number;
  includedSetupDays: number;
  includedTeardownDays: number;
  validityDays: number;
};

export type VenueOptionalChoice = {
  selected: boolean;
  /** Diárias; ignorado quando o opcional não é cobrado por dia. */
  days: number;
};

export type VenueProposalForm = {
  clientName: string;
  eventType: string;
  guests: number | null;
  /** O evento pode durar vários dias; um dia só é início igual ao fim. */
  eventStartDate: string;
  eventEndDate: string;
  eventStartTime: string;
  eventEndTime: string;
  setupDays: number;
  teardownDays: number;
  entranceId: string;
  optionals: Record<string, VenueOptionalChoice>;
  /**
   * Climatização fora dos dias de evento, separada por etapa: o cliente pode
   * querer na montagem e não na desmontagem.
   */
  climateSetup: VenueOptionalChoice;
  climateTeardown: VenueOptionalChoice;
  discountMode: DiscountMode;
  /** Percentual ou reais, conforme o modo. */
  discountValue: number;
  discountReason: string;
  validUntil: string;
  observation: string;
  /**
   * A tabela de preços usada nesta proposta.
   *
   * Fica gravada junto porque o gestor edita a tabela: sem isto, mudar o preço
   * da locação hoje reescreveria o valor de uma proposta emitida mês passado.
   */
  settingsSnapshot?: VenueSettings;
};

/** Uma linha da composição do investimento. */
export type VenueProposalLine = {
  id: string;
  label: string;
  condition: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type VenueProposalTotals = {
  entrance?: VenueEntrance;
  lines: VenueProposalLine[];
  subtotal: number;
  discountValue: number;
  total: number;
  /** Dias de evento, contando início e fim. */
  eventDays: number;
  /** Dias de montagem/desmontagem que passam do que já está incluso. */
  extraSetupDays: number;
  extraTeardownDays: number;
};

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Dias inteiros e nunca negativos: diária é unidade contável. */
function diarias(value: unknown) {
  return Math.max(0, Math.trunc(toNumber(value)));
}

export function createEmptyVenueProposalForm(
  settings: VenueSettings,
): VenueProposalForm {
  const optionals: Record<string, VenueOptionalChoice> = {};
  settings.optionals.forEach((optional) => {
    optionals[optional.id] = { selected: false, days: 1 };
  });

  return {
    clientName: "",
    eventType: "",
    guests: null,
    eventStartDate: "",
    eventEndDate: "",
    eventStartTime: "",
    eventEndTime: "",
    setupDays: settings.includedSetupDays,
    teardownDays: settings.includedTeardownDays,
    entranceId: settings.entrances[0]?.id ?? "",
    optionals,
    climateSetup: { selected: false, days: 0 },
    climateTeardown: { selected: false, days: 0 },
    discountMode: "PERCENT",
    discountValue: 0,
    discountReason: "",
    validUntil: "",
    observation: "",
  };
}

/**
 * Reconstrói o formulário a partir do snapshot salvo.
 *
 * O snapshot pode estar incompleto — gravado por uma versão anterior da tela,
 * ou com um opcional que não existe mais na tabela de preços. Completa com o
 * formulário vazio em vez de deixar a tela quebrar num campo ausente.
 */
export function mergeSavedVenueProposalForm(
  salvo: Partial<VenueProposalForm> | null | undefined,
  settings: VenueSettings,
): VenueProposalForm {
  const vazio = createEmptyVenueProposalForm(settings);
  const dados = salvo ?? {};

  const optionals = { ...vazio.optionals };
  Object.entries(dados.optionals ?? {}).forEach(([chave, escolha]) => {
    // Só aproveita opcionais que ainda existem na tabela de preços.
    if (!(chave in optionals) || !escolha) return;
    optionals[chave] = {
      selected: Boolean(escolha.selected),
      days: diarias(escolha.days) || 1,
    };
  });

  // Propostas gravadas antes da separação tinham um único `climateControl`
  // cobrindo montagem e desmontagem; vira a montagem.
  const legado = (dados as { climateControl?: VenueOptionalChoice }).climateControl;

  return {
    ...vazio,
    ...dados,
    optionals,
    climateSetup: {
      selected: Boolean((dados.climateSetup ?? legado)?.selected),
      days: diarias((dados.climateSetup ?? legado)?.days),
    },
    climateTeardown: {
      selected: Boolean(dados.climateTeardown?.selected),
      days: diarias(dados.climateTeardown?.days),
    },
  };
}

/**
 * Quantos dias o evento ocupa o espaço, contando início e fim.
 *
 * Datas vazias ou invertidas valem 1 dia: é o piso de qualquer locação, e
 * evita que um preenchimento pela metade zere os itens cobrados por diária.
 */
export function countEventDays(form: {
  eventStartDate?: string;
  eventEndDate?: string;
}): number {
  const inicio = form.eventStartDate;
  const fim = form.eventEndDate || inicio;
  if (!inicio || !fim) return 1;
  // Datas "YYYY-MM-DD" comparadas em UTC: `new Date("2026-12-10")` puxa fuso e
  // erraria o dia perto da virada.
  const [ai, mi, di] = inicio.slice(0, 10).split("-").map(Number);
  const [af, mf, df] = fim.slice(0, 10).split("-").map(Number);
  if (!ai || !af) return 1;
  const umDia = 24 * 60 * 60 * 1000;
  const diff = Date.UTC(af, mf - 1, df) - Date.UTC(ai, mi - 1, di);
  return Math.max(Math.round(diff / umDia) + 1, 1);
}

/**
 * Dias de montagem/desmontagem além do que a locação já inclui. São eles que
 * geram a diária extra.
 */
export function countExtraDays(form: VenueProposalForm, settings: VenueSettings) {
  return {
    extraSetupDays: Math.max(diarias(form.setupDays) - diarias(settings.includedSetupDays), 0),
    extraTeardownDays: Math.max(
      diarias(form.teardownDays) - diarias(settings.includedTeardownDays),
      0,
    ),
  };
}

/**
 * A composição do investimento: a locação escolhida, os opcionais contratados
 * e as duas cobranças condicionais.
 *
 * A diária extra sai pronta da conta — 50% da tarifa do espaço locado por dia
 * que passar do incluso — porque é regra da proposta, não negociação.
 */
export function buildVenueProposalTotals(
  form: VenueProposalForm,
  settings: VenueSettings,
): VenueProposalTotals {
  const entrance = settings.entrances.find((item) => item.id === form.entranceId);
  const lines: VenueProposalLine[] = [];

  if (entrance) {
    lines.push({
      id: `entrance:${entrance.id}`,
      label: entrance.name,
      condition: "Locação do salão",
      quantity: 1,
      unitPrice: roundCurrency(entrance.price),
      total: roundCurrency(entrance.price),
    });
  }

  const eventDays = countEventDays(form);

  settings.optionals.forEach((optional) => {
    const choice = form.optionals[optional.id];
    if (!choice?.selected) return;
    // Opcional de valor fechado não multiplica por diária. E o cliente pode
    // querer a cozinha em 2 dias de um evento de 5, mas nunca em 6.
    const quantity = optional.perDay
      ? Math.min(Math.max(diarias(choice.days), 1), eventDays)
      : 1;
    lines.push({
      id: `optional:${optional.id}`,
      label: optional.name,
      condition: optional.condition,
      quantity,
      unitPrice: roundCurrency(optional.price),
      total: roundCurrency(optional.price * quantity),
    });
  });

  const { extraSetupDays, extraTeardownDays } = countExtraDays(form, settings);
  const extraDays = extraSetupDays + extraTeardownDays;

  if (entrance && extraDays > 0) {
    const dailyRate = roundCurrency(
      entrance.price * (toNumber(settings.extraDailyPercent) / 100),
    );
    lines.push({
      id: "extra-daily",
      label: "Diárias adicionais de montagem/desmontagem",
      condition: `${toNumber(settings.extraDailyPercent)}% da tarifa do espaço locado, por dia`,
      quantity: extraDays,
      unitPrice: dailyRate,
      total: roundCurrency(dailyRate * extraDays),
    });
  }

  // A climatização não está inclusa em NENHUM dia de montagem ou desmontagem,
  // nem no dia que vem junto da locação: o teto é o total de dias da etapa.
  const rate = roundCurrency(toNumber(settings.climateControlDailyRate));
  const climatizacao: [VenueOptionalChoice | undefined, number, string, string][] = [
    [form.climateSetup, diarias(form.setupDays), "climate-setup", "Climatização na montagem"],
    [
      form.climateTeardown,
      diarias(form.teardownDays),
      "climate-teardown",
      "Climatização na desmontagem",
    ],
  ];

  climatizacao.forEach(([choice, diasDisponiveis, id, label]) => {
    if (!choice?.selected || diasDisponiveis <= 0) return;
    const quantity = Math.min(Math.max(diarias(choice.days), 1), diasDisponiveis);
    lines.push({
      id,
      label,
      condition: "Taxa por dia, fora dos dias de evento",
      quantity,
      unitPrice: rate,
      total: roundCurrency(rate * quantity),
    });
  });

  const subtotal = roundCurrency(lines.reduce((sum, line) => sum + line.total, 0));
  // O desconto segue a mesma regra do orçamento: em reais não escala com o
  // total, em percentual sim.
  const discountValue = resolveGlobalDiscountValue(subtotal, {
    discountMode: form.discountMode,
    discountAmount: form.discountMode === "FIXED" ? form.discountValue : 0,
    discountPercent: form.discountMode === "PERCENT" ? form.discountValue : 0,
  });

  return {
    entrance,
    lines,
    subtotal,
    discountValue,
    total: roundCurrency(subtotal - discountValue),
    eventDays,
    extraSetupDays,
    extraTeardownDays,
  };
}

/**
 * Qual tabela de preços vale para uma proposta: a que ficou gravada nela, e a
 * atual só quando não houver gravada (propostas anteriores a este campo).
 */
export function resolveVenueSettings(
  salvo: Partial<VenueProposalForm> | null | undefined,
  atuais: VenueSettings,
): VenueSettings {
  const congelada = salvo?.settingsSnapshot;
  if (!congelada || !Array.isArray(congelada.entrances) || congelada.entrances.length === 0) {
    return atuais;
  }
  return congelada;
}

/** Até quando a proposta vale, a partir da emissão. */
export function defaultValidUntil(settings: VenueSettings, from = new Date()) {
  const limite = new Date(from);
  limite.setDate(limite.getDate() + Math.max(toNumber(settings.validityDays), 0));
  const mes = String(limite.getMonth() + 1).padStart(2, "0");
  const dia = String(limite.getDate()).padStart(2, "0");
  return `${limite.getFullYear()}-${mes}-${dia}`;
}

/** Mensagem do que falta preencher, ou null quando a proposta pode ser salva. */
export function validateVenueProposal(
  form: VenueProposalForm,
  totals: VenueProposalTotals,
): string | null {
  if (!form.clientName.trim()) return "Informe o cliente.";
  if (!form.eventType.trim()) return "Informe o tipo de evento.";
  if (!form.eventStartDate) return "Informe a data de início do evento.";
  if (!form.eventEndDate) return "Informe a data de fim do evento.";
  if (form.eventEndDate < form.eventStartDate) {
    return "A data de fim não pode ser anterior à de início.";
  }
  if (!totals.entrance) return "Escolha a configuração de locação.";
  if (form.discountValue > 0 && !form.discountReason.trim()) {
    return "Informe o motivo do desconto.";
  }
  return null;
}
