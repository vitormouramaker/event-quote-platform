export type SpecialEventQtyRule =
  | { mode: "fixed"; value: number }
  | {
      mode: "event_participation";
      sourceEventId?: string;
      fallbackToCurrentEvent?: boolean;
      multiplier?: number;
      add?: number;
    };

export interface SpecialEventItemConfig {
  itemId: string;
  qtyRule: SpecialEventQtyRule;
  defaultPrice: number;
  allowSummaryDiscount?: boolean;
}

export interface SpecialEventFallbackConfig {
  items: SpecialEventItemConfig[];
  fixedAmounts?: number[];
  subtotalMultiplier?: number;
  taxRate?: number;
}

export const SPECIAL_EVENT_FALLBACK_CONFIGS: Record<string, SpecialEventFallbackConfig> = {
  descerramento_placa: {
    items: [
      {
        itemId: "replica_placa",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 65,
        allowSummaryDiscount: true,
      },
      {
        itemId: "coffee_break",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 65,
        allowSummaryDiscount: true,
      },
    ],
    fixedAmounts: [5850],
    taxRate: 0.1,
  },
  aula_saudade: {
    items: [
      {
        itemId: "servicos_buffet",
        qtyRule: { mode: "event_participation", add: 5 },
        defaultPrice: 130,
      },
      {
        itemId: "bebidas_open_bar",
        qtyRule: { mode: "event_participation", add: 5 },
        defaultPrice: 65,
      },
      {
        itemId: "drinks",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 80,
      },
      {
        itemId: "atracao_musical",
        qtyRule: { mode: "fixed", value: 1 },
        defaultPrice: 660,
      },
    ],
    fixedAmounts: [28000],
    taxRate: 0.1,
  },
  missa_culto: {
    items: [
      {
        itemId: "livro_missal",
        qtyRule: { mode: "event_participation", multiplier: 10 },
        defaultPrice: 10,
      },
      {
        itemId: "musica_sacra",
        qtyRule: { mode: "fixed", value: 1 },
        defaultPrice: 830,
      },
      {
        itemId: "taxa_igreja",
        qtyRule: { mode: "fixed", value: 1 },
        defaultPrice: 950,
      },
    ],
    fixedAmounts: [11000],
    taxRate: 0.1,
  },
  colacao_descerramento: {
    items: [
      {
        itemId: "recepcionista_apoio_col",
        qtyRule: { mode: "fixed", value: 1 },
        defaultPrice: 320,
      },
      {
        itemId: "placa_formatura_col",
        qtyRule: { mode: "fixed", value: 1 },
        defaultPrice: 2750,
      },
      {
        itemId: "replica_placa_col",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 65,
      },
      {
        itemId: "becas_formandos_col",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 80,
      },
      {
        itemId: "canudos_col",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 65,
      },
      {
        itemId: "locacao_auditorio_col",
        qtyRule: { mode: "fixed", value: 1 },
        defaultPrice: 7000,
      },
      {
        itemId: "painel_led_col",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 320,
      },
      {
        itemId: "arquibancada_col",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 25,
      },
    ],
    subtotalMultiplier: 2,
    taxRate: 0.1,
  },
  cerimonia_colacao: {
    items: [
      {
        itemId: "becas_formandos_cerimonia",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 80,
      },
      {
        itemId: "canudos_cerimonia",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 35,
      },
      {
        itemId: "locacao_auditorio_cerimonia",
        qtyRule: { mode: "fixed", value: 1 },
        defaultPrice: 7000,
      },
      {
        itemId: "arquibancada_cerimonia",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 25,
      },
      {
        itemId: "placa_led_cerimonia",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 320,
      },
    ],
    fixedAmounts: [18000],
    taxRate: 0.1,
  },
  festa_50: {
    items: [
      {
        itemId: "buffet_festa50",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 65,
      },
      {
        itemId: "openbar_festa50",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 65,
      },
      {
        itemId: "drinks_festa50",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 80,
      },
      {
        itemId: "camisa_festa50",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 65,
      },
      {
        itemId: "dj_festa50",
        qtyRule: { mode: "fixed", value: 1 },
        defaultPrice: 700,
      },
    ],
    fixedAmounts: [18500],
    taxRate: 0.1,
  },
  ensaio_50: {
    items: [
      {
        itemId: "coffee_break_ensaio50",
        qtyRule: {
          mode: "event_participation",
          sourceEventId: "ensaio_fotografico",
          fallbackToCurrentEvent: true,
        },
        defaultPrice: 65,
      },
    ],
    fixedAmounts: [19000],
    taxRate: 0.1,
  },
  ensaio_365: {
    items: [
      {
        itemId: "coffee_break_ensaio365",
        qtyRule: {
          mode: "event_participation",
          sourceEventId: "ensaio_fotografico",
          fallbackToCurrentEvent: true,
        },
        defaultPrice: 65,
      },
    ],
    fixedAmounts: [19000],
    taxRate: 0.1,
  },
  ensaio_fotografico: {
    items: [
      {
        itemId: "beca_formatura_ensaio",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 80,
      },
      {
        itemId: "coffee_break_ensaio",
        qtyRule: { mode: "event_participation" },
        defaultPrice: 65,
      },
    ],
    fixedAmounts: [19000],
    taxRate: 0.1,
  },
};
