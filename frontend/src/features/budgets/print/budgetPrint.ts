import { EVENT_TYPES, type BudgetItem, type EventType } from "../data/mockData";
import { calculateSummaryStepEventTotals } from "../domain/eventCalculations";
import {
  getParticipationQuantity as resolveParticipationQuantity,
} from "../data/runtimeBudgetRules";
import {
  getAuditoriumDisplayName,
  getResolvedAuditoriumSlug,
  getMusicAttractionLabel,
  getResolvedAuditoriumPrice,
  isAuditoriumItemByIdOrName,
  isMusicAttractionItem,
} from "../domain/budgetUiRules";
import {
  getPresentationItemQuantity,
  getPresentationItemUnitPrice,
} from "../domain/budgetPresentationRules";
import { orderSelectedEvents } from "../data/budgetCatalog";
import {
  formatAppliedDiscount,
  formatItemDiscount,
} from "../domain/discountInput";
import {
  buildSummaryBlocks,
  sumSummaryBlocks,
  type SummaryBlock,
} from "../domain/summaryBlocks";
import type { SummaryFormValues } from "../components/steps/SummaryStep.types";
import type { Budget } from "../../../store/budgetStore";
import { fixMojibakeText } from "../../../utils/textEncoding";
import { parseLocalDate } from "../../../utils/date";
import budgetPrintCover from "../../../assets/print/budget-cover.svg";
import timbradoMatriz from "../../../assets/print/letterhead.svg";

export type BudgetPrintView = "TEAM" | "CLIENT";
// Modelo de impressão: LEGACY = layout atual; NEW = design "Orça Eventos".
export type BudgetPrintMode = "LEGACY" | "NEW";

type ApprovedItemRequestLike = {
  eventId: string;
  itemId: string;
  status: "APPROVED";
  requestedPercentage: number;
};

type BudgetItemRequestsMap = Record<string, ApprovedItemRequestLike[]>;

const COURTESY_EVENT_IDS = new Set(["culto_cortesia", "evento_100_dias"]);

type PrintRowKind = "header" | "item";

export type BudgetPrintRow = {
  kind: PrintRowKind;
  label: string;
  quantityLabel: string;
  unitPriceLabel: string;
  originalTotalLabel: string;
  finalTotalLabel: string;
  originalTotalValue: number;
  finalTotalValue: number;
  note?: string;
  subitemsText?: string;
  // Item marcado como "Valor aparece para cliente": exibe o valor também na
  // visão do cliente (onde por padrão os valores dos itens ficam ocultos).
  clientVisibleValue?: boolean;
  // Valor por aluno do item (montante ÷ qtd. de alunos). Preenchido só para a
  // "verba para camisa", para exibir total + por aluno lado a lado.
  perStudentLabel?: string;
  // Dados crus do item — o Anexo Contratual edita a partir deles e grava de
  // volta no orçamento. Ausentes nas linhas de cabeçalho de seção.
  itemId?: string;
  quantityValue?: number;
  unitPriceValue?: number;
};

export type BudgetPrintEvent = {
  eventId: string;
  title: string;
  /** Vem do cadastro: fecha um quadro próprio no resumo final. */
  closesSummaryBlock?: boolean;
  summaryBlockLabel?: string | null;
  participants: number;
  subtotal: number;
  originalTotal: number;
  finalTotal: number;
  valuePerStudent: number;
  rows: BudgetPrintRow[];
};

export type BudgetPrintParticipation = {
  eventId: string;
  label: string;
  quantity: number;
};

export type BudgetPrintDocument = {
  budgetId: string;
  budgetCode?: string;
  institution: string;
  course: string;
  committee: string;
  phone: string;
  controlNumber: string;
  startDate: string;
  endDate: string;
  studentsQuantity: number;
  selectedEventsCount: number;
  subtotal: number;
  discountedSubtotal: number;
  itemDiscountValue: number;
  finalTotal: number;
  discountPercent: number;
  /** "10%" ou "R$ 1.000,00": o desconto geral como foi pedido. */
  discountLabel: string;
  discountValue: number;
  installments: number;
  totalValuePerStudent: number;
  installmentValuePerStudent: number;
  /**
   * Quadros do resumo final: um só normalmente, dois quando há baile (até a
   * colação e o acumulado até o baile). Ver `domain/summaryBlocks`.
   */
  summaryBlocks: SummaryBlock[];
  participations: BudgetPrintParticipation[];
  events: BudgetPrintEvent[];
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR");

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
});

const ADMINISTRATION_EVENT_IDS = new Set([
  "descerramento_placa",
  "aula_saudade",
  "missa_culto",
  "colacao_descerramento",
  "cerimonia_colacao",
  "ensaio_fotografico",
  "ensaio_50",
  "ensaio_365",
  "festa_365",
  "festa_50",
  "cobertura_fotografica",
]);

function toNumber(value: unknown) {
  return Number(value) || 0;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function getEventSubtotalValue(eventId: string, finalEventTotal: number) {
  if (!ADMINISTRATION_EVENT_IDS.has(eventId)) return finalEventTotal;
  return roundCurrency(finalEventTotal / 1.1);
}

function formatDate(value: unknown) {
  const parsed = parseLocalDate(value);
  return parsed ? dateFormatter.format(parsed) : "Não informado";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFileNamePart(value: string) {
  return fixMojibakeText(value)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/g, "");
}

export function buildBudgetPrintFileName(document: BudgetPrintDocument) {
  const clientParts = [
    document.course,
    document.institution,
    document.committee,
  ]
    .map(sanitizeFileNamePart)
    .filter(Boolean);

  if (clientParts.length > 0) {
    return `Orcamento - ${clientParts.join(" - ")}`;
  }

  return sanitizeFileNamePart(
    `Orcamento Orça Eventos ${document.budgetCode || document.controlNumber || document.budgetId}`,
  );
}

function buildApprovedItemRequestsMap(budget: Budget): BudgetItemRequestsMap {
  const budgetId = budget.id || "temp-budget";
  const requests = Object.entries(budget.approvedItemDiscounts ?? {}).flatMap(
    ([compositeKey, requestedPercentage]) => {
      const separatorIndex = compositeKey.indexOf("-");
      if (separatorIndex <= 0) return [];

      // O valor em reais, quando existe, manda no cálculo: o percentual
      // gravado é só o equivalente da última vez que o orçamento foi salvo.
      const amount = budget.approvedItemDiscountAmounts?.[compositeKey];
      return [
        {
          eventId: compositeKey.slice(0, separatorIndex),
          itemId: compositeKey.slice(separatorIndex + 1),
          status: "APPROVED" as const,
          requestedPercentage: toNumber(requestedPercentage),
          discountMode: amount ? "FIXED" : "PERCENT",
          requestedAmount: toNumber(amount),
        },
      ];
    },
  );

  return { [budgetId]: requests };
}

function getDiscountPercent(
  budget: Budget,
  eventId: string,
  itemId: string,
) {
  return toNumber(budget.approvedItemDiscounts?.[`${eventId}-${itemId}`]);
}

/**
 * Como o desconto do item aparece na nota do produto: em reais quando foi
 * assim que ele foi pedido, em percentual no resto.
 */
function getItemDiscountLabel(budget: Budget, eventId: string, itemId: string) {
  const chave = `${eventId}-${itemId}`;
  const amount = toNumber(budget.approvedItemDiscountAmounts?.[chave]);
  return formatItemDiscount({
    requestedPercentage: toNumber(budget.approvedItemDiscounts?.[chave]),
    discountMode: amount ? "FIXED" : "PERCENT",
    requestedAmount: amount,
  });
}

function getParticipationQuantity(formValues: SummaryFormValues, eventId: string) {
  return resolveParticipationQuantity(
    formValues as Record<string, unknown>,
    eventId,
    toNumber(formValues.studentsQuantity),
  );
}

function getItemInput(
  formValues: SummaryFormValues,
  eventId: string,
) {
  return (formValues.items?.[eventId] ?? {}) as Record<string, unknown>;
}

function getItemUnitPrice(
  formValues: SummaryFormValues,
  eventId: string,
  item: BudgetItem,
  _participants: number,
  _removedIds: string[],
) {
  const eventInputs = getItemInput(formValues, eventId);
  return getPresentationItemUnitPrice(item, eventInputs);
}

function getRenderableSubitemsText(
  hasSubitems: boolean | undefined,
  subitems: Array<{ name?: string }> | undefined,
) {
  const validSubitems = (subitems ?? []).filter(
    (subitem) => typeof subitem?.name === "string" && subitem.name.trim().length > 0,
  );
  if (!hasSubitems || validSubitems.length === 0) return undefined;
  return validSubitems.map((subitem) => fixMojibakeText(subitem.name as string)).join(" | ");
}

function getPrintItemLabel(
  eventInputs: Record<string, unknown>,
  item: BudgetItem,
  budgetCity?: string,
) {
  const selectedVariationLabel = eventInputs[`${item.id}_variation_label`];
  const cleanedItemName = fixMojibakeText(item.name).replace(/\s*\([^)]*\)\s*$/, "");

  if (isAuditoriumItemByIdOrName(item.id, item.name)) {
    return getAuditoriumDisplayName(
      getResolvedAuditoriumPrice(item.id, eventInputs),
      getResolvedAuditoriumSlug(item.id, eventInputs),
      budgetCity,
    );
  }

  if (typeof selectedVariationLabel === "string" && selectedVariationLabel.trim()) {
    if (isMusicAttractionItem(item.id)) {
      return `Atração Musical (${selectedVariationLabel.trim()})`;
    }
    return `${cleanedItemName} (${selectedVariationLabel.trim()})`;
  }

  if (isMusicAttractionItem(item.id)) {
    return getMusicAttractionLabel(String(eventInputs.atracao_musical_type || "dj"));
  }

  return cleanedItemName;
}

function buildEventRows(
  budget: Budget,
  formValues: SummaryFormValues,
  event: EventType,
) {
  const customItems = formValues.customItems ?? {};
  const removedIds = customItems[event.id]?.removedIds ?? [];
  const addedItems = customItems[event.id]?.added ?? [];
  const participants = getParticipationQuantity(formValues, event.id);
  const isCourtesyEvent = COURTESY_EVENT_IDS.has(event.id);
  const rows: BudgetPrintRow[] = [];
  const eventInputs = getItemInput(formValues, event.id);

  for (const item of event.items) {
    if (removedIds.includes(item.id)) continue;

    if (item.isHeader) {
      rows.push({
        kind: "header",
        label: fixMojibakeText(item.name),
        quantityLabel: "",
        unitPriceLabel: "",
        originalTotalLabel: "",
        finalTotalLabel: "",
        originalTotalValue: 0,
        finalTotalValue: 0,
      });
      continue;
    }

    const quantity = getPresentationItemQuantity(event.id, item, eventInputs, participants);
    const unitPrice = getItemUnitPrice(formValues, event.id, item, participants, removedIds);
    const discountPercent = getDiscountPercent(budget, event.id, item.id);
    const discountedUnitPrice = roundCurrency(unitPrice * (1 - discountPercent / 100));
    const isIncluded = isCourtesyEvent || Boolean(item.displayValue);
    const originalTotalValue = isIncluded ? 0 : roundCurrency(quantity * unitPrice);
    const finalTotalValue = isIncluded ? 0 : roundCurrency(quantity * discountedUnitPrice);
    const includedLabel = fixMojibakeText(isCourtesyEvent ? "Cortesia" : item.displayValue || "Incluso");

    if (!isIncluded && quantity <= 0 && unitPrice <= 0) {
      continue;
    }

    rows.push({
      kind: "item",
      itemId: String(item.id),
      quantityValue: quantity,
      unitPriceValue: unitPrice,
      label: getPrintItemLabel(
        eventInputs,
        item,
        (formValues as { budgetCity?: string }).budgetCity,
      ),
      quantityLabel: quantity > 0 ? numberFormatter.format(quantity) : "-",
      unitPriceLabel: isIncluded ? includedLabel : formatCurrency(unitPrice),
      originalTotalLabel: isIncluded ? includedLabel : formatCurrency(originalTotalValue),
      finalTotalLabel: isIncluded ? includedLabel : formatCurrency(finalTotalValue),
      originalTotalValue,
      finalTotalValue,
      note: isCourtesyEvent
        ? "Cortesia"
        : discountPercent > 0
          ? `${getItemDiscountLabel(budget, event.id, item.id)} OFF aplicado`
          : undefined,
      subitemsText: getRenderableSubitemsText(item.hasSubitems, item.subitems),
      // "Verba para camisa" (Festa 50% / Festa 365) sempre exibe o valor para o
      // cliente, além dos itens marcados "valor aparece para cliente".
      clientVisibleValue:
        Boolean(item.valueVisibleToClient) ||
        /verba.*camisa/i.test(item.name || ""),
      // Verba para camisa: mostra também o valor por aluno (montante / qtd alunos).
      perStudentLabel:
        /verba.*camisa/i.test(item.name || "") && !isIncluded && participants > 0
          ? formatCurrency(roundCurrency(finalTotalValue / participants))
          : undefined,
    });
  }

  for (const addedItem of addedItems) {
    const itemId = addedItem.id || `added_${rows.length}`;
    const quantity = toNumber(addedItem.quantity);
    const unitPrice = toNumber(addedItem.unitPrice);
    const discountPercent = getDiscountPercent(budget, event.id, itemId);
    const discountedUnitPrice = roundCurrency(unitPrice * (1 - discountPercent / 100));
    const isIncluded = isCourtesyEvent || Boolean(addedItem.isNoFixedValue);
    const originalTotalValue = isIncluded ? 0 : roundCurrency(quantity * unitPrice);
    const finalTotalValue = isIncluded ? 0 : roundCurrency(quantity * discountedUnitPrice);
    const selectedVariationLabel = addedItem.variations?.find(
      (variation) => variation.id === addedItem.selectedVariationId,
    )?.name;

    rows.push({
      kind: "item",
      label: selectedVariationLabel
        ? `${fixMojibakeText(addedItem.name || "Item adicionado")} (${selectedVariationLabel})`
        : fixMojibakeText(addedItem.name || "Item adicionado"),
      quantityLabel: quantity > 0 ? numberFormatter.format(quantity) : "-",
      unitPriceLabel: isIncluded ? (isCourtesyEvent ? "Cortesia" : "Incluso") : formatCurrency(unitPrice),
      originalTotalLabel: isIncluded ? (isCourtesyEvent ? "Cortesia" : "Incluso") : formatCurrency(originalTotalValue),
      finalTotalLabel: isIncluded ? (isCourtesyEvent ? "Cortesia" : "Incluso") : formatCurrency(finalTotalValue),
      originalTotalValue,
      finalTotalValue,
      note: isCourtesyEvent
        ? "Cortesia"
        : isIncluded
        ? "Item cortesia"
        : discountPercent > 0
          ? `${getItemDiscountLabel(budget, event.id, itemId)} OFF aplicado`
          : undefined,
      subitemsText: getRenderableSubitemsText(addedItem.hasSubitems, addedItem.subitems),
    });
  }

  return rows;
}

function enrichEventRowsWithCalculatedTotals(
  formValues: SummaryFormValues,
  event: EventType,
  rows: BudgetPrintRow[],
  itemRequestsMap: BudgetItemRequestsMap,
) {
  const calculated = calculateSummaryStepEventTotals(event, formValues, itemRequestsMap);

  return {
    rows,
    originalTotal: roundCurrency(calculated.total),
    finalTotal: roundCurrency(calculated.discountedTotal),
  };
}

/**
 * Evento incluido como CORTESIA fora do orcamento (hoje so o Anexo Contratual
 * usa). Lista os itens do catalogo sem nenhum valor: nao ha entrada no
 * `form_data`, entao nada aqui altera o orcamento atrelado.
 */
export function buildCourtesyPrintEvent(
  event: EventType,
  participants: number,
): BudgetPrintEvent {
  const rows: BudgetPrintRow[] = [];

  for (const item of event.items) {
    if (item.isHeader) {
      rows.push({
        kind: "header",
        label: fixMojibakeText(item.name),
        quantityLabel: "",
        unitPriceLabel: "",
        originalTotalLabel: "",
        finalTotalLabel: "",
        originalTotalValue: 0,
        finalTotalValue: 0,
      });
      continue;
    }

    const quantity = getPresentationItemQuantity(event.id, item, {}, participants);
    rows.push({
      kind: "item",
      label: fixMojibakeText(item.name),
      quantityLabel: quantity > 0 ? numberFormatter.format(quantity) : "-",
      unitPriceLabel: "Cortesia",
      originalTotalLabel: "Cortesia",
      finalTotalLabel: "Cortesia",
      originalTotalValue: 0,
      finalTotalValue: 0,
      note: "Cortesia",
      subitemsText: getRenderableSubitemsText(item.hasSubitems, item.subitems),
    });
  }

  return {
    eventId: event.id,
    title: fixMojibakeText(event.title),
    participants,
    subtotal: 0,
    originalTotal: 0,
    finalTotal: 0,
    valuePerStudent: 0,
    rows,
  };
}

export function buildBudgetPrintDocument(
  budget: Budget,
  catalog: EventType[] = EVENT_TYPES,
): BudgetPrintDocument {
  const itemRequestsMap = buildApprovedItemRequestsMap(budget);
  const formValues = {
    ...(budget.data ?? {}),
    id: budget.id,
    discountPercent: budget.discountPercent ?? toNumber(budget.data?.discountPercent),
  } as SummaryFormValues;
  const selectedEventIds = Array.isArray(formValues.selectedEvents) ? formValues.selectedEvents : [];

  const orderedSelectedEvents = orderSelectedEvents(
    selectedEventIds
      .map((eventId) => catalog.find((event) => event.id === String(eventId)))
      .filter((event): event is EventType => Boolean(event)),
    (formValues as { eventOrder?: string[] }).eventOrder,
  );

  const events = orderedSelectedEvents
    .map((event) => {
      const rows = buildEventRows(budget, formValues, event);
      const enriched = enrichEventRowsWithCalculatedTotals(
        formValues,
        event,
        rows,
        itemRequestsMap,
      );

      const participants = getParticipationQuantity(formValues, event.id);
      return {
        eventId: event.id,
        title: fixMojibakeText(event.title),
        participants,
        subtotal: getEventSubtotalValue(event.id, enriched.finalTotal),
        originalTotal: enriched.originalTotal,
        finalTotal: enriched.finalTotal,
        valuePerStudent: participants > 0 ? roundCurrency(enriched.finalTotal / participants) : 0,
        rows: enriched.rows,
        // Marcação do cadastro do evento: fecha um quadro no resumo final.
        closesSummaryBlock:
          (event as { closes_summary_block?: boolean }).closes_summary_block === true,
        summaryBlockLabel:
          (event as { summary_block_label?: string | null }).summary_block_label ?? null,
      };
    });

  const subtotal = roundCurrency(
    events.reduce((sum, event) => sum + event.originalTotal, 0),
  );
  const discountedSubtotal = roundCurrency(
    events.reduce((sum, event) => sum + event.finalTotal, 0),
  );
  const itemDiscountValue = roundCurrency(subtotal - discountedSubtotal);
  const discountPercent = toNumber(budget.discountPercent ?? formValues.discountPercent);
  // O desconto geral pode ter sido pedido em reais; o rótulo precisa dizer o
  // que foi pedido, e não o percentual equivalente.
  const discountLabel = formatAppliedDiscount({
    discountPercent,
    discountMode: budget.discountMode ?? formValues.discountMode,
    discountAmount: budget.discountAmount ?? (Number(formValues.discountAmount) || 0),
  });
  const savedTotal = Number(budget.totalValue);
  // Usa o total_value salvo (autoritativo p/ o desconto global exato que foi
  // aplicado/aprovado), EXCETO quando ele é o fantasma: sem desconto global
  // (discountPercent 0) e MAIOR que a soma recalculada dos eventos -> aí usa a
  // soma, removendo valores fixos antigos da Cobertura (e outros obsoletos) dos antigos.
  const savedIsPhantom =
    discountPercent === 0 && Number.isFinite(savedTotal) && savedTotal > discountedSubtotal;
  const finalTotal =
    !savedIsPhantom && Number.isFinite(savedTotal) && savedTotal > 0
      ? roundCurrency(savedTotal)
      : discountedSubtotal;
  const discountValue = roundCurrency(Math.max(discountedSubtotal - finalTotal, 0));

  // Installments: auto-calculate from event dates (same logic as ItemsStep)
  const startRaw = formValues.eventStartDate;
  const endRaw = formValues.eventEndDate;
  let installments = 12;
  if (typeof startRaw === "string" && typeof endRaw === "string" && startRaw && endRaw) {
    const s = new Date(startRaw);
    const e = new Date(endRaw);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
      installments = Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1);
    }
  }

  // Parcelas definidas manualmente no orcamento vencem o calculo automatico.
  const overrideRaw = Number(formValues.installmentsOverride);
  if (Number.isFinite(overrideRaw) && overrideRaw >= 1) {
    installments = Math.floor(overrideRaw);
  }

  const studentsQuantity = toNumber(formValues.studentsQuantity);
  // "Valor total até a colação" = soma do valor por formando de CADA evento
  // (cada evento dividido pela SUA própria participação). NÃO usar
  // finalTotal / qtd. geral: eventos têm participações diferentes e o finalTotal
  // pode carregar o total salvo obsoleto (ex.: um valor fixo antigo da Cobertura).
  // Espelha o totalPorFormandoGeral exibido na tela (SummaryStep).
  const totalValuePerStudent = roundCurrency(
    events.reduce((sum, event) => sum + event.valuePerStudent, 0),
  );
  const installmentValuePerStudent = installments > 0 ? roundCurrency(totalValuePerStudent / installments) : 0;

  const summaryBlocks = buildSummaryBlocks({
    events: events.map((event) => ({
      eventId: event.eventId,
      title: event.title,
      total: event.finalTotal,
      valuePerStudent: event.valuePerStudent,
      closesSummaryBlock: event.closesSummaryBlock,
      summaryBlockLabel: event.summaryBlockLabel,
    })),
    installments,
  });

  return {
    budgetId: budget.id,
    budgetCode: budget.budgetCode,
    institution: fixMojibakeText(budget.instituicao || String(formValues.instituicao || "")),
    course: fixMojibakeText(budget.curso || String(formValues.curso || "")),
    committee: fixMojibakeText(budget.comissao || String(formValues.comissao || "")),
    phone: fixMojibakeText(budget.telefone || String(formValues.telefone || "")),
    controlNumber: budget.controle || String(formValues.controle || ""),
    startDate: formatDate(formValues.eventStartDate),
    endDate: formatDate(formValues.eventEndDate),
    studentsQuantity,
    selectedEventsCount: events.length,
    subtotal,
    discountedSubtotal,
    itemDiscountValue,
    finalTotal,
    discountPercent,
    discountLabel,
    discountValue,
    installments,
    totalValuePerStudent,
    installmentValuePerStudent,
    summaryBlocks,
    participations: events.map((event) => ({
      eventId: event.eventId,
      label: event.title,
      quantity: event.participants,
    })),
    events,
  };
}

export function generateBudgetPrintHtml(
  document: BudgetPrintDocument,
  view: BudgetPrintView,
) {
  const isTeamView = view === "TEAM";
  const printFileName = buildBudgetPrintFileName(document);
  // VALOR TOTAL DO ORÇAMENTO: o valor cheio de tudo que está no orçamento.
  const legacyTotalsRows =
    document.summaryBlocks
      .map(
        (block) => `
                <tr>
                  <td>${escapeHtml(block.totalsLabel)}</td>
                  <td class="right">${formatCurrency(block.total)}</td>
                </tr>
      `,
      )
      .join("") +
    (document.summaryBlocks.length > 1
      ? `
                <tr class="summary-highlight">
                  <td>Total geral do orçamento</td>
                  <td class="right">${formatCurrency(sumSummaryBlocks(document.summaryBlocks).total)}</td>
                </tr>
      `
      : "");

  // Um quadro do resumo final. Com baile sao dois (ate a colacao e o acumulado
  // ate o baile), com as MESMAS parcelas — muda so o total e o valor da parcela.
  const legacySummaryBlock = (block: SummaryBlock) => `
                <tr class="${isTeamView ? "" : "summary-highlight"}">
                  <td>
                    ${block.totalLabel}
                    ${block.caption ? `<div class="summary-caption">${escapeHtml(block.caption)}</div>` : ""}
                  </td>
                  <td class="right">${formatCurrency(block.totalPerStudent)}</td>
                </tr>
                ${!isTeamView ? `
                <tr class="summary-highlight">
                  <td>Quantidade de parcelas</td>
                  <td class="right">${numberFormatter.format(document.installments)}</td>
                </tr>
                ` : ""}
                <tr class="${isTeamView ? "" : "summary-highlight"}">
                  <td>Valor da parcela por formando</td>
                  <td class="right">${formatCurrency(block.installmentPerStudent)}</td>
                </tr>
                ${!isTeamView ? `
                <tr class="summary-highlight">
                  <td>Valor da parcela com 10% de desconto</td>
                  <td class="right">${formatCurrency(block.discountedInstallmentPerStudent)}</td>
                </tr>
                ` : ""}
  `;

  const participationRows = document.participations
    .map(
      (participation) => `
        <tr>
          <td>${escapeHtml(participation.label)}</td>
          <td class="right">${numberFormatter.format(participation.quantity)}</td>
        </tr>
      `,
    )
    .join("");

  const eventSections = document.events
    .map((event) => {
      const isCourtesyEvent = COURTESY_EVENT_IDS.has(event.eventId);
      const courtesyLabel = "Cortesia";

      if (!isTeamView) {
        const clientRowMarkup = event.rows
          .map((row) => {
            if (row.kind === "header") {
              return `
                <tr class="section-row">
                  <td colspan="2">${escapeHtml(row.label)}</td>
                </tr>
              `;
            }

            return `
              <tr>
                <td>
                  <div>${escapeHtml(row.label)}</div>
                  ${row.subitemsText ? `<div class="subitems">${escapeHtml(row.subitemsText)}</div>` : ""}
                  ${row.clientVisibleValue ? `<div class="client-item-value">Valor: ${escapeHtml(row.finalTotalLabel)}${row.perStudentLabel ? ` · ${escapeHtml(row.perStudentLabel)}/aluno` : ""}</div>` : ""}
                  ${isCourtesyEvent && row.note ? `<div class="note note-strong">${escapeHtml(row.note)}</div>` : ""}
                </td>
                <td class="right quantityCol">${escapeHtml(row.quantityLabel)}</td>
              </tr>
            `;
          })
          .join("");

        const clientParticipantsRow = `
          <tr class="event-summary-row event-summary-primary event-summary-divider">
            <td>Quantidade de formandos</td>
            <td class="right quantityCol">${numberFormatter.format(event.participants)}</td>
          </tr>
        `;

        const clientPerStudentRow = `
          <tr class="event-summary-row event-summary-primary">
            <td>Valor por formando</td>
            <td class="right quantityCol">${isCourtesyEvent ? courtesyLabel : formatCurrency(event.valuePerStudent)}</td>
          </tr>
        `;

        return `
          <section class="event-block">
            <div class="event-header">
              <div>
                <h3>${escapeHtml(event.title)}</h3>
                <p>Qtd. de formandos: ${numberFormatter.format(event.participants)}</p>
              </div>
            </div>
            <table class="eventTable">
              <colgroup>
                <col />
                <col class="col-qty" />
              </colgroup>
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="right quantityCol">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                ${clientRowMarkup}
              </tbody>
              <tfoot>
                <tr class="event-total-row event-summary-row event-summary-primary">
                  <td>Valor final do evento</td>
                  <td class="right quantityCol">${isCourtesyEvent ? courtesyLabel : formatCurrency(event.finalTotal)}</td>
                </tr>
                ${clientParticipantsRow}
                ${clientPerStudentRow}
              </tfoot>
            </table>
          </section>
        `;
      }

      const rowMarkup = event.rows
        .map((row) => {
          if (row.kind === "header") {
            return `
              <tr class="section-row">
                <td colspan="4">${escapeHtml(row.label)}</td>
              </tr>
            `;
          }

          return `
            <tr>
              <td>
                <div>${escapeHtml(row.label)}</div>
                ${row.subitemsText ? `<div class="subitems">${escapeHtml(row.subitemsText)}</div>` : ""}
                ${row.note ? `<div class="note${isCourtesyEvent ? " note-strong" : ""}">${escapeHtml(row.note)}</div>` : ""}
              </td>
              <td class="right quantityCol">${escapeHtml(row.quantityLabel)}</td>
              <td class="right">${escapeHtml(row.unitPriceLabel)}</td>
              <td class="right">${escapeHtml(row.originalTotalLabel)}${row.perStudentLabel ? `<div class="per-aluno">${escapeHtml(row.perStudentLabel)}/aluno</div>` : ""}</td>
            </tr>
          `;
        })
        .join("");

      const teamParticipantsRow = `
        <tr class="event-summary-row event-summary-primary event-summary-divider">
          <td colspan="3">Quantidade de formandos</td>
          <td class="right">${numberFormatter.format(event.participants)}</td>
        </tr>
      `;

      const teamPerStudentRow = `
        <tr class="event-summary-row event-summary-primary">
          <td colspan="3">Valor por formando</td>
          <td class="right">${isCourtesyEvent ? courtesyLabel : formatCurrency(event.valuePerStudent)}</td>
        </tr>
      `;

      return `
        <section class="event-block">
          <div class="event-header">
            <div>
              <h3>${escapeHtml(event.title)}</h3>
              <p>Qtd. de formandos: ${numberFormatter.format(event.participants)}</p>
            </div>
          </div>

          <table class="eventTable">
            <colgroup>
              <col />
              <col class="col-qty" />
              <col class="col-money" />
              <col class="col-money" />
            </colgroup>
            <thead>
              <tr>
                <th>Item</th>
                <th class="right quantityCol">Quantidade</th>
                <th class="right">Valor unitário</th>
                <th class="right">Valor</th>
              </tr>
            </thead>
            <tbody>
              ${rowMarkup}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3">Subtotal do evento</td>
                <td class="right">${formatCurrency(event.subtotal)}</td>
              </tr>
              <tr class="event-summary-row event-summary-primary">
                <td colspan="3">Valor final do evento</td>
                <td class="right">${isCourtesyEvent ? courtesyLabel : formatCurrency(event.finalTotal)}</td>
              </tr>
              ${teamParticipantsRow}
              ${teamPerStudentRow}
            </tfoot>
          </table>
        </section>
      `;
    })
    .join("");

    const teamSummaryExtra = isTeamView
    ? `
      <tr>
        <td>Subtotal (Eventos Pagos)</td>
        <td class="right">${formatCurrency(document.subtotal)}</td>
      </tr>
      ${document.itemDiscountValue > 0 ? `
        <tr>
          <td>Descontos por item (Aprovados)</td>
          <td class="right">- ${formatCurrency(document.itemDiscountValue)}</td>
        </tr>
      ` : ""}
      <tr>
        <td>Subtotal antes do desconto global</td>
        <td class="right">${formatCurrency(document.discountedSubtotal)}</td>
      </tr>
      ${document.discountValue > 0 ? `
        <tr>
          <td>Desconto global${document.discountLabel ? ` (${escapeHtml(document.discountLabel)})` : ""}</td>
          <td class="right">- ${formatCurrency(document.discountValue)}</td>
        </tr>
      ` : ""}
    `
    : "";

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(printFileName)}</title>
        <style>
          @page {
            size: A4;
            margin: 0;
          }

          :root {
            color-scheme: light;
            font-family: "Segoe UI", Arial, sans-serif;
            --border: #d7dce5;
            --text: #142033;
            --muted: #5b6473;
            --surface: #f7f9fc;
            --accent: #1f4b99;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            color: var(--text);
            background: white;
          }

          .print-document {
            position: relative;
          }

          .cover-page {
            width: 210mm;
            /* calc(297mm - 1mm): evita estouro sub-pixel/arredondamento do A4 que
               gera folha em branco com timbrado no WebKit (iOS/macOS). Slack de 2px
               era insuficiente em alguns devices; 1mm é invisível (object-fit: cover
               recorta) e cobre variação de DPI/margem de impressão. */
            height: calc(297mm - 1mm);
            max-height: calc(297mm - 1mm);
            margin: 0 auto;
            position: relative;
            z-index: 30;
            overflow: hidden;
            break-after: page;
            page-break-after: always;
          }

          .cover-page img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .letterhead {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 20;
          }

          .letterhead img {
            width: 100%;
            height: 100%;
            object-fit: fill;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .page {
            width: 100%;
            max-width: 1120px;
            margin: 0 auto;
            /* Apenas laterais aqui. O espaço de topo (timbrado) e rodapé é
               reservado pelo thead/tfoot da .print-frame, que se repete em
               todas as páginas impressas (técnica de running header/footer). */
            padding: 0 14mm;
            position: relative;
            z-index: 1;
          }

          /* Frame de página: thead/tfoot funcionam como running header/footer e
             se repetem em cada folha impressa, reservando o espaço do timbrado
             (topo) e do rodapé sem depender de padding (que não se repete entre
             páginas no WebKit). Mantém o timbrado fixo full-bleed (@page margin 0). */
          .print-frame {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }

          .print-frame > thead,
          .print-frame > tfoot {
            border: 0;
          }

          .print-frame > thead .frame-spacer-top {
            height: 50mm;
            padding: 0;
            border: 0;
          }

          .print-frame > tfoot .frame-spacer-bottom {
            height: 20mm;
            padding: 0;
            border: 0;
          }

          .print-frame > tbody > tr > .frame-body {
            padding: 0;
            border: 0;
            vertical-align: top;
          }

          @media print {
            .print-frame > thead {
              display: table-header-group;
            }

            .print-frame > tfoot {
              display: table-footer-group;
            }
          }

          .topbar {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            border-bottom: 2px solid var(--text);
            padding-bottom: 16px;
            margin-bottom: 24px;
          }

          .topbar h1 {
            margin: 0;
            font-size: 26px;
          }

          .meta {
            font-size: 12px;
            color: var(--muted);
            text-align: right;
          }

          .panel {
            border: 1px solid var(--border);
            border-radius: 14px;
            background: var(--surface);
            padding: 18px;
            margin-bottom: 20px;
          }

          .panel h2 {
            margin: 0 0 14px;
            font-size: 16px;
          }

          .summary-panel {
            background: #fbfcff;
          }

          .summaryTable {
            border: 1px solid var(--border);
            border-radius: 12px;
            overflow: hidden;
          }

          .summaryTable td {
            padding: 12px 14px;
          }

          /* Legenda dizendo o que entra no quadro do resumo final. */
          .summary-caption {
            font-size: 9px;
            font-weight: 400;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            margin-top: 2px;
          }

          .summary-highlight td {
            background: #eef3fb;
            font-weight: 700;
          }

          .event-data {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px 18px;
            margin-bottom: 18px;
          }

          .field {
            min-width: 0;
          }

          .field-label {
            display: block;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--muted);
            margin-bottom: 3px;
          }

          .field-value {
            font-size: 14px;
            font-weight: 600;
            overflow-wrap: anywhere;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
          }

          .eventTable {
            table-layout: fixed;
            border-collapse: separate;
            border-spacing: 0;
          }

          .eventTable .col-qty {
            width: 112px;
          }

          .eventTable .col-money {
            width: 152px;
          }

          th,
          td {
            padding: 10px 8px;
            border-bottom: 1px solid var(--border);
            vertical-align: top;
          }

          th {
            text-align: left;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--muted);
          }

          td:first-child,
          th:first-child {
            overflow-wrap: anywhere;
          }

          tfoot td {
            font-weight: 700;
          }

          .event-total-row td {
            font-weight: 700;
          }

          .event-summary-row td {
            background: #f3f7fd;
            font-weight: 700;
          }

          .event-summary-primary td {
            background: #e7eefb;
            color: var(--accent);
          }

          .event-summary-divider {
            box-shadow: inset 0 -1px 0 #9fb7df;
          }

          .event-summary-divider td {
            border-bottom: 0;
            box-shadow: none;
          }

          .right,
          .quantityCol {
            text-align: right;
          }

          .eventTable th.quantityCol,
          .eventTable td.quantityCol,
          .eventTable th:last-child,
          .eventTable td:last-child {
            white-space: nowrap;
          }

          .eventTable tfoot tr:last-child td {
            border-bottom: 0;
          }

          .event-block {
            margin-bottom: 20px;
            border: 1px solid var(--border);
            border-radius: 14px;
            background: var(--surface);
            overflow: hidden;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .first-page {
            break-after: page;
          }

          .event-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 18px;
            background: #eef3fb;
            padding: 10px 14px;
            border-top-left-radius: 13px;
            border-top-right-radius: 13px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .event-header h3 {
            margin: 0 0 4px;
            font-size: 20px;
            color: var(--accent);
          }

          .event-header p {
            margin: 0;
            color: var(--muted);
            font-size: 13px;
          }

          .section-row td {
            background: #eaf0f8;
            font-weight: 700;
            color: var(--text);
          }

          .note {
            font-size: 11px;
            color: var(--muted);
            margin-top: 3px;
          }

          .note-strong {
            font-weight: 700;
          }

          .subitems {
            font-size: 11.5px;
            color: var(--muted);
            margin-top: 4px;
            line-height: 1.45;
          }

          .client-item-value {
            display: inline-block;
            font-size: 12px;
            font-weight: 700;
            color: var(--accent, #1f4b99);
            margin-top: 4px;
          }

          .per-aluno {
            font-size: 10px;
            font-weight: 400;
            color: var(--muted, #5b6473);
            margin-top: 2px;
          }

          @media print {
            .cover-page {
              margin: 0;
            }

            .page {
              max-width: none;
            }

            .panel {
              break-inside: avoid;
            }

            /* O painel "Dados do Evento" pode ser alto (grid + tabela de
               participações com muitos eventos). Mantê-lo indivisível faz ele
               pular inteiro para a próxima página, deixando a anterior "em branco"
               (só com a topbar). Permitir quebra interna evita a folha vazia. */
            .panel.first-page {
              break-inside: auto;
              page-break-inside: auto;
            }

            .field {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .event-block {
              margin: 0 0 12mm;
              break-inside: avoid;
              page-break-inside: avoid;
              overflow: hidden;
            }

            .eventTable thead {
              display: table-header-group;
            }

            .eventTable tfoot {
              display: table-row-group;
            }

            .eventTable tr,
            .eventTable td,
            .eventTable th {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }

          @media screen and (max-width: 720px) {
            .event-data {
              grid-template-columns: 1fr;
            }

            .topbar,
            .event-header {
              flex-direction: column;
            }

            .meta {
              text-align: left;
              min-width: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="print-document">
          <section class="cover-page">
            <img src="${budgetPrintCover}" alt="Capa do orçamento Orça Eventos" />
          </section>

          <div class="letterhead" aria-hidden="true">
            <img src="${timbradoMatriz}" alt="" />
          </div>
          <main class="page">
          <table class="print-frame">
            <thead>
              <tr><td class="frame-spacer-top"></td></tr>
            </thead>
            <tfoot>
              <tr><td class="frame-spacer-bottom"></td></tr>
            </tfoot>
            <tbody>
              <tr><td class="frame-body">
          <header class="topbar">
            <div>
              <h1>Orçamento Orça Eventos</h1>
            </div>
            <div class="meta">
              <div>Código: ${escapeHtml(document.budgetCode || document.controlNumber || document.budgetId)}</div>
            </div>
          </header>

          <section class="panel first-page">
            <h2>Dados do Evento</h2>
            <div class="event-data">
              <div class="field">
                <span class="field-label">Instituição de Ensino</span>
                <span class="field-value">${escapeHtml(document.institution || "Não informado")}</span>
              </div>
              <div class="field">
                <span class="field-label">Curso / Turma</span>
                <span class="field-value">${escapeHtml(document.course || "Não informado")}</span>
              </div>
              <div class="field">
                <span class="field-label">Comissão de Formatura</span>
                <span class="field-value">${escapeHtml(document.committee || "Não informado")}</span>
              </div>
              <div class="field">
                <span class="field-label">Telefone da Comissão</span>
                <span class="field-value">${escapeHtml(document.phone || "Não informado")}</span>
              </div>
              <div class="field">
                <span class="field-label">Número de Controle</span>
                <span class="field-value">${escapeHtml(document.controlNumber || document.budgetCode || "Não informado")}</span>
              </div>
              <div class="field">
                <span class="field-label">Período</span>
                <span class="field-value">${escapeHtml(`${document.startDate} até ${document.endDate}`)}</span>
              </div>
              <div class="field">
                <span class="field-label">Qtd. Geral de Formandos</span>
                <span class="field-value">${numberFormatter.format(document.studentsQuantity)}</span>
              </div>
              <div class="field">
                <span class="field-label">Eventos Selecionados</span>
                <span class="field-value">${numberFormatter.format(document.selectedEventsCount)}</span>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Evento</th>
                  <th class="right">Qtd. de formandos</th>
                </tr>
              </thead>
              <tbody>
                ${participationRows || `
                  <tr>
                    <td colspan="2">Nenhum evento selecionado.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </section>

          ${eventSections || `
            <section class="panel">
              <h2>Eventos</h2>
              <p>Nenhum evento disponível para impressão neste orçamento.</p>
            </section>
          `}

          <section class="panel summary-panel">
            <h2>Valor Total do Orçamento</h2>
            <table class="summaryTable">
              <tbody>
                ${legacyTotalsRows}
              </tbody>
            </table>
          </section>

          <section class="panel summary-panel">
            <h2>Resumo Final</h2>
            <table class="summaryTable">
              <tbody>
                ${isTeamView ? `
                <tr>
                  <td>Qtd. de eventos</td>
                  <td class="right">${numberFormatter.format(document.selectedEventsCount)}</td>
                </tr>
                <tr>
                  <td>Qtd. geral de formandos</td>
                  <td class="right">${numberFormatter.format(document.studentsQuantity)}</td>
                </tr>
                ` : ""}
                ${teamSummaryExtra}
                ${isTeamView ? `
                <tr>
                  <td>Valor final</td>
                  <td class="right">${formatCurrency(document.finalTotal)}</td>
                </tr>
                ` : ""}
                ${document.totalValuePerStudent > 0 ? `
                ${document.summaryBlocks.map(legacySummaryBlock).join("")}
                ` : ""}
              </tbody>
            </table>
          </section>
              </td></tr>
            </tbody>
          </table>
          </main>
        </div>
      <script>setTimeout(function() { window.print(); }, 150);</script>
      </body>
    </html>
  `;
}
// ============================================================================
// Modelo NOVO de impressão (design "Orça Eventos"). Renderização estática (sem
// interatividade), tema claro, reaproveitando o mesmo BudgetPrintDocument do
// modelo legado. Convivem: o usuário escolhe LEGACY ou NEW ao imprimir.
// ============================================================================
function yearOf(value: string): string {
  const match = /\d{4}/.exec(value || "");
  return match ? match[0] : "";
}

export function generateBudgetPrintHtmlV2(
  document: BudgetPrintDocument,
  view: BudgetPrintView,
) {
  const isTeam = view === "TEAM";
  const printFileName = buildBudgetPrintFileName(document);
  const startYear = yearOf(document.startDate);
  const endYear = yearOf(document.endDate);
  const period =
    startYear && endYear
      ? startYear === endYear
        ? startYear
        : `${startYear} — ${endYear}`
      : `${document.startDate} — ${document.endDate}`;
  const code = escapeHtml(document.budgetCode || document.controlNumber || "—");

  const eventsMarkup = document.events
    .map((event, index) => {
      const isCourtesy =
        COURTESY_EVENT_IDS.has(event.eventId) || event.finalTotal <= 0;
      const idx = String(index + 1).padStart(2, "0");

      const itemsMarkup = event.rows
        .map((row) => {
          if (row.kind === "header") {
            return `<div class="v2-item-section">${escapeHtml(row.label)}</div>`;
          }
          const desc = [row.subitemsText, row.note]
            .filter(Boolean)
            .map((text) => `<div class="v2-item-desc">${escapeHtml(String(text))}</div>`)
            .join("");
          // Equipe vê o valor de todos os itens; Cliente só dos itens marcados
          // "valor aparece para cliente".
          const showValue = !isCourtesy && (isTeam || row.clientVisibleValue);
          const valueCell = showValue
            ? `<div class="v2-item-val">${escapeHtml(row.finalTotalLabel)}${row.perStudentLabel ? ` <span class="v2-item-pa">· ${escapeHtml(row.perStudentLabel)}/aluno</span>` : ""}</div>`
            : "";
          return `
            <div class="v2-item-row">
              <div class="v2-item-name">${escapeHtml(row.label)}${desc}</div>
              <div class="v2-item-right">
                ${valueCell}
                <div class="v2-item-qty">${escapeHtml(row.quantityLabel)}</div>
              </div>
            </div>`;
        })
        .join("");

      // Fecha o evento com o valor total dele e o valor por formando daquele
      // evento. A seção "Valores por Evento" no final consolida os mesmos
      // números, mas aqui eles ficam junto dos itens que os originaram.
      const eventSumLine = isCourtesy
        ? `<div class="v2-ev-sumline"><span>Valor do evento</span> <b class="v2-cream-b">Cortesia</b></div>`
        : `<div class="v2-ev-sumline">`
          + `<span>Valor do evento</span> <b>${formatCurrency(event.finalTotal)}</b>`
          + `<span class="v2-sep">·</span>`
          + `<span>Por formando</span> <b class="v2-cream-b">${formatCurrency(event.valuePerStudent)}</b>`
          + `</div>`;

      return `
        <div class="v2-ev-card${isCourtesy ? " v2-ev-cortesia" : ""}">
          <div class="v2-ev-head">
            <div class="v2-ev-idx"><span>${idx}</span></div>
            <div class="v2-ev-head-main">
              <div class="v2-ev-name">${escapeHtml(event.title)}</div>
              <div class="v2-ev-chips">
                <span class="v2-ev-chip">${numberFormatter.format(event.participants)} formandos</span>
              </div>
            </div>
          </div>
          <div class="v2-ev-body">
            <div class="v2-items-head"><span>Item</span><div class="v2-items-head-right">${isTeam ? '<span class="v2-hv">Valor</span>' : ""}<span class="v2-hq">Qtd.</span></div></div>
            ${itemsMarkup}
            ${eventSumLine}
          </div>
        </div>`;
    })
    .join("");

  // Tabela logo abaixo do título "Eventos Selecionados" — preenche o espaço antes
  // dos cards (que podem começar na folha seguinte) e serve de índice do orçamento.
  const eventsListMarkup = document.events
    .map(
      (event, index) =>
        `<tr><td class="v2-evtable-idx">${String(index + 1).padStart(2, "0")}</td><td>${escapeHtml(event.title)}</td><td class="v2-evtable-qty">${numberFormatter.format(event.participants)}</td></tr>`,
    )
    .join("");

  // Seção "Valores por Evento" (no final): consolida o valor de cada evento
  // (retirado do header dos cards). Equipe ganha uma linha de Total geral.
  const valoresPorEvento = document.events
    .map((event, index) => {
      const cortesia = COURTESY_EVENT_IDS.has(event.eventId) || event.finalTotal <= 0;
      const idx = String(index + 1).padStart(2, "0");
      const val = cortesia
        ? "Cortesia"
        : `${formatCurrency(event.finalTotal)} <span class="v2-vpe-pf">· ${formatCurrency(event.valuePerStudent)}/formando</span>`;
      return `<div class="v2-vpe-row"><span class="v2-vpe-name">${idx}. ${escapeHtml(event.title)}</span><span class="v2-vpe-val">${val}</span></div>`;
    })
    .join("");
  const valoresTotalRow = isTeam
    ? `<div class="v2-vpe-row v2-vpe-total"><span class="v2-vpe-name">Total geral</span><span class="v2-vpe-val">${formatCurrency(document.finalTotal)}</span></div>`
    : "";

  const sumLine = (label: string, value: string, hl = false) =>
    `<div class="v2-sum-line${hl ? " hl" : ""}"><span class="v2-sum-line-lbl">${label}</span><span class="v2-sum-line-val">${value}</span></div>`;

  // VALOR TOTAL DO ORÇAMENTO: o valor cheio de tudo que está no orçamento. Com
  // um evento fechando quadro próprio, separa o pacote do acumulado com ele.
  const totaisRows =
    document.summaryBlocks
      .map(
        (block) =>
          `<div class="v2-sum-line">` +
          `<span class="v2-sum-line-lbl">${escapeHtml(block.totalsLabel)}</span>` +
          `<span class="v2-sum-line-val">${formatCurrency(block.total)}</span>` +
          `</div>`,
      )
      .join("") +
    // Com um quadro só o total dele já é o do orçamento.
    (document.summaryBlocks.length > 1
      ? `<div class="v2-sum-line hl">` +
        `<span class="v2-sum-line-lbl">Total geral do orçamento</span>` +
        `<span class="v2-sum-line-val">${formatCurrency(sumSummaryBlocks(document.summaryBlocks).total)}</span>` +
        `</div>`
      : "");
  // RESUMO FINAL: mesma estrutura do demonstrativo nas DUAS visões (cliente e
  // equipe), conforme solicitado.
  const sumBlock = (block: SummaryBlock) =>
    [
      block.caption
        ? `<div class="v2-sum-caption">${escapeHtml(block.caption)}</div>`
        : "",
      sumLine(block.totalLabel, formatCurrency(block.totalPerStudent), true),
      sumLine("Quantidade de parcelas", numberFormatter.format(document.installments)),
      sumLine(
        "Valor da parcela por formando",
        formatCurrency(block.installmentPerStudent),
      ),
      sumLine(
        "Valor da parcela com 10% de desconto",
        formatCurrency(block.discountedInstallmentPerStudent),
        true,
      ),
    ].join("");

  // Com baile vão dois quadros: até a colação e o acumulado até o baile.
  const resumoRows = document.summaryBlocks
    .map((block) => sumBlock(block))
    .join(`<div class="v2-sum-split"></div>`);

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(printFileName)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>
        :root{
          --pg:#F4F1EA; --card:#FFFFFF; --cardbr:#EAE5D9;
          --tx1:#16161A; --tx2:#9A9A8E; --tx3:#2C2C30; --txd:#A0A094;
          --hair:#F0ECE0; --hair2:#F6F3EA;
          --chipbg:#FBF6E9; --chipbr:#EFE3C4; --chiptx:#A07E33;
          --secln:#EAE5D9; --dcln:#DCD6C8;
          --idxbr:#E2D6B6; --idxbg1:#FBF6E9; --idxbg2:#F3E9CC; --idxtx:#A07E33;
          --resbr:#EFEADF; --gold:#C5A158; --cream:#E6CF94; --dark:#0E0E10;
        }
        *{ box-sizing:border-box; margin:0; padding:0; }
        html,body{ background:var(--pg); }
        body{ font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:var(--tx1); -webkit-font-smoothing:antialiased; padding:40px 20px; }
        .v2-wrap{ max-width:940px; margin:0 auto; }
        .v2-hero{ background:var(--dark); border-radius:26px; padding:48px 52px 40px; position:relative; overflow:hidden; }
        .v2-hero-glow{ position:absolute; top:-120px; right:-90px; width:360px; height:360px; border-radius:50%; background:radial-gradient(circle, rgba(197,161,88,0.16), rgba(197,161,88,0) 70%); }
        .v2-hero-inner{ position:relative; z-index:1; }
        .v2-brand{ display:flex; align-items:center; gap:16px; }
        .v2-brand-name{ font-size:22px; font-weight:800; letter-spacing:3px; color:#FAFAF7; line-height:1; }
        .v2-brand-name span{ font-weight:400; color:var(--gold); margin-left:6px; }
        .v2-brand-sub{ font-size:11px; letter-spacing:2px; color:#7A7A82; margin-top:7px; text-transform:uppercase; }
        .v2-hero-rule{ height:1px; background:linear-gradient(90deg, rgba(197,161,88,0.55), rgba(197,161,88,0)); margin:32px 0 28px; }
        .v2-hero-head{ display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:24px; }
        .v2-eyebrow{ font-size:12px; letter-spacing:3px; color:var(--gold); text-transform:uppercase; font-weight:600; }
        .v2-title{ font-weight:700; font-size:40px; line-height:1.06; color:#FAFAF7; margin:14px 0 0; letter-spacing:-1px; }
        .v2-committee{ font-size:15px; color:#A6A6AE; margin-top:10px; }
        .v2-code{ background:rgba(197,161,88,0.12); border:1px solid rgba(197,161,88,0.4); border-radius:999px; padding:10px 18px; display:flex; align-items:center; gap:9px; }
        .v2-code-dot{ width:7px; height:7px; border-radius:50%; background:var(--gold); }
        .v2-code-txt{ font-size:13px; letter-spacing:1.5px; color:var(--cream); font-weight:600; }
        .v2-hero-chips{ display:flex; flex-wrap:wrap; gap:10px; margin-top:28px; }
        .v2-hchip{ background:#1B1B1F; border:1px solid #2A2A30; border-radius:12px; padding:9px 15px; font-size:13px; color:#CFCFD6; }
        .v2-hchip span{ color:#7A7A82; }
        .v2-hchip strong{ color:#FAFAF7; font-weight:700; }
        .v2-section{ background:var(--card); border:1px solid var(--cardbr); border-radius:22px; padding:34px 40px; margin-top:20px; }
        .v2-sec-eyebrow{ display:flex; align-items:center; gap:12px; margin-bottom:24px; }
        .v2-sec-eyebrow span:first-child{ font-size:11px; font-weight:700; letter-spacing:2px; color:var(--gold); text-transform:uppercase; }
        .v2-sec-line{ flex:1; height:1px; background:var(--secln); }
        .v2-dados-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:26px 36px; }
        .v2-dado-lbl{ font-size:11px; letter-spacing:1px; color:var(--tx2); text-transform:uppercase; margin-bottom:7px; }
        .v2-dado-val{ font-size:16px; font-weight:600; color:var(--tx1); }
        .v2-invest{ background:linear-gradient(135deg,#15140F 0%,#221E14 100%); border-radius:22px; padding:36px 40px; margin-top:20px; position:relative; overflow:hidden; }
        .v2-invest-glow{ position:absolute; inset:0; background:radial-gradient(circle at 85% 0%, rgba(197,161,88,0.14), transparent 55%); }
        .v2-invest-grid{ position:relative; display:grid; grid-template-columns:1.5fr 1fr 1fr; gap:32px; align-items:center; }
        .v2-invest-lbl{ font-size:11px; letter-spacing:2px; color:var(--gold); text-transform:uppercase; font-weight:600; }
        .v2-invest-val{ font-size:44px; font-weight:800; color:#FAFAF7; line-height:1; margin-top:14px; letter-spacing:-1.5px; }
        .v2-invest-val small{ font-size:25px; font-weight:800; }
        .v2-invest-col{ border-left:1px solid rgba(255,255,255,0.1); padding-left:30px; }
        .v2-invest-col-lbl{ font-size:11px; letter-spacing:1px; color:#8A8A78; text-transform:uppercase; }
        .v2-invest-col-val{ font-size:24px; font-weight:700; color:var(--cream); margin-top:8px; letter-spacing:-0.5px; }
        .v2-invest-col-val.white{ color:#FAFAF7; }
        .v2-events-title-row{ display:flex; align-items:center; gap:14px; margin:38px 4px 16px; }
        .v2-events-title{ font-size:27px; font-weight:700; color:var(--tx1); margin:0; letter-spacing:-0.8px; }
        .v2-events-title-line{ flex:1; height:1px; background:var(--dcln); }
        .v2-evtable{ width:100%; border-collapse:collapse; margin:0 0 20px; border:1px solid var(--cardbr); border-radius:12px; overflow:hidden; }
        .v2-evtable th{ text-align:left; font-size:10.5px; letter-spacing:1.5px; text-transform:uppercase; font-weight:700; color:var(--tx2); background:var(--chipbg); padding:11px 18px; border-bottom:1px solid var(--cardbr); }
        .v2-evtable td{ padding:14px 18px; border-bottom:1px solid var(--hair); font-size:14px; font-weight:500; color:var(--tx3); }
        .v2-evtable tr:last-child td{ border-bottom:none; }
        .v2-evtable-idx{ width:64px; font-weight:800; color:var(--chiptx); text-align:center; }
        td.v2-evtable-idx{ background:var(--hair2); }
        .v2-evtable-qty{ text-align:right; white-space:nowrap; width:110px; font-weight:700; color:var(--tx1); }
        .v2-ev-card{ background:var(--card); border:1px solid var(--cardbr); border-radius:20px; margin-bottom:16px; overflow:hidden; position:relative; page-break-inside:avoid; }
        .v2-ev-cortesia{ border-color:var(--cardbr); }
        .v2-ev-head{ display:flex; align-items:center; gap:20px; padding:22px 26px; background:var(--dark); -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .v2-ev-idx{ flex-shrink:0; width:50px; height:50px; border-radius:14px; border:1px solid var(--idxbr); background:linear-gradient(135deg,var(--idxbg1),var(--idxbg2)); display:flex; align-items:center; justify-content:center; }
        .v2-ev-idx span{ font-size:20px; font-weight:800; color:var(--idxtx); letter-spacing:-0.5px; }
        .v2-ev-head-main{ flex:1; min-width:0; }
        .v2-ev-name{ font-size:17px; font-weight:600; color:#FAFAF7; line-height:1.3; }
        .v2-ev-chips{ margin-top:7px; }
        .v2-ev-chip{ display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:#F0EDE4; background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.22); border-radius:999px; padding:3px 10px; }
        .v2-ev-value-col{ text-align:right; flex-shrink:0; }
        .v2-ev-value{ font-size:20px; font-weight:700; color:var(--tx1); letter-spacing:-0.5px; }
        .v2-ev-value-sub{ font-size:12px; color:var(--tx2); margin-top:3px; }
        .v2-badge-cortesia{ display:inline-block; background:#ECFDF3; border:1px solid #BBF0CE; color:#1F8A53; font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; padding:6px 14px; border-radius:999px; }
        .v2-ev-body{ border-top:1px solid var(--hair); padding:8px 26px 20px; }
        .v2-items-head{ display:flex; justify-content:space-between; padding:14px 4px 10px; border-bottom:1px solid var(--hair); }
        .v2-items-head span{ font-size:11px; letter-spacing:1.5px; color:var(--tx2); text-transform:uppercase; font-weight:600; }
        .v2-item-section{ font-size:11px; letter-spacing:1.5px; color:var(--chiptx); text-transform:uppercase; font-weight:700; padding:14px 4px 6px; }
        .v2-items-head-right{ display:flex; align-items:center; gap:14px; }
        .v2-hv{ min-width:96px; text-align:right; }
        .v2-hq{ min-width:44px; text-align:center; }
        .v2-item-row{ display:flex; justify-content:space-between; align-items:flex-start; gap:18px; padding:12px 4px; border-bottom:1px solid var(--hair2); }
        .v2-item-row:last-child{ border-bottom:none; }
        .v2-item-name{ flex:1; font-size:14px; font-weight:500; color:var(--tx3); line-height:1.4; }
        .v2-item-desc{ font-size:12px; color:var(--txd); line-height:1.5; margin-top:5px; }
        .v2-item-right{ display:flex; align-items:center; gap:14px; flex-shrink:0; }
        .v2-item-val{ min-width:96px; text-align:right; font-size:13px; font-weight:600; color:var(--tx3); }
        .v2-item-pa{ font-size:11px; font-weight:500; color:var(--tx2); }
        .v2-item-qty{ flex-shrink:0; min-width:44px; text-align:center; background:var(--chipbg); border:1px solid var(--chipbr); border-radius:8px; padding:4px 10px; font-size:13px; font-weight:700; color:var(--chiptx); }
        .v2-ev-summary{ margin-top:18px; border:1px solid rgba(197,161,88,0.18); border-radius:14px; overflow:hidden; background:linear-gradient(135deg,#15140F 0%,#221E14 100%); display:grid; grid-template-columns:1fr 1fr 1fr; }
        .v2-ev-summary-2col{ grid-template-columns:1fr 1fr; }
        /* Resumo do evento em UMA linha compacta (economia de folha na impressão). */
        .v2-ev-sumline{ margin-top:12px; padding:9px 14px; border-radius:10px; background:linear-gradient(135deg,#15140F 0%,#221E14 100%); border:1px solid rgba(197,161,88,0.18); display:flex; flex-wrap:wrap; align-items:baseline; gap:8px; font-size:12.5px; color:#CFCFD6; }
        .v2-ev-sumline b{ color:#FAFAF7; font-weight:700; }
        .v2-ev-sumline .v2-cream-b{ color:var(--cream); }
        .v2-sep{ color:#5A5A52; }
        .v2-sum-cell{ padding:16px 20px; border-right:1px solid rgba(255,255,255,0.09); }
        .v2-sum-cell.v2-sum-last{ border-right:none; }
        .v2-sum-lbl{ font-size:10.5px; letter-spacing:1px; text-transform:uppercase; font-weight:600; }
        .v2-gold{ color:var(--gold); }
        .v2-mut{ color:#8A8A78; }
        .v2-sum-val{ font-size:19px; font-weight:700; color:#FAFAF7; margin-top:8px; letter-spacing:-0.4px; }
        .v2-sum-val.v2-cream{ color:var(--cream); }
        .v2-vpe-list{ display:flex; flex-direction:column; }
        .v2-vpe-row{ display:flex; justify-content:space-between; align-items:baseline; gap:16px; padding:11px 2px; border-bottom:1px solid var(--hair2); }
        .v2-vpe-row:last-child{ border-bottom:none; }
        .v2-vpe-name{ font-size:14px; color:var(--tx3); font-weight:500; }
        .v2-vpe-val{ font-size:14px; font-weight:700; color:var(--tx1); text-align:right; white-space:nowrap; }
        .v2-vpe-pf{ font-size:12px; font-weight:500; color:var(--tx2); }
        .v2-vpe-total{ border-top:1px solid var(--secln); margin-top:4px; padding-top:14px; }
        .v2-vpe-total .v2-vpe-name{ font-weight:800; color:var(--tx1); }
        .v2-vpe-total .v2-vpe-val{ font-weight:800; color:var(--chiptx); font-size:16px; }
        .v2-sum-list{ display:flex; flex-direction:column; }
        .v2-sum-line{ display:flex; justify-content:space-between; align-items:baseline; gap:18px; padding:12px 2px; border-bottom:1px solid var(--hair2); }
        .v2-sum-line:last-child{ border-bottom:none; }
        /* Separa os dois quadros (ate a colacao / ate o baile). */
        .v2-sum-split{ height:1px; background:var(--secln); margin:14px 0; }
        /* Legenda dizendo o que entra em cada quadro. */
        .v2-sum-caption{ font-size:12px; color:var(--tx2); text-transform:uppercase; letter-spacing:1px; padding:4px 2px 8px; }
        .v2-sum-line-lbl{ font-size:14px; color:var(--tx2); }
        .v2-sum-line-val{ font-size:15px; font-weight:600; color:var(--tx1); text-align:right; white-space:nowrap; }
        .v2-sum-line.hl{ border-top:1px solid var(--secln); margin-top:4px; padding-top:16px; }
        .v2-sum-line.hl .v2-sum-line-lbl{ color:var(--tx1); font-weight:600; }
        .v2-sum-line.hl .v2-sum-line-val{ font-size:20px; font-weight:800; color:var(--chiptx); }
        .v2-resumo-grid{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }
        .v2-resumo-card{ border:1px solid var(--resbr); border-radius:16px; padding:22px 26px; }
        .v2-resumo-lbl{ font-size:12px; letter-spacing:1px; color:var(--tx2); text-transform:uppercase; }
        .v2-resumo-val{ font-size:30px; font-weight:700; color:var(--tx1); margin-top:10px; letter-spacing:-0.8px; }
        .v2-resumo-val small{ font-size:18px; font-weight:700; }
        .v2-resumo-sub{ font-size:13px; color:var(--tx2); margin-top:6px; }
        .v2-resumo-band{ margin-top:18px; background:linear-gradient(135deg,#0E0E10,#221E14); border-radius:16px; padding:24px 30px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:18px; }
        .v2-band-tag{ display:inline-flex; align-items:center; gap:8px; background:rgba(197,161,88,0.15); border:1px solid rgba(197,161,88,0.4); border-radius:999px; padding:5px 13px; font-size:11px; letter-spacing:1.5px; color:var(--cream); text-transform:uppercase; font-weight:700; }
        .v2-band-note{ font-size:14px; color:#A6A6AE; margin-top:12px; }
        .v2-band-val{ font-size:34px; font-weight:800; color:var(--cream); line-height:1; letter-spacing:-1px; }
        .v2-band-sub{ font-size:13px; color:#8A8A78; margin-top:8px; }
        .v2-footer{ margin-top:28px; padding:26px 8px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px; border-top:1px solid var(--dcln); }
        .v2-footer-left{ font-size:13px; color:var(--tx2); line-height:1.7; }
        .v2-footer-left strong{ color:var(--tx1); }
        .v2-footer-right{ display:flex; flex-direction:column; align-items:flex-end; gap:3px; font-size:13px; color:var(--tx2); }
        .v2-footer-site{ font-weight:600; color:var(--gold); letter-spacing:1px; }
        @page{ size:A4 portrait; margin:8mm; }
        @media print{
          html,body{ background:#fff; }
          body{ padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; font-size:12.5px; }
          .v2-wrap{ max-width:none; width:100%; display:flex; flex-direction:column; min-height:100vh; }
          /* Densidade: espaçamentos um pouco mais enxutos (sem mexer nos tamanhos
             de fonte) para caber mais por folha sem prejudicar a leitura. */
          .v2-hero{ padding:19px 22px 17px; border-radius:14px; }
          .v2-hero-rule{ margin:15px 0 13px; }
          .v2-title{ font-size:30px; }
          .v2-hero-chips{ margin-top:13px; }
          .v2-section{ padding:14px 20px; border-radius:12px; margin-top:8px; }
          .v2-sec-eyebrow{ margin-bottom:11px; }
          .v2-invest{ padding:16px 20px; border-radius:12px; margin-top:8px; }
          .v2-invest-val{ font-size:34px; }
          .v2-dados-grid{ gap:13px 30px; }
          .v2-events-title-row{ margin:14px 4px 8px; }
          .v2-events-title{ font-size:22px; }
          .v2-ev-card{ margin-bottom:7px; border-radius:12px; }
          .v2-ev-head{ padding:10px 18px; gap:13px; border-radius:12px 12px 0 0; }
          .v2-ev-idx{ width:40px; height:40px; }
          .v2-ev-idx span{ font-size:16px; }
          .v2-ev-name{ font-size:15px; }
          .v2-ev-chips{ margin-top:5px; }
          .v2-ev-body{ padding:3px 18px 10px; }
          .v2-items-head{ padding:6px 4px 5px; }
          .v2-item-row{ padding:6px 4px; }
          .v2-item-name{ font-size:12.5px; }
          .v2-item-desc{ font-size:11px; margin-top:2px; }
          .v2-item-section{ padding:10px 4px 5px; }
          .v2-ev-sumline{ margin-top:7px; padding:6px 12px; font-size:11.5px; }
          .v2-resumo-band{ padding:14px 18px; }
          .v2-footer{ margin-top:auto; padding:13px 8px; border-top:none; }
          /* Otimização de folhas: o CARD pode continuar na próxima folha (acaba
             com os vãos em branco quando um evento nao cabia inteiro). Só
             protegemos de partir no meio: cabeçalho, linha de item, cabeçalho de
             seção do evento e a linha-resumo. */
          .v2-hero, .v2-section, .v2-invest, .v2-footer{ page-break-inside:avoid; break-inside:avoid; }
          /* Evento transpassa de uma folha para outra (elimina vãos em branco).
             Sobrescreve o avoid + overflow:hidden da regra base do card. */
          .v2-ev-card{ page-break-inside:auto; break-inside:auto; overflow:visible; }
          .v2-ev-head, .v2-item-row, .v2-item-section, .v2-ev-sumline{ page-break-inside:avoid; break-inside:avoid; }
          .v2-hero-glow, .v2-invest-glow{ display:none !important; }
        }
      </style>
    </head>
    <body>
      <div class="v2-wrap">
        <header class="v2-hero">
          <div class="v2-hero-glow"></div>
          <div class="v2-hero-inner">
            <div class="v2-brand">
              <svg width="44" height="50" viewBox="0 0 100 112" fill="none">
                <path d="M50 4 L94 19 V54 C94 80 74 99 50 108 C26 99 6 80 6 54 V19 Z" stroke="#C5A158" stroke-width="3" fill="none"></path>
                <path d="M50 14 L86 26 V54 C86 75 70 91 50 98 C30 91 14 75 14 54 V26 Z" stroke="#C5A158" stroke-width="1" opacity="0.5" fill="none"></path>
                <text x="50" y="73" text-anchor="middle" font-family="'Inter',sans-serif" font-weight="800" font-size="46" fill="#C5A158">E</text>
              </svg>
              <div>
                <div class="v2-brand-name">ORÇA<span>EVENTOS</span></div>
                <div class="v2-brand-sub">Cerimonial &amp; Formaturas</div>
              </div>
            </div>
            <div class="v2-hero-rule"></div>
            <div class="v2-hero-head">
              <div>
                <div class="v2-eyebrow">Orçamento de Formatura</div>
                <h1 class="v2-title">${escapeHtml(document.course)} · ${escapeHtml(document.institution)}</h1>
                <div class="v2-committee">Comissão de Formatura — ${escapeHtml(document.committee || "—")}</div>
              </div>
              <div class="v2-code">
                <span class="v2-code-dot"></span>
                <span class="v2-code-txt">${code}</span>
              </div>
            </div>
            <div class="v2-hero-chips">
              <div class="v2-hchip"><span>Formandos</span> &nbsp;<strong>${numberFormatter.format(document.studentsQuantity)}</strong></div>
              <div class="v2-hchip"><span>Eventos</span> &nbsp;<strong>${numberFormatter.format(document.selectedEventsCount)}</strong></div>
              <div class="v2-hchip"><span>Período</span> &nbsp;<strong>${escapeHtml(period)}</strong></div>
            </div>
          </div>
        </header>

        <section class="v2-section">
          <div class="v2-sec-eyebrow"><span>Dados do Evento</span><span class="v2-sec-line"></span></div>
          <div class="v2-dados-grid">
            <div><div class="v2-dado-lbl">Instituição de Ensino</div><div class="v2-dado-val">${escapeHtml(document.institution || "—")}</div></div>
            <div><div class="v2-dado-lbl">Curso / Turma</div><div class="v2-dado-val">${escapeHtml(document.course || "—")}</div></div>
            <div><div class="v2-dado-lbl">Comissão de Formatura</div><div class="v2-dado-val">${escapeHtml(document.committee || "—")}</div></div>
            <div><div class="v2-dado-lbl">Telefone da Comissão</div><div class="v2-dado-val">${escapeHtml(document.phone || "—")}</div></div>
            <div><div class="v2-dado-lbl">Número de Controle</div><div class="v2-dado-val">${code}</div></div>
            <div><div class="v2-dado-lbl">Período</div><div class="v2-dado-val">${escapeHtml(document.startDate)} — ${escapeHtml(document.endDate)}</div></div>
          </div>
        </section>

        <div class="v2-events-title-row">
          <h2 class="v2-events-title">Eventos Selecionados</h2>
          <span class="v2-events-title-line"></span>
        </div>
        <table class="v2-evtable">
          <thead><tr><th class="v2-evtable-idx">#</th><th>Evento</th><th class="v2-evtable-qty">Formandos</th></tr></thead>
          <tbody>${eventsListMarkup}</tbody>
        </table>
        ${eventsMarkup || '<p style="color:var(--tx2);">Nenhum evento selecionado.</p>'}

        <section class="v2-section">
          <div class="v2-sec-eyebrow"><span>Valores por Evento</span><span class="v2-sec-line"></span></div>
          <div class="v2-vpe-list">${valoresPorEvento}${valoresTotalRow}</div>
        </section>

        <section class="v2-section">
          <div class="v2-sec-eyebrow"><span>Valor Total do Orçamento</span><span class="v2-sec-line"></span></div>
          <div class="v2-sum-list">${totaisRows}</div>
        </section>

        <section class="v2-section">
          <div class="v2-sec-eyebrow"><span>Resumo Final · Condições de Pagamento</span><span class="v2-sec-line"></span></div>
          <div class="v2-sum-list">${resumoRows}</div>
        </section>

        <footer class="v2-footer">
          <div class="v2-footer-left">
            <strong>(11) 0000-0000</strong><br />
            Rua Exemplo, 100 — Centro, São Paulo-SP, 01000-000
          </div>
          <div class="v2-footer-right">
            <span class="v2-footer-site">www.example.com</span>
            <span>@orcaeventos.demo</span>
          </div>
        </footer>
      </div>
      <script>setTimeout(function(){ window.print(); }, 450);</script>
    </body>
    </html>
  `;
}

export function openBudgetPrintShell() {
  const popup = window.open("", "_blank");

  if (!popup) {
    return null;
  }

  try {
    popup.history.replaceState({}, "", "/orca-eventos");
  } catch {
    // ignore history restrictions in popup contexts
  }

  popup.document.open();
  popup.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Orça Eventos</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            font-family: "Segoe UI", Arial, sans-serif;
            background: #f7f9fc;
            color: #142033;
          }

          .card {
            padding: 24px 28px;
            border: 1px solid #d7dce5;
            border-radius: 16px;
            background: white;
            box-shadow: 0 18px 40px -24px rgba(20, 32, 51, 0.45);
          }
        </style>
      </head>
      <body>
        <div class="card">Preparando impressão do orçamento...</div>
      </body>
    </html>
  `);
  popup.document.close();
  popup.document.title = "";

  return popup;
}

export function renderBudgetPrintWindow(
  popup: Window,
  budget: Budget,
  view: BudgetPrintView,
  catalog: EventType[] = EVENT_TYPES,
  mode: BudgetPrintMode = "LEGACY",
) {
  const printableDocument = buildBudgetPrintDocument(budget, catalog);
  const printFileName = buildBudgetPrintFileName(printableDocument);

  try {
    popup.history.replaceState({}, "", "/orca-eventos");
  } catch {
    // ignore history restrictions in popup contexts
  }

  const html =
    mode === "NEW"
      ? generateBudgetPrintHtmlV2(printableDocument, view)
      : generateBudgetPrintHtml(printableDocument, view);

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.document.title = printFileName;

  return true;
}

export function openBudgetPrintWindow(
  budget: Budget,
  view: BudgetPrintView,
  catalog: EventType[] = EVENT_TYPES,
) {
  const popup = openBudgetPrintShell();
  if (!popup) {
    return false;
  }

  return renderBudgetPrintWindow(popup, budget, view, catalog);
}
