import type { BudgetCatalogEvent } from "../data/budgetCatalog";

type AddedItemLike = {
  quantity?: number;
  unitPrice?: number;
  isNoFixedValue?: boolean;
};

type CustomItemsState = Record<
  string,
  {
    added?: AddedItemLike[];
    removedIds?: string[];
  }
>;

type SummaryBuildContext = {
  eventId: string;
  participationQty: number;
  getItemNumber: (eventId: string, key: string, fallback: number) => number;
  getItemRaw: (eventId: string, key: string) => unknown;
  getParticipationQty: (eventId: string) => number;
  getAddedItemsTotal: (eventId: string) => number;
  isItemActive: (itemId: string) => boolean;
  defaultAuditoriumPrice: number;
  getMusicAttractionLabel: (type: string | null | undefined) => string;
};

export function getItemsStepAddedItemsTotal(
  customItems: CustomItemsState,
  eventId: string,
) {
  return (customItems[eventId]?.added || []).reduce(
    (acc: number, val: AddedItemLike) =>
      acc + (val.isNoFixedValue ? 0 : (val.quantity || 0) * (val.unitPrice || 0)),
    0,
  );
}

export function createItemsStepItemActiveResolver(
  customItems: CustomItemsState,
  eventId: string,
) {
  const removedIdsEvent = customItems[eventId]?.removedIds || [];
  return (itemId: string) => !removedIdsEvent.includes(itemId);
}

export function buildSimpleEnsaioSummary(
  context: SummaryBuildContext,
  coffeeItemId: "coffee_break_ensaio50" | "coffee_break_ensaio365",
  valorOrcamento = 19000,
) {
  const ensaioQty = context.getParticipationQty("ensaio_fotografico");
  const coffeeQty = context.getItemNumber(context.eventId, coffeeItemId, ensaioQty);
  const coffeePrice = context.getItemNumber(context.eventId, `${coffeeItemId}_price`, 65);
  const subTotal =
    coffeeQty * coffeePrice * (context.isItemActive(coffeeItemId) ? 1 : 0) +
    valorOrcamento +
    context.getAddedItemsTotal(context.eventId);
  const administracao = subTotal * 0.1;

  return {
    coffeeQty,
    coffeePrice,
    valorOrcamento,
    subTotal,
    administracao,
    isCoffeeActive: context.isItemActive(coffeeItemId),
  };
}

export function buildFestaSummary(context: SummaryBuildContext) {
  const suffix = context.eventId === "festa_50" ? "festa50" : "festa365";
  const drinksItemId = `drinks_${suffix}`;
  const camisaItemId = `camisa_${suffix}`;
  const buffetItemId = `buffet_${suffix}`;
  const openbarItemId = `openbar_${suffix}`;
  const djItemId = context.eventId === "festa_50" ? "dj_festa50" : "dj_festa365";

  const drinksQty = context.getItemNumber(
    context.eventId,
    drinksItemId,
    context.getParticipationQty(context.eventId),
  );
  const drinksPrice = context.getItemNumber(context.eventId, `${drinksItemId}_price`, 80);
  const camisaQty = context.getItemNumber(
    context.eventId,
    camisaItemId,
    context.getParticipationQty(context.eventId),
  );
  const camisaPrice = context.getItemNumber(context.eventId, `${camisaItemId}_price`, 65);
  const buffetQty = context.getItemNumber(
    context.eventId,
    buffetItemId,
    context.getParticipationQty(context.eventId),
  );
  const buffetPrice = context.getItemNumber(context.eventId, `${buffetItemId}_price`, 65);
  const openbarQty = context.getItemNumber(
    context.eventId,
    openbarItemId,
    context.getParticipationQty(context.eventId),
  );
  const openbarPrice = context.getItemNumber(context.eventId, `${openbarItemId}_price`, 65);
  const atracaoQty = context.getItemNumber(context.eventId, djItemId, 1);
  const atracaoPrice = context.getItemNumber(context.eventId, `${djItemId}_price`, 700);
  const atracaoVariationLabel = context.getItemRaw(
    context.eventId,
    `${djItemId}_variation_label`,
  ) as string | undefined;
  const atracaoType = (context.getItemRaw(context.eventId, "atracao_musical_type") as string) || "dj";
  const valorEvento = 18500;
  const subTotal =
    buffetQty * buffetPrice * (context.isItemActive(buffetItemId) ? 1 : 0) +
    openbarQty * openbarPrice * (context.isItemActive(openbarItemId) ? 1 : 0) +
    atracaoQty * atracaoPrice * (context.isItemActive(djItemId) ? 1 : 0) +
    drinksQty * drinksPrice * (context.isItemActive(drinksItemId) ? 1 : 0) +
    camisaQty * camisaPrice * (context.isItemActive(camisaItemId) ? 1 : 0) +
    valorEvento +
    context.getAddedItemsTotal(context.eventId);
  const administracao = subTotal * 0.1;

  return {
    buffetQty,
    buffetPrice,
    openbarQty,
    openbarPrice,
    atracaoPrice,
    atracaoLabel:
      typeof atracaoVariationLabel === "string" && atracaoVariationLabel.trim()
        ? `Atração Musical (${atracaoVariationLabel.trim()})`
        : context.getMusicAttractionLabel(atracaoType),
    drinksQty,
    drinksPrice,
    camisaQty,
    camisaPrice,
    valorEvento,
    subTotal,
    administracao,
    isBuffetActive: context.isItemActive(buffetItemId),
    isOpenbarActive: context.isItemActive(openbarItemId),
    isAtracaoActive: context.isItemActive(djItemId),
    isDrinksActive: context.isItemActive(drinksItemId),
    isCamisaActive: context.isItemActive(camisaItemId),
  };
}

export function buildAulaSaudadeSummary(context: SummaryBuildContext) {
  const buffetQty = context.getItemNumber(
    context.eventId,
    "servicos_buffet",
    context.participationQty + 5,
  );
  const buffetPrice = context.getItemNumber(context.eventId, "servicos_buffet_price", 130);
  const bebidasQty = context.getItemNumber(
    context.eventId,
    "bebidas_open_bar",
    context.participationQty + 5,
  );
  const bebidasPrice = context.getItemNumber(context.eventId, "bebidas_open_bar_price", 65);
  const drinksQty = context.getItemNumber(context.eventId, "drinks", context.participationQty);
  const drinksPrice = context.getItemNumber(context.eventId, "drinks_price", 80);
  const atracaoQty = context.getItemNumber(context.eventId, "atracao_musical", 1);
  const atracaoPrice = context.getItemNumber(context.eventId, "atracao_musical_price", 660);
  const atracaoVariationLabel = context.getItemRaw(
    context.eventId,
    "atracao_musical_variation_label",
  ) as string | undefined;
  const atracaoType = (context.getItemRaw(context.eventId, "atracao_musical_type") as string) || "dj";
  const buffetTotal =
    buffetQty * buffetPrice * (context.isItemActive("servicos_buffet") ? 1 : 0) +
    bebidasQty * bebidasPrice * (context.isItemActive("bebidas_open_bar") ? 1 : 0);
  const drinksTotal = drinksQty * drinksPrice * (context.isItemActive("drinks") ? 1 : 0);
  const valorFixo = 28000;
  const subTotal =
    buffetTotal +
    drinksTotal +
    valorFixo +
    atracaoQty * atracaoPrice * (context.isItemActive("atracao_musical") ? 1 : 0) +
    context.getAddedItemsTotal(context.eventId);
  const administracao = subTotal * 0.1;

  return {
    buffetTotal,
    drinksQty,
    drinksPrice,
    drinksTotal,
    atracaoPrice,
    atracaoLabel:
      typeof atracaoVariationLabel === "string" && atracaoVariationLabel.trim()
        ? `Atração Musical (${atracaoVariationLabel.trim()})`
        : context.getMusicAttractionLabel(atracaoType),
    valorFixo,
    subTotal,
    administracao,
    isBuffetActive:
      context.isItemActive("servicos_buffet") || context.isItemActive("bebidas_open_bar"),
    isDrinksActive: context.isItemActive("drinks"),
    isAtracaoActive: context.isItemActive("atracao_musical"),
  };
}

export function buildMissaSummary(context: SummaryBuildContext) {
  const missalQty = context.getItemNumber(context.eventId, "livro_missal", context.participationQty * 10);
  const missalPrice = context.getItemNumber(context.eventId, "livro_missal_price", 10);
  const sacraPrice = context.getItemNumber(context.eventId, "musica_sacra_price", 830);
  const taxaPrice = context.getItemNumber(context.eventId, "taxa_igreja_price", 950);
  const valorFixo = 11000;
  const subTotal =
    missalQty * missalPrice * (context.isItemActive("livro_missal") ? 1 : 0) +
    sacraPrice * (context.isItemActive("musica_sacra") ? 1 : 0) +
    taxaPrice * (context.isItemActive("taxa_igreja") ? 1 : 0) +
    valorFixo +
    context.getAddedItemsTotal(context.eventId);
  const administracao = subTotal * 0.1;

  return {
    missalQty,
    missalPrice,
    sacraPrice,
    taxaPrice,
    valorFixo,
    subTotal,
    administracao,
    isMissalActive: context.isItemActive("livro_missal"),
    isSacraActive: context.isItemActive("musica_sacra"),
    isTaxaActive: context.isItemActive("taxa_igreja"),
  };
}

export function buildEnsaioFotograficoSummary(context: SummaryBuildContext) {
  const becaQty = context.getItemNumber(context.eventId, "beca_formatura_ensaio", context.participationQty);
  const becaPrice = context.getItemNumber(context.eventId, "beca_formatura_ensaio_price", 80);
  const coffeeQty = context.getItemNumber(context.eventId, "coffee_break_ensaio", context.participationQty);
  const coffeePrice = context.getItemNumber(context.eventId, "coffee_break_ensaio_price", 65);
  const valorFixo = 19000;
  const subTotal =
    becaQty * becaPrice * (context.isItemActive("beca_formatura_ensaio") ? 1 : 0) +
    coffeeQty * coffeePrice * (context.isItemActive("coffee_break_ensaio") ? 1 : 0) +
    valorFixo +
    context.getAddedItemsTotal(context.eventId);
  const administracao = subTotal * 0.1;

  return {
    becaQty,
    becaPrice,
    coffeeQty,
    coffeePrice,
    valorFixo,
    subTotal,
    administracao,
    isBecaActive: context.isItemActive("beca_formatura_ensaio"),
    isCoffeeActive: context.isItemActive("coffee_break_ensaio"),
  };
}

export function buildDescerramentoSummary(context: SummaryBuildContext) {
  const replicaQty = context.getItemNumber(context.eventId, "replica_placa", context.participationQty);
  const replicaPrice = context.getItemNumber(context.eventId, "replica_placa_price", 65);
  const coffeeQty = context.getItemNumber(context.eventId, "coffee_break", context.participationQty);
  const coffeePrice = context.getItemNumber(context.eventId, "coffee_break_price", 65);
  const replicaTotal = replicaQty * replicaPrice * (context.isItemActive("replica_placa") ? 1 : 0);
  const coffeeTotal = coffeeQty * coffeePrice * (context.isItemActive("coffee_break") ? 1 : 0);
  const valorFixo = 5850;
  const subTotal = replicaTotal + coffeeTotal + valorFixo + context.getAddedItemsTotal(context.eventId);
  const administracao = subTotal * 0.1;

  return {
    replicaQty,
    replicaPrice,
    replicaTotal,
    coffeeQty,
    coffeePrice,
    coffeeTotal,
    valorFixo,
    subTotal,
    administracao,
    isReplicaActive: context.isItemActive("replica_placa"),
    isCoffeeActive: context.isItemActive("coffee_break"),
  };
}

export function buildColacaoSummary(context: SummaryBuildContext) {
  const recepQty = context.getItemNumber(context.eventId, "recepcionista_apoio_col", 1);
  const recepPrice = context.getItemNumber(context.eventId, "recepcionista_apoio_col_price", 320);
  const placaPrice = context.getItemNumber(context.eventId, "placa_formatura_col_price", 2750);
  const replicaQty = context.getItemNumber(context.eventId, "replica_placa_col", context.participationQty);
  const replicaPrice = context.getItemNumber(context.eventId, "replica_placa_col_price", 65);
  const itensDescerramento =
    recepQty * recepPrice * (context.isItemActive("recepcionista_apoio_col") ? 1 : 0) +
    placaPrice * (context.isItemActive("placa_formatura_col") ? 1 : 0) +
    replicaQty * replicaPrice * (context.isItemActive("replica_placa_col") ? 1 : 0);
  const becasQty = context.getItemNumber(context.eventId, "becas_formandos_col", context.participationQty);
  const becasPrice = context.getItemNumber(context.eventId, "becas_formandos_col_price", 80);
  const canudosQty = context.getItemNumber(context.eventId, "canudos_col", context.participationQty);
  const canudosPrice = context.getItemNumber(context.eventId, "canudos_col_price", 65);
  const auditorio =
    context.getItemNumber(context.eventId, "locacao_auditorio_col_price", context.defaultAuditoriumPrice) *
    (context.isItemActive("locacao_auditorio_col") ? 1 : 0);
  const painelQty = context.getItemNumber(context.eventId, "painel_led_col", context.participationQty);
  const painelPrice = context.getItemNumber(context.eventId, "painel_led_col_price", 320);
  const arquiQty = context.getItemNumber(context.eventId, "arquibancada_col", context.participationQty);
  const arquiPrice = context.getItemNumber(context.eventId, "arquibancada_col_price", 25);
  const valorEvento =
    itensDescerramento +
    becasQty * becasPrice * (context.isItemActive("becas_formandos_col") ? 1 : 0) +
    canudosQty * canudosPrice * (context.isItemActive("canudos_col") ? 1 : 0) +
    auditorio +
    painelQty * painelPrice * (context.isItemActive("painel_led_col") ? 1 : 0) +
    arquiQty * arquiPrice * (context.isItemActive("arquibancada_col") ? 1 : 0);
  const subTotal =
    valorEvento +
    itensDescerramento +
    becasQty * becasPrice * (context.isItemActive("becas_formandos_col") ? 1 : 0) +
    canudosQty * canudosPrice * (context.isItemActive("canudos_col") ? 1 : 0) +
    auditorio +
    painelQty * painelPrice * (context.isItemActive("painel_led_col") ? 1 : 0) +
    arquiQty * arquiPrice * (context.isItemActive("arquibancada_col") ? 1 : 0) +
    context.getAddedItemsTotal(context.eventId);
  const administracao = subTotal * 0.1;

  return {
    itensDescerramento,
    becasQty,
    becasPrice,
    canudosQty,
    canudosPrice,
    auditorio,
    painelQty,
    painelPrice,
    arquiQty,
    arquiPrice,
    valorEvento,
    subTotal,
    administracao,
    isItensDescerramentoActive:
      context.isItemActive("recepcionista_apoio_col") ||
      context.isItemActive("placa_formatura_col") ||
      context.isItemActive("replica_placa_col"),
    isBecasActive: context.isItemActive("becas_formandos_col"),
    isCanudosActive: context.isItemActive("canudos_col"),
    isAuditorioActive: context.isItemActive("locacao_auditorio_col"),
    isPainelActive: context.isItemActive("painel_led_col"),
    isArquibancadaActive: context.isItemActive("arquibancada_col"),
  };
}

export function buildCerimoniaSummary(context: SummaryBuildContext) {
  const becasQty = context.getItemNumber(
    context.eventId,
    "becas_formandos_cerimonia",
    context.participationQty,
  );
  const becasPrice = context.getItemNumber(context.eventId, "becas_formandos_cerimonia_price", 80);
  const canudosQty = context.getItemNumber(context.eventId, "canudos_cerimonia", context.participationQty);
  const canudosPrice = context.getItemNumber(context.eventId, "canudos_cerimonia_price", 35);
  const auditorio =
    context.getItemNumber(
      context.eventId,
      "locacao_auditorio_cerimonia_price",
      context.defaultAuditoriumPrice,
    ) * (context.isItemActive("locacao_auditorio_cerimonia") ? 1 : 0);
  const arquiQty = context.getItemNumber(context.eventId, "arquibancada_cerimonia", context.participationQty);
  const arquiPrice = context.getItemNumber(context.eventId, "arquibancada_cerimonia_price", 25);
  const placaQty = context.getItemNumber(context.eventId, "placa_led_cerimonia", context.participationQty);
  const placaPrice = context.getItemNumber(context.eventId, "placa_led_cerimonia_price", 320);
  const valorEvento = 18000;
  const subTotal =
    auditorio +
    becasQty * becasPrice * (context.isItemActive("becas_formandos_cerimonia") ? 1 : 0) +
    canudosQty * canudosPrice * (context.isItemActive("canudos_cerimonia") ? 1 : 0) +
    arquiQty * arquiPrice * (context.isItemActive("arquibancada_cerimonia") ? 1 : 0) +
    placaQty * placaPrice * (context.isItemActive("placa_led_cerimonia") ? 1 : 0) +
    valorEvento +
    context.getAddedItemsTotal(context.eventId);
  const administracao = subTotal * 0.1;

  return {
    becasQty,
    becasPrice,
    canudosQty,
    canudosPrice,
    auditorio,
    arquiQty,
    arquiPrice,
    placaQty,
    placaPrice,
    valorEvento,
    subTotal,
    administracao,
    isBecasActive: context.isItemActive("becas_formandos_cerimonia"),
    isCanudosActive: context.isItemActive("canudos_cerimonia"),
    isAuditorioActive: context.isItemActive("locacao_auditorio_cerimonia"),
    isArquibancadaActive: context.isItemActive("arquibancada_cerimonia"),
    isPlacaActive: context.isItemActive("placa_led_cerimonia"),
  };
}

export function getCourtesyDisplayTotal(
  canonicalEventId: string,
  event: BudgetCatalogEvent,
  getItemNumber: SummaryBuildContext["getItemNumber"],
) {
  if (canonicalEventId === "culto_cortesia") {
    return event.items.reduce((acc, item) => {
      const qty = getItemNumber(event.id, item.id, 0);
      const dynamicPrice = getItemNumber(event.id, `${item.id}_price`, 0);
      return acc + qty * dynamicPrice;
    }, 0);
  }

  if (canonicalEventId === "evento_100_dias") {
    return 0;
  }

  return null;
}
