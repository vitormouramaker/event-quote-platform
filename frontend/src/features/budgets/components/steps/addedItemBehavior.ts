import type { BudgetItem } from "../../data/mockData";

type SourceItemLike = BudgetItem & {
  sourceEventId?: string;
  defaultQuantity?: number;
  quantityEditable?: boolean;
  priceEditable?: boolean;
  dynamicByStudents?: boolean;
  hasAdditional?: boolean;
  additionalQuantity?: number;
  hasMultiplier?: boolean;
  multiplierQuantity?: number;
};

function getAdditionalQty(sourceItem?: SourceItemLike) {
  if (!sourceItem?.hasAdditional) return 0;
  const raw = Number(sourceItem.additionalQuantity);
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}

function getMultiplier(sourceItem?: SourceItemLike) {
  if (!sourceItem?.hasMultiplier) return 1;
  const raw = Number(sourceItem.multiplierQuantity);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
}

type DeriveAddedItemBehaviorParams = {
  sourceItem?: SourceItemLike;
  targetParticipationQty: number;
  manualQuantity: number;
  manualUnitPrice: number;
  manualIsNoFixedValue?: boolean;
};

export type AddedItemBehavior = {
  quantity: number;
  unitPrice: number;
  isNoFixedValue: boolean;
  quantityEditable: boolean;
  priceEditable: boolean;
  dynamicByStudents: boolean;
  displayValue?: string;
  quantityDisplay?: string;
};

const PRICE_EDITABLE_KEYS = new Set([
  "culto_cortesia:*",
  "aula_saudade:drinks",
  "aula_saudade:atracao_musical",
  "colacao_descerramento:becas_formandos_col",
  "colacao_descerramento:painel_led_col",
  "cerimonia_colacao:becas_formandos_cerimonia",
  "cerimonia_colacao:placa_led_cerimonia",
  "festa_50:drinks_festa50",
  "festa_50:camisa_festa50",
  "ensaio_fotografico:beca_formatura_ensaio",
  "ensaio_fotografico:coffee_break_ensaio",
  "ensaio_50:coffee_break_ensaio50",
  "ensaio_365:coffee_break_ensaio365",
  "festa_365:drinks_festa365",
  "festa_365:camisa_festa365",
  "cobertura_fotografica:sessao_fotografica_solenidades",
]);

const QUANTITY_EDITABLE_KEYS = new Set([
  "itens_descerramento_placa:replica_placa",
  "descerramento_placa:replica_placa",
  "descerramento_placa:coffee_break",
  "aula_saudade:servicos_buffet",
  "aula_saudade:bebidas_open_bar",
  "aula_saudade:drinks",
  "aula_saudade:mesas_cadeiras",
  "missa_culto:livro_missal",
  "colacao_descerramento:recepcionista_apoio_col",
  "colacao_descerramento:replica_placa_col",
  "colacao_descerramento:becas_formandos_col",
  "colacao_descerramento:canudos_col",
  "colacao_descerramento:cadeiras_formandos_col",
  "colacao_descerramento:arquibancada_col",
  "colacao_descerramento:painel_led_col",
  "cerimonia_colacao:becas_formandos_cerimonia",
  "cerimonia_colacao:canudos_cerimonia",
  "cerimonia_colacao:cadeiras_formandos_cerimonia",
  "cerimonia_colacao:arquibancada_cerimonia",
  "cerimonia_colacao:placa_led_cerimonia",
  "festa_50:buffet_festa50",
  "festa_50:openbar_festa50",
  "festa_50:drinks_festa50",
  "festa_50:camisa_festa50",
  "ensaio_fotografico:beca_formatura_ensaio",
  "ensaio_fotografico:coffee_break_ensaio",
  "ensaio_50:sessao_fotografica_ensaio50",
  "ensaio_50:coffee_break_ensaio50",
  "ensaio_365:sessao_fotografica_ensaio365",
  "ensaio_365:coffee_break_ensaio365",
  "festa_365:buffet_festa365",
  "festa_365:openbar_festa365",
  "festa_365:drinks_festa365",
  "festa_365:camisa_festa365",
  "cobertura_fotografica:sessao_fotografica_solenidades",
  "evento_100_dias:open_bar_100dias",
]);

const PARTICIPATION_QTY_FACTORIES = new Map<string, (qty: number) => number>([
  ["itens_descerramento_placa:replica_placa", (qty) => qty],
  ["descerramento_placa:replica_placa", (qty) => qty],
  ["descerramento_placa:coffee_break", (qty) => qty],
  ["aula_saudade:servicos_buffet", (qty) => qty + 5],
  ["aula_saudade:bebidas_open_bar", (qty) => qty + 5],
  ["aula_saudade:drinks", (qty) => qty],
  ["aula_saudade:mesas_cadeiras", (qty) => qty],
  ["missa_culto:livro_missal", (qty) => qty * 10],
  ["colacao_descerramento:replica_placa_col", (qty) => qty],
  ["colacao_descerramento:becas_formandos_col", (qty) => qty],
  ["colacao_descerramento:canudos_col", (qty) => qty],
  ["colacao_descerramento:cadeiras_formandos_col", (qty) => qty],
  ["colacao_descerramento:arquibancada_col", (qty) => qty],
  ["colacao_descerramento:painel_led_col", (qty) => qty],
  ["cerimonia_colacao:becas_formandos_cerimonia", (qty) => qty],
  ["cerimonia_colacao:canudos_cerimonia", (qty) => qty],
  ["cerimonia_colacao:cadeiras_formandos_cerimonia", (qty) => qty],
  ["cerimonia_colacao:arquibancada_cerimonia", (qty) => qty],
  ["cerimonia_colacao:placa_led_cerimonia", (qty) => qty],
  ["festa_50:buffet_festa50", (qty) => qty],
  ["festa_50:openbar_festa50", (qty) => qty],
  ["festa_50:drinks_festa50", (qty) => qty],
  ["festa_50:camisa_festa50", (qty) => qty],
  ["ensaio_fotografico:beca_formatura_ensaio", (qty) => qty],
  ["ensaio_fotografico:coffee_break_ensaio", (qty) => qty],
  ["ensaio_50:sessao_fotografica_ensaio50", (qty) => qty],
  ["ensaio_50:coffee_break_ensaio50", (qty) => qty],
  ["ensaio_365:sessao_fotografica_ensaio365", (qty) => qty],
  ["ensaio_365:coffee_break_ensaio365", (qty) => qty],
  ["festa_365:buffet_festa365", (qty) => qty],
  ["festa_365:openbar_festa365", (qty) => qty],
  ["festa_365:drinks_festa365", (qty) => qty],
  ["festa_365:camisa_festa365", (qty) => qty],
  ["cobertura_fotografica:sessao_fotografica_solenidades", (qty) => qty],
  ["evento_100_dias:open_bar_100dias", (qty) => qty],
]);

function getItemKey(sourceItem?: SourceItemLike) {
  if (!sourceItem?.sourceEventId) return undefined;
  return `${sourceItem.sourceEventId}:${sourceItem.id}`;
}

function isPriceEditableForKey(itemKey?: string) {
  if (!itemKey) return true;
  return PRICE_EDITABLE_KEYS.has(itemKey) || PRICE_EDITABLE_KEYS.has(`${itemKey.split(":")[0]}:*`);
}

export function deriveAddedItemBehavior({
  sourceItem,
  targetParticipationQty,
  manualQuantity,
  manualUnitPrice,
  manualIsNoFixedValue,
}: DeriveAddedItemBehaviorParams): AddedItemBehavior {
  const itemKey = getItemKey(sourceItem);
  const dynamicByStudents = Boolean(sourceItem?.dynamicByStudents);

  if (!sourceItem || !itemKey) {
    const quantityEditable = sourceItem?.quantityEditable ?? !manualIsNoFixedValue;
    const priceEditable = sourceItem?.priceEditable ?? !manualIsNoFixedValue;
    const additionalQty = getAdditionalQty(sourceItem);
    const multiplier = getMultiplier(sourceItem);
    const baseDefault = sourceItem?.defaultQuantity ?? sourceItem?.fixedQty;
    const defaultQuantity =
      baseDefault !== undefined ? baseDefault * multiplier + additionalQty : manualQuantity;
    const quantity = quantityEditable
      ? manualQuantity
      : dynamicByStudents
        ? Math.max(1, targetParticipationQty) * multiplier + additionalQty
        : defaultQuantity;

    return {
      quantity,
      unitPrice: manualIsNoFixedValue ? 0 : priceEditable ? manualUnitPrice : (sourceItem?.unitPrice ?? manualUnitPrice),
      isNoFixedValue: Boolean(manualIsNoFixedValue),
      quantityEditable,
      priceEditable,
      dynamicByStudents,
      displayValue: manualIsNoFixedValue ? "Incluso" : undefined,
    };
  }

  if (itemKey === "itens_descerramento_placa:administracao") {
    return {
      quantity: 0,
      unitPrice: 0,
      isNoFixedValue: true,
      quantityEditable: false,
      priceEditable: false,
      dynamicByStudents: false,
      displayValue: "-",
      quantityDisplay: "-",
    };
  }

  const quantityEditable = QUANTITY_EDITABLE_KEYS.has(itemKey);
  const quantityFactory = PARTICIPATION_QTY_FACTORIES.get(itemKey);
  const derivedQuantity = quantityFactory
    ? quantityFactory(Math.max(1, targetParticipationQty))
    : sourceItem.fixedQty ?? manualQuantity;
  const quantity = quantityEditable
    ? derivedQuantity
    : sourceItem.fixedQty ?? manualQuantity;

  const isNoFixedValue = Boolean(sourceItem.displayValue) || Boolean(manualIsNoFixedValue);
  const priceEditable = !isNoFixedValue && isPriceEditableForKey(itemKey);
  const unitPrice = isNoFixedValue ? 0 : priceEditable ? manualUnitPrice : sourceItem.unitPrice;

  return {
    quantity,
    unitPrice,
    isNoFixedValue,
    quantityEditable,
    priceEditable,
    dynamicByStudents,
    displayValue: sourceItem.displayValue,
  };
}
