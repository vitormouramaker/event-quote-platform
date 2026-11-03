export type CanonicalQuantityRule =
  | { type: "fixed"; value: number }
  | { type: "same"; source: "participants" }
  | { type: "add"; source: "participants"; value: number }
  | { type: "multiply"; source: "participants"; value: number }
  | { type: "manual" }
  | { type: "included_context" };

export type CanonicalPriceRule =
  | { type: "included" }
  | { type: "fixed_value"; value: number }
  | { type: "editable_default"; value: number }
  | { type: "selected_variant_value"; selectorSlug: string };

export interface CanonicalVariantOption {
  slug: string;
  label: string;
  value?: number;
}

export interface CanonicalSelectorDefinition {
  slug: string;
  label: string;
  options: CanonicalVariantOption[];
}

export interface CanonicalItemDefinition {
  slug: string;
  label: string;
  kind: "standard" | "container" | "selector" | "computed_reference";
  category:
    | "operations"
    | "ceremony"
    | "food_and_beverage"
    | "photo"
    | "religious"
    | "structure"
    | "special";
}

export interface CanonicalSubItemDefinition {
  slug: string;
  label: string;
  category:
    | "beverage"
    | "furniture"
    | "textile"
    | "floral"
    | "structure"
    | "lighting"
    | "panel";
  hasPrice?: boolean;
  hasQuantity?: boolean;
}

export interface CanonicalSummaryDefinition {
  slug: string;
  label: string;
  type:
    | "sum"
    | "percentage_of"
    | "division"
    | "fixed_value"
    | "display_included"
    | "display_dash"
    | "display_participants"
    | "same_value_of";
}

export interface CanonicalEventItemDefinition {
  itemSlug: string;
  quantityRule?: CanonicalQuantityRule;
  priceRule?: CanonicalPriceRule;
  quantityEditable?: boolean;
  priceEditable?: boolean;
  variantSelectorSlug?: string;
  subItemSlugs?: string[];
  formulaSlug?: string;
  sortOrder: number;
}

export interface CanonicalEventSummaryLine {
  slug: string;
  label: string;
  type: CanonicalSummaryDefinition["type"];
  percentage?: number;
  sources?: string[];
  numerator?: string;
  denominator?: "participants" | string;
  value?: number;
  source?: string;
}

export interface CanonicalEventDefinition {
  slug: string;
  label: string;
  items: CanonicalEventItemDefinition[];
  summary: CanonicalEventSummaryLine[];
}

export interface LegacyAliasDefinition {
  legacyKey: string;
  canonicalSlug: string;
  aliasType: "event" | "item";
  notes?: string;
}

export const canonicalSelectors: CanonicalSelectorDefinition[] = [
  {
    slug: "locacao_auditorio",
    label: "Locacao do Auditorio",
    options: [
      { slug: "cristal", label: "Cristal", value: 7000 },
      { slug: "platina", label: "Platina", value: 13500 },
    ],
  },
  {
    slug: "atracao_musical_verba",
    label: "Atracao Musical - Verba",
    options: [
      { slug: "dj", label: "DJ" },
      { slug: "banda", label: "Banda" },
    ],
  },
];

export const canonicalSummaryDefinitions: CanonicalSummaryDefinition[] = [
  { slug: "administracao_percentual", label: "Administracao", type: "percentage_of" },
  { slug: "administracao_inclusa", label: "Administracao", type: "display_included" },
  { slug: "administracao_traco", label: "Administracao", type: "display_dash" },
  { slug: "subtotal", label: "Sub Total", type: "sum" },
  { slug: "total_geral", label: "Total Geral", type: "sum" },
  { slug: "valor_evento_fixo", label: "Valor do Evento", type: "fixed_value" },
  { slug: "valor_orcamento_fixo", label: "Valor do Orcamento", type: "fixed_value" },
  { slug: "valor_por_formando", label: "Valor por Formando", type: "division" },
  { slug: "quantidade_formandos_display", label: "Quantidade de Formandos", type: "display_participants" },
  { slug: "buffet", label: "Buffet", type: "sum" },
  { slug: "valor_total_itens_descerramento", label: "Valor Total de Itens do Descerramento", type: "sum" },
];

export const canonicalItems: CanonicalItemDefinition[] = [
  { slug: "recepcionista", label: "RECEPCIONISTA", kind: "standard", category: "operations" },
  { slug: "recepcionistas", label: "RECEPCIONISTAS", kind: "standard", category: "operations" },
  { slug: "recepcionista_apoio", label: "RECEPCIONISTA E APOIO", kind: "standard", category: "operations" },
  { slug: "pessoa_apoio", label: "PESSOA DE APOIO", kind: "standard", category: "operations" },
  { slug: "pessoa_apoio_sonoplastia", label: "PESSOA DE APOIO - SONOPLASTIA", kind: "standard", category: "operations" },
  { slug: "seguranca", label: "SEGURANCA", kind: "standard", category: "operations" },
  { slug: "segurancas", label: "SEGURANCAS", kind: "standard", category: "operations" },
  { slug: "garcon_mesa_honra", label: "GARCON PARA SERVICO DA MESA DE HONRA", kind: "standard", category: "operations" },
  { slug: "mestre_cerimonia", label: "MESTRE DE CERIMONIA", kind: "standard", category: "operations" },
  { slug: "ensaio", label: "ENSAIO", kind: "standard", category: "operations" },
  { slug: "producao_espaco_assinatura_ata", label: "PRODUCAO DO ESPACO / ASSINATURA DE ATA", kind: "standard", category: "operations" },
  { slug: "placa_formatura", label: "PLACA DE FORMATURA", kind: "standard", category: "ceremony" },
  { slug: "replica_placa_15x20", label: "REPLICA DA PLACA 15X20", kind: "standard", category: "ceremony" },
  { slug: "canudos_personalizados", label: "CANUDOS PERSONALIZADOS", kind: "standard", category: "ceremony" },
  { slug: "becas_luxo_formandos", label: "BECAS DE LUXO PARA FORMANDOS", kind: "standard", category: "ceremony" },
  { slug: "becas_luxo_professores", label: "BECAS DE LUXO PARA PROFESSORES", kind: "standard", category: "ceremony" },
  { slug: "beca_formatura", label: "BECA DE FORMATURA", kind: "standard", category: "ceremony" },
  { slug: "cadeiras_formandos", label: "CADEIRAS PARA FORMANDOS", kind: "standard", category: "ceremony" },
  { slug: "arquibancada_formandos", label: "ARQUIBANCADA PARA FORMANDOS", kind: "standard", category: "ceremony" },
  { slug: "painel_led", label: "PAINEL DE LED", kind: "standard", category: "ceremony" },
  { slug: "placa_led", label: "PLACA DE LED", kind: "standard", category: "ceremony" },
  { slug: "locacao_auditorio", label: "LOCACAO DO AUDITORIO", kind: "selector", category: "ceremony" },
  { slug: "servicos_buffet_formandos", label: "SERVICOS DE BUFFET (FORMANDOS)", kind: "standard", category: "food_and_beverage" },
  { slug: "servicos_buffet_formandos_professores", label: "SERVICOS DE BUFFET (FORMANDOS E 05 PROFESSORES)", kind: "standard", category: "food_and_beverage" },
  { slug: "bebidas_open_bar_4h", label: "BEBIDAS: OPEN BAR PARA 04 HORAS DE FESTA", kind: "standard", category: "food_and_beverage" },
  { slug: "drinks", label: "DRINKS", kind: "standard", category: "food_and_beverage" },
  { slug: "coffee_break_formandos", label: "COFFEE BREAK PARA FORMANDOS", kind: "standard", category: "food_and_beverage" },
  { slug: "brinde_champanhe", label: "BRINDE COM CHAMPANHE", kind: "standard", category: "food_and_beverage" },
  { slug: "verba_camisa", label: "VERBA PARA CAMISA", kind: "standard", category: "food_and_beverage" },
  { slug: "atracao_musical_verba", label: "ATRACAO MUSICAL - VERBA", kind: "selector", category: "food_and_beverage" },
  { slug: "sessao_fotografica_formandos", label: "SESSAO FOTOGRAFICA DOS FORMANDOS", kind: "standard", category: "photo" },
  { slug: "sessao_fotografica_eventos_contratados", label: "SESSAO FOTOGRAFICA DOS EVENTOS CONTRATADOS", kind: "standard", category: "photo" },
  { slug: "fotos_coletivas_individuais", label: "FOTOS COLETIVAS E INDIVIDUAIS", kind: "standard", category: "photo" },
  { slug: "link_fotos", label: "LINK COM AS FOTOS", kind: "standard", category: "photo" },
  { slug: "cenarios_lounge_espacos_fotos", label: "CENARIOS COM LOUNGE E ESPACOS PARA FOTOS", kind: "standard", category: "photo" },
  { slug: "espaco_beleza", label: "ESPACO BELEZA", kind: "standard", category: "photo" },
  { slug: "acessorios_fotos", label: "ACESSORIOS PARA FOTOS", kind: "standard", category: "photo" },
  { slug: "escada_foto_coletiva", label: "ESCADA PARA FOTO COLETIVA", kind: "standard", category: "photo" },
  { slug: "local_grupo_aurora_4h", label: "LOCAL GRUPO AURORA DURACAO 4 HORAS", kind: "standard", category: "photo" },
  { slug: "livro_missal_personalizado", label: "LIVRO MISSAL PERSONALIZADO", kind: "standard", category: "religious" },
  { slug: "musica_sacra_verba", label: "MUSICA SACRA - VERBA", kind: "standard", category: "religious" },
  { slug: "taxa_igreja_verba", label: "TAXA DA IGREJA - VERBA", kind: "standard", category: "religious" },
  { slug: "rosas_padrinhos", label: "ROSAS PARA PADRINHOS", kind: "standard", category: "religious" },
  { slug: "marcadores_bancos_padrinhos", label: "MARCADORES DE BANCOS / PADRINHOS", kind: "standard", category: "religious" },
  { slug: "placas_homenagem_professores", label: "PLACAS DE HOMENAGEM / PROFESSORES", kind: "standard", category: "religious" },
  { slug: "buque_ofertorio", label: "BUQUE / OFERTORIO", kind: "standard", category: "religious" },
  { slug: "passadeira", label: "PASSADEIRA", kind: "standard", category: "religious" },
  { slug: "arranjos_placa", label: "ARRANJOS PARA PLACA", kind: "standard", category: "structure" },
  { slug: "arranjos_entrada", label: "ARRANJOS PARA ENTRADA", kind: "standard", category: "structure" },
  { slug: "arranjos_palco", label: "ARRANJOS DE PALCO", kind: "standard", category: "structure" },
  { slug: "arranjos_nave_igreja", label: "ARRANJOS PARA NAVE DA IGREJA", kind: "standard", category: "structure" },
  { slug: "arranjos_altar", label: "ARRANJOS PARA ALTAR", kind: "standard", category: "structure" },
  { slug: "arranjos_pulpito", label: "ARRANJOS PARA PULPITO", kind: "standard", category: "structure" },
  { slug: "arranjo_mesa_honra_gigante", label: "ARRANJO PARA MESA DE HONRA GIGANTE", kind: "standard", category: "structure" },
  { slug: "arranjo_grande", label: "ARRANJO GRANDE", kind: "standard", category: "structure" },
  { slug: "mesa_honra_toalha_aparador", label: "MESA DE HONRA COM TOALHA OU APARADOR", kind: "standard", category: "structure" },
  { slug: "tenda_entrada_trelicas", label: "TENDA PARA ENTRADA COM TRELICAS", kind: "standard", category: "structure" },
  { slug: "caixa_som_microfone", label: "CAIXA DE SOM COM MICROFONE", kind: "standard", category: "structure" },
  { slug: "tribuna_tecido_placa", label: "TRIBUNA / TECIDO PARA PLACA", kind: "standard", category: "structure" },
  { slug: "decoracao", label: "DECORACAO", kind: "container", category: "special" },
  { slug: "iluminacao", label: "ILUMINACAO", kind: "container", category: "special" },
  { slug: "decoracao_geral", label: "DECORACAO GERAL", kind: "container", category: "special" },
  { slug: "decoracao_geral_hall_entrada", label: "DECORACAO GERAL / HALL DE ENTRADA", kind: "container", category: "special" },
  { slug: "decoracao_palco_estrutura", label: "DECORACAO DE PALCO E ESTRUTURA", kind: "container", category: "special" },
  { slug: "decoracao_acordo_tema", label: "DECORACAO DE ACORDO COM O TEMA", kind: "container", category: "special" },
  { slug: "valor_total_itens_descerramento", label: "VALOR TOTAL DE ITENS DO DESCERRAMENTO", kind: "computed_reference", category: "special" },
];

export const canonicalSubItems: CanonicalSubItemDefinition[] = [
  { slug: "refri", label: "REFRI", category: "beverage" },
  { slug: "cerveja", label: "CERVEJA", category: "beverage" },
  { slug: "agua", label: "AGUA", category: "beverage" },
  { slug: "suco_natural", label: "SUCO NATURAL", category: "beverage" },
  { slug: "poltrona", label: "POLTRONA", category: "furniture" },
  { slug: "poltronas", label: "POLTRONAS", category: "furniture" },
  { slug: "poltronas_diversas", label: "POLTRONAS DIVERSAS", category: "furniture" },
  { slug: "sofa", label: "SOFA", category: "furniture" },
  { slug: "sofas", label: "SOFAS", category: "furniture" },
  { slug: "puffes", label: "PUFFES", category: "furniture" },
  { slug: "mesa_centro", label: "MESA DE CENTRO", category: "furniture" },
  { slug: "mesas_centro", label: "MESAS DE CENTRO", category: "furniture" },
  { slug: "mesa_bistro", label: "MESA BISTRO", category: "furniture" },
  { slug: "banquetas", label: "BANQUETAS", category: "furniture" },
  { slug: "aparadores", label: "APARADORES", category: "furniture" },
  { slug: "aparador_replicas", label: "APARADOR PARA REPLICAS", category: "furniture" },
  { slug: "mesa_buffet", label: "MESA PARA BUFFET", category: "furniture" },
  { slug: "mesa_honra", label: "MESA DE HONRA", category: "furniture" },
  { slug: "pulpito", label: "PULPITO", category: "furniture" },
  { slug: "lounge_foto", label: "LOUNGE PARA FOTO", category: "furniture" },
  { slug: "forracao_tecidos", label: "FORRACAO COM TECIDOS", category: "textile" },
  { slug: "forracao_tecidos_paredes", label: "FORRACAO COM TECIDOS NAS PAREDES", category: "textile" },
  { slug: "forracao_tecido_laterais_tenda", label: "FORRACAO COM TECIDO NAS LATERAIS DA TENDA", category: "textile" },
  { slug: "forracao_carpete", label: "FORRACAO COM CARPETE", category: "textile" },
  { slug: "carpete", label: "CARPETE", category: "textile" },
  { slug: "carpete_palco", label: "CARPETE PARA PALCO", category: "textile" },
  { slug: "tecidos_paredes", label: "TECIDOS PARA PAREDES", category: "textile" },
  { slug: "vasos_arranjos", label: "VASOS PARA ARRANJOS", category: "floral" },
  { slug: "vasos_decorativos", label: "VASOS DECORATIVOS", category: "floral" },
  { slug: "vaso_arranjo", label: "VASO PARA ARRANJO", category: "floral" },
  { slug: "arranjo_buffet", label: "ARRANJO PARA BUFFET", category: "floral" },
  { slug: "plantas_cachepo", label: "PLANTAS COM CACHEPO", category: "floral" },
  { slug: "pecas_arranjos", label: "PECAS PARA ARRANJOS", category: "floral" },
  { slug: "trelicas_aluminio_painel", label: "TRELICAS DE ALUMINIO PARA PAINEL", category: "structure" },
  { slug: "trelicas_aluminio_painel_espaco", label: "TRELICAS DE ALUMINIO PARA PAINEL E ESPACO", category: "structure" },
  { slug: "trelicas_aluminio_revestidas_tecidos", label: "TRELICAS DE ALUMINIO REVESTIDAS DE TECIDOS", category: "structure" },
  { slug: "escada_palco", label: "ESCADA PARA PALCO", category: "structure" },
  { slug: "tapetes", label: "TAPETES", category: "structure" },
  { slug: "placas_tema", label: "PLACAS COM TEMA", category: "structure" },
  { slug: "pecas_tema_escolhido", label: "PECAS RELACIONADAS AO TEMA ESCOLHIDO", category: "structure" },
  { slug: "itens_ref_tema", label: "ITENS REF AO TEMA", category: "structure" },
  { slug: "itens_decorativos", label: "ITENS DECORATIVOS", category: "structure" },
  { slug: "itens_diversos", label: "ITENS DIVERSOS", category: "structure" },
  { slug: "iluminacao_diferenciada_efeitos_especiais", label: "ILUMINACAO DIFERENCIADA COM EFEITOS ESPECIAIS", category: "lighting" },
  { slug: "luminarias", label: "LUMINARIAS", category: "lighting" },
  { slug: "abajus", label: "ABAJUS", category: "lighting" },
  { slug: "lustres", label: "LUSTRES", category: "lighting" },
  { slug: "refletor_led", label: "REFLETOR DE LED", category: "lighting" },
  { slug: "refletor_led_10", label: "10 REFLETOR DE LED", category: "lighting" },
  { slug: "refletor_led_20", label: "20 REFLETOR DE LED", category: "lighting" },
  { slug: "refletor_led_25", label: "25 REFLET DE LED", category: "lighting" },
  { slug: "refletor_par38_10", label: "10 REFLETOR PAR 38", category: "lighting" },
  { slug: "hqi_led", label: "HQI DE LED", category: "lighting" },
  { slug: "ribaltas", label: "RIBALTAS", category: "lighting" },
  { slug: "ribaltas_10", label: "10 RIBALTAS", category: "lighting" },
  { slug: "laser", label: "LASER", category: "lighting" },
  { slug: "laser_estrobo", label: "LASER E ESTROBO", category: "lighting" },
  { slug: "estrobos", label: "ESTROBOS", category: "lighting" },
  { slug: "maquina_fumaca", label: "MAQUINA DE FUMACA", category: "lighting" },
  { slug: "lampadas_decorativas", label: "LAMPADAS DECORATIVAS", category: "lighting" },
  { slug: "luz_pontual_formandos", label: "LUZ PONTUAL PARA OS FORMANDOS", category: "lighting" },
  { slug: "painel_tecidos", label: "PAINEL COM TECIDOS", category: "panel" },
  { slug: "painel_tecidos_folhagem", label: "PAINEL COM TECIDOS OU FOLHAGEM", category: "panel" },
];

function included(sortOrder: number, itemSlug: string): CanonicalEventItemDefinition {
  return { itemSlug, sortOrder, quantityRule: { type: "fixed", value: 1 }, priceRule: { type: "included" } };
}

export const canonicalEvents: CanonicalEventDefinition[] = [
  {
    slug: "itens_descerramento_placa",
    label: "ITENS DO DESCERRAMENTO DE PLACA",
    items: [
      { itemSlug: "placa_formatura", sortOrder: 1, quantityRule: { type: "fixed", value: 1 }, priceRule: { type: "fixed_value", value: 2750 } },
      { itemSlug: "replica_placa_15x20", sortOrder: 2, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "fixed_value", value: 65 } },
    ],
    summary: [
      { slug: "administracao", label: "Administracao", type: "display_dash" },
      { slug: "total_geral", label: "Total Geral", type: "sum", sources: ["placa_formatura", "replica_placa_15x20"] },
      { slug: "quantidade_formandos", label: "Quantidade de Formandos", type: "display_participants" },
      { slug: "valor_por_formando", label: "Valor por Formando", type: "division", numerator: "total_geral", denominator: "participants" },
    ],
  },
  {
    slug: "descerramento_placa",
    label: "DESCERRAMENTO DE PLACA",
    items: [
      included(1, "recepcionista_apoio"),
      included(2, "placa_formatura"),
      { itemSlug: "replica_placa_15x20", sortOrder: 3, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "fixed_value", value: 65 } },
      included(4, "brinde_champanhe"),
      { itemSlug: "coffee_break_formandos", sortOrder: 5, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 65 }, quantityEditable: true, priceEditable: true },
      { itemSlug: "decoracao", sortOrder: 6, subItemSlugs: ["forracao_tecidos_paredes", "vasos_arranjos", "trelicas_aluminio_painel", "poltronas", "sofas", "painel_tecidos_folhagem", "tapetes", "mesas_centro", "aparador_replicas", "forracao_carpete", "lounge_foto"] },
      included(7, "arranjo_grande"),
      { itemSlug: "iluminacao", sortOrder: 8, subItemSlugs: ["refletor_led"] },
      included(9, "caixa_som_microfone"),
      included(10, "tribuna_tecido_placa"),
    ],
    summary: [
      { slug: "administracao", label: "Administracao", type: "percentage_of", percentage: 10, source: "subtotal" },
      { slug: "valor_evento", label: "Valor do Evento", type: "fixed_value", value: 5850 },
      { slug: "subtotal", label: "Sub Total", type: "sum", sources: ["replica_placa_15x20", "coffee_break_formandos", "valor_evento"] },
      { slug: "total_geral", label: "Total Geral", type: "sum", sources: ["administracao", "subtotal"] },
      { slug: "valor_por_formando", label: "Valor por Formando", type: "division", numerator: "total_geral", denominator: "participants" },
    ],
  },
  {
    slug: "aula_saudade",
    label: "AULA DA SAUDADE - COMPLEXO AURORA",
    items: [
      included(1, "segurancas"),
      included(2, "pessoa_apoio"),
      included(3, "placas_homenagem_professores"),
      { itemSlug: "bebidas_open_bar_4h", sortOrder: 4, quantityRule: { type: "add", source: "participants", value: 5 }, priceRule: { type: "fixed_value", value: 65 }, subItemSlugs: ["refri", "cerveja", "agua", "suco_natural"] },
      { itemSlug: "servicos_buffet_formandos_professores", sortOrder: 5, quantityRule: { type: "add", source: "participants", value: 5 }, priceRule: { type: "fixed_value", value: 130 } },
      { itemSlug: "drinks", sortOrder: 6, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 80 }, quantityEditable: true, priceEditable: true },
      { itemSlug: "atracao_musical_verba", sortOrder: 7, quantityRule: { type: "fixed", value: 1 }, priceRule: { type: "editable_default", value: 700 }, priceEditable: true, variantSelectorSlug: "atracao_musical_verba" },
      included(8, "mesa_honra_toalha_aparador"),
      { itemSlug: "cadeiras_formandos", sortOrder: 9, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "included" }, quantityEditable: true },
      { itemSlug: "decoracao", sortOrder: 10, subItemSlugs: ["pecas_tema_escolhido", "iluminacao_diferenciada_efeitos_especiais", "vasos_decorativos", "poltronas", "sofas", "painel_tecidos", "forracao_tecidos", "tapetes", "mesas_centro", "forracao_carpete", "mesa_buffet", "arranjo_buffet", "vaso_arranjo", "itens_diversos"] },
      { itemSlug: "iluminacao", sortOrder: 11, subItemSlugs: ["refletor_led_25", "ribaltas", "laser_estrobo"] },
    ],
    summary: [
      { slug: "administracao", label: "Administracao", type: "percentage_of", percentage: 10, source: "subtotal" },
      { slug: "buffet", label: "Buffet", type: "sum", sources: ["servicos_buffet_formandos_professores", "bebidas_open_bar_4h"] },
      { slug: "evento", label: "Evento", type: "fixed_value", value: 28000 },
      { slug: "subtotal", label: "Sub Total", type: "sum", sources: ["atracao_musical_verba", "buffet", "drinks", "evento"] },
      { slug: "total_geral", label: "Total Geral", type: "sum", sources: ["administracao", "subtotal"] },
      { slug: "valor_por_formando", label: "Valor por Formando", type: "division", numerator: "total_geral", denominator: "participants" },
    ],
  },
  {
    slug: "missa_culto",
    label: "MISSA EM ACAO DE GRACAS",
    items: [
      { itemSlug: "recepcionista", sortOrder: 1, quantityRule: { type: "fixed", value: 2 }, priceRule: { type: "included" } },
      included(2, "ensaio"),
      { itemSlug: "livro_missal_personalizado", sortOrder: 3, quantityRule: { type: "multiply", source: "participants", value: 10 }, priceRule: { type: "fixed_value", value: 10 } },
      { itemSlug: "musica_sacra_verba", sortOrder: 4, quantityRule: { type: "fixed", value: 1 }, priceRule: { type: "editable_default", value: 830 }, priceEditable: true },
      { itemSlug: "taxa_igreja_verba", sortOrder: 5, quantityRule: { type: "fixed", value: 1 }, priceRule: { type: "editable_default", value: 950 }, priceEditable: true },
      included(6, "arranjos_entrada"),
      { itemSlug: "arranjos_nave_igreja", sortOrder: 7, quantityRule: { type: "fixed", value: 8 }, priceRule: { type: "included" } },
      { itemSlug: "arranjos_altar", sortOrder: 8, quantityRule: { type: "fixed", value: 2 }, priceRule: { type: "included" } },
      included(9, "arranjos_pulpito"),
      included(10, "tenda_entrada_trelicas"),
      included(11, "buque_ofertorio"),
      { itemSlug: "rosas_padrinhos", sortOrder: 12, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "included" } },
      { itemSlug: "marcadores_bancos_padrinhos", sortOrder: 13, quantityRule: { type: "multiply", source: "participants", value: 2 }, priceRule: { type: "included" } },
      { itemSlug: "decoracao", sortOrder: 14, subItemSlugs: ["forracao_tecido_laterais_tenda", "vasos_arranjos", "trelicas_aluminio_painel", "poltronas", "luminarias", "sofas", "painel_tecidos_folhagem", "tapetes", "mesas_centro", "carpete", "aparadores", "lounge_foto", "plantas_cachepo"] },
      { itemSlug: "iluminacao", sortOrder: 15, subItemSlugs: ["refletor_led_20", "hqi_led", "lampadas_decorativas"] },
    ],
    summary: [
      { slug: "administracao", label: "Administracao", type: "percentage_of", percentage: 10, source: "subtotal" },
      { slug: "evento", label: "Evento", type: "fixed_value", value: 11000 },
      { slug: "subtotal", label: "Sub Total", type: "sum", sources: ["livro_missal_personalizado", "musica_sacra_verba", "taxa_igreja_verba", "evento"] },
      { slug: "total_geral", label: "Total Geral", type: "sum", sources: ["administracao", "subtotal"] },
      { slug: "valor_por_formando", label: "Valor por Formando", type: "division", numerator: "total_geral", denominator: "participants" },
    ],
  },
  {
    slug: "culto_cortesia",
    label: "CULTO EM ACAO DE GRACAS - CORTESIA",
    items: [
      { itemSlug: "arranjos_nave_igreja", sortOrder: 1, quantityRule: { type: "fixed", value: 4 }, priceRule: { type: "included" } },
      included(2, "arranjos_entrada"),
      included(3, "passadeira"),
      { itemSlug: "recepcionista", sortOrder: 4, quantityRule: { type: "fixed", value: 2 }, priceRule: { type: "included" } },
      included(5, "seguranca"),
      { itemSlug: "iluminacao", sortOrder: 6, subItemSlugs: ["refletor_led"] },
      { itemSlug: "decoracao", sortOrder: 7, subItemSlugs: ["vasos_arranjos", "poltrona", "luminarias", "sofa", "tapetes", "mesas_centro", "forracao_carpete", "aparadores", "itens_decorativos"] },
    ],
    summary: [
      { slug: "administracao", label: "Administracao", type: "display_included" },
      { slug: "total_geral", label: "Total Geral", type: "display_included" },
      { slug: "quantidade_formandos", label: "Quantidade de Formandos", type: "display_included" },
      { slug: "valor_por_formando", label: "Valor por Formando", type: "display_included" },
    ],
  },
  {
    slug: "colacao_descerramento",
    label: "COLACAO DE GRAU E DESCERRAMENTO NO MESMO LOCAL",
    items: [
      { itemSlug: "recepcionistas", sortOrder: 1, quantityRule: { type: "fixed", value: 2 }, priceRule: { type: "included" } },
      { itemSlug: "recepcionista_apoio", sortOrder: 2, quantityRule: { type: "fixed", value: 1 }, priceRule: { type: "fixed_value", value: 320 } },
      { itemSlug: "placa_formatura", sortOrder: 3, quantityRule: { type: "fixed", value: 1 }, priceRule: { type: "fixed_value", value: 2750 } },
      { itemSlug: "replica_placa_15x20", sortOrder: 4, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "fixed_value", value: 65 } },
      { itemSlug: "valor_total_itens_descerramento", sortOrder: 5, formulaSlug: "valor_total_itens_descerramento" },
      included(6, "garcon_mesa_honra"),
      included(7, "pessoa_apoio_sonoplastia"),
      { itemSlug: "seguranca", sortOrder: 8, quantityRule: { type: "fixed", value: 2 }, priceRule: { type: "included" } },
      included(9, "mestre_cerimonia"),
      { itemSlug: "becas_luxo_professores", sortOrder: 10, quantityRule: { type: "fixed", value: 10 }, priceRule: { type: "included" }, quantityEditable: true },
      { itemSlug: "becas_luxo_formandos", sortOrder: 11, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "fixed_value", value: 80 } },
      { itemSlug: "canudos_personalizados", sortOrder: 12, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "fixed_value", value: 35 } },
      { itemSlug: "locacao_auditorio", sortOrder: 13, quantityRule: { type: "fixed", value: 1 }, priceRule: { type: "selected_variant_value", selectorSlug: "locacao_auditorio" }, variantSelectorSlug: "locacao_auditorio" },
      included(14, "ensaio"),
      included(15, "arranjos_placa"),
      included(16, "arranjos_entrada"),
      { itemSlug: "arranjos_palco", sortOrder: 17, quantityRule: { type: "fixed", value: 3 }, priceRule: { type: "included" } },
      included(18, "arranjo_mesa_honra_gigante"),
      { itemSlug: "cadeiras_formandos", sortOrder: 19, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "included" } },
      included(20, "producao_espaco_assinatura_ata"),
      { itemSlug: "arquibancada_formandos", sortOrder: 21, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "fixed_value", value: 25 } },
      { itemSlug: "painel_led", sortOrder: 22, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 320 }, quantityEditable: true, priceEditable: true },
      { itemSlug: "decoracao_geral_hall_entrada", sortOrder: 23, subItemSlugs: ["forracao_tecidos", "vasos_arranjos", "poltronas_diversas", "abajus", "luminarias", "sofa", "tapetes", "mesa_centro", "forracao_carpete", "aparadores", "lounge_foto", "plantas_cachepo"] },
      { itemSlug: "decoracao_palco_estrutura", sortOrder: 24, subItemSlugs: ["trelicas_aluminio_revestidas_tecidos", "escada_palco", "carpete_palco", "luz_pontual_formandos", "pecas_arranjos", "luminarias", "mesa_honra", "pulpito"] },
      { itemSlug: "iluminacao", sortOrder: 25, subItemSlugs: ["refletor_led_10", "ribaltas_10", "estrobos", "maquina_fumaca"] },
    ],
    summary: [
      { slug: "administracao", label: "Administracao", type: "percentage_of", percentage: 10, source: "subtotal" },
      { slug: "valor_total_itens_descerramento", label: "Valor Total de Itens do Descerramento", type: "sum", sources: ["recepcionista_apoio", "placa_formatura", "replica_placa_15x20"] },
      { slug: "valor_evento", label: "Valor do Evento", type: "sum", sources: ["valor_total_itens_descerramento", "becas_luxo_formandos", "canudos_personalizados", "locacao_auditorio", "painel_led", "arquibancada_formandos"] },
      { slug: "subtotal", label: "Sub Total", type: "sum", sources: ["valor_total_itens_descerramento", "becas_luxo_formandos", "canudos_personalizados", "locacao_auditorio", "painel_led", "arquibancada_formandos", "valor_evento"] },
      { slug: "total_geral", label: "Total Geral", type: "sum", sources: ["administracao", "subtotal"] },
      { slug: "valor_por_formando", label: "Valor por Formando", type: "division", numerator: "total_geral", denominator: "participants" },
    ],
  },
  {
    slug: "cerimonia_colacao",
    label: "CERIMONIA DE COLACAO DE GRAU",
    items: [
      { itemSlug: "recepcionistas", sortOrder: 1, quantityRule: { type: "fixed", value: 2 }, priceRule: { type: "included" } },
      included(2, "garcon_mesa_honra"),
      included(3, "pessoa_apoio_sonoplastia"),
      { itemSlug: "seguranca", sortOrder: 4, quantityRule: { type: "fixed", value: 2 }, priceRule: { type: "included" } },
      included(5, "mestre_cerimonia"),
      { itemSlug: "becas_luxo_professores", sortOrder: 6, quantityRule: { type: "fixed", value: 10 }, priceRule: { type: "included" } },
      { itemSlug: "becas_luxo_formandos", sortOrder: 7, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "fixed_value", value: 80 } },
      { itemSlug: "canudos_personalizados", sortOrder: 8, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "fixed_value", value: 35 } },
      { itemSlug: "locacao_auditorio", sortOrder: 9, quantityRule: { type: "fixed", value: 1 }, priceRule: { type: "selected_variant_value", selectorSlug: "locacao_auditorio" }, variantSelectorSlug: "locacao_auditorio" },
      included(10, "ensaio"),
      { itemSlug: "arranjos_entrada", sortOrder: 11, quantityRule: { type: "fixed", value: 2 }, priceRule: { type: "included" } },
      { itemSlug: "arranjos_palco", sortOrder: 12, quantityRule: { type: "fixed", value: 2 }, priceRule: { type: "included" } },
      included(13, "arranjo_mesa_honra_gigante"),
      { itemSlug: "cadeiras_formandos", sortOrder: 14, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "included" } },
      included(15, "producao_espaco_assinatura_ata"),
      { itemSlug: "arquibancada_formandos", sortOrder: 16, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "fixed_value", value: 25 } },
      { itemSlug: "placa_led", sortOrder: 17, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 320 }, quantityEditable: true, priceEditable: true },
      { itemSlug: "decoracao_geral_hall_entrada", sortOrder: 18, subItemSlugs: ["forracao_tecidos", "vasos_arranjos", "poltronas_diversas", "abajus", "luminarias", "sofa", "tapetes", "mesa_centro", "forracao_carpete", "aparadores", "lounge_foto", "plantas_cachepo"] },
      { itemSlug: "decoracao_palco_estrutura", sortOrder: 19, subItemSlugs: ["trelicas_aluminio_revestidas_tecidos", "escada_palco", "carpete_palco", "luz_pontual_formandos", "pecas_arranjos", "luminarias", "mesa_honra", "pulpito"] },
      { itemSlug: "iluminacao", sortOrder: 20, subItemSlugs: ["refletor_led_10", "ribaltas_10", "estrobos", "maquina_fumaca"] },
    ],
    summary: [
      { slug: "administracao", label: "Administracao", type: "percentage_of", percentage: 10, source: "subtotal" },
      { slug: "valor_evento", label: "Valor do Evento", type: "fixed_value", value: 18000 },
      { slug: "subtotal", label: "Sub Total", type: "sum", sources: ["locacao_auditorio", "becas_luxo_formandos", "canudos_personalizados", "arquibancada_formandos", "placa_led", "valor_evento"] },
      { slug: "total_geral", label: "Total Geral", type: "sum", sources: ["administracao", "subtotal"] },
      { slug: "valor_por_formando", label: "Valor por Formando", type: "division", numerator: "total_geral", denominator: "participants" },
    ],
  },
  {
    slug: "festa_50",
    label: "FESTA 50% - COMPLEXO AURORA",
    items: [
      { itemSlug: "recepcionista", sortOrder: 1, quantityRule: { type: "fixed", value: 2 }, priceRule: { type: "included" } },
      { itemSlug: "segurancas", sortOrder: 2, quantityRule: { type: "fixed", value: 2 }, priceRule: { type: "included" } },
      { itemSlug: "bebidas_open_bar_4h", sortOrder: 3, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 65 }, quantityEditable: true, priceEditable: true, subItemSlugs: ["refri", "cerveja", "agua", "suco_natural"] },
      { itemSlug: "servicos_buffet_formandos", sortOrder: 4, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "fixed_value", value: 65 } },
      { itemSlug: "drinks", sortOrder: 5, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 80 }, quantityEditable: true, priceEditable: true },
      { itemSlug: "verba_camisa", sortOrder: 6, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 65 }, quantityEditable: true, priceEditable: true },
      { itemSlug: "atracao_musical_verba", sortOrder: 7, quantityRule: { type: "fixed", value: 1 }, priceRule: { type: "editable_default", value: 660 }, priceEditable: true, variantSelectorSlug: "atracao_musical_verba" },
      { itemSlug: "decoracao_acordo_tema", sortOrder: 8, subItemSlugs: ["placas_tema", "tecidos_paredes", "itens_ref_tema", "puffes", "poltronas", "sofas", "plantas_cachepo", "forracao_carpete", "tapetes", "mesa_bistro", "banquetas"] },
      { itemSlug: "iluminacao", sortOrder: 9, subItemSlugs: ["refletor_led_20", "refletor_par38_10", "laser"] },
    ],
    summary: [
      { slug: "administracao", label: "Administracao", type: "percentage_of", percentage: 10, source: "subtotal" },
      { slug: "valor_evento", label: "Valor do Evento", type: "fixed_value", value: 18500 },
      { slug: "subtotal", label: "Sub Total", type: "sum", sources: ["atracao_musical_verba", "servicos_buffet_formandos", "bebidas_open_bar_4h", "drinks", "verba_camisa", "valor_evento"] },
      { slug: "total_geral", label: "Total Geral", type: "sum", sources: ["administracao", "subtotal"] },
      { slug: "valor_por_formando", label: "Valor por Formando", type: "division", numerator: "total_geral", denominator: "participants" },
    ],
  },
  {
    slug: "festa_365",
    label: "FESTA 365 DIAS - COMPLEXO AURORA",
    items: [
      { itemSlug: "recepcionista", sortOrder: 1, quantityRule: { type: "fixed", value: 2 }, priceRule: { type: "included" } },
      { itemSlug: "segurancas", sortOrder: 2, quantityRule: { type: "fixed", value: 2 }, priceRule: { type: "included" } },
      { itemSlug: "bebidas_open_bar_4h", sortOrder: 3, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 65 }, quantityEditable: true, priceEditable: true, subItemSlugs: ["refri", "cerveja", "agua", "suco_natural"] },
      { itemSlug: "servicos_buffet_formandos", sortOrder: 4, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "fixed_value", value: 65 } },
      { itemSlug: "drinks", sortOrder: 5, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 80 }, quantityEditable: true, priceEditable: true },
      { itemSlug: "verba_camisa", sortOrder: 6, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 65 }, quantityEditable: true, priceEditable: true },
      { itemSlug: "atracao_musical_verba", sortOrder: 7, quantityRule: { type: "fixed", value: 1 }, priceRule: { type: "editable_default", value: 700 }, priceEditable: true, variantSelectorSlug: "atracao_musical_verba" },
      { itemSlug: "decoracao_acordo_tema", sortOrder: 8, subItemSlugs: ["placas_tema", "tecidos_paredes", "itens_ref_tema", "puffes", "poltronas", "sofas", "plantas_cachepo", "forracao_carpete", "tapetes", "mesa_bistro", "banquetas"] },
      { itemSlug: "iluminacao", sortOrder: 9, subItemSlugs: ["refletor_led_20", "refletor_par38_10", "laser"] },
    ],
    summary: [
      { slug: "administracao", label: "Administracao", type: "percentage_of", percentage: 10, source: "subtotal" },
      { slug: "valor_evento", label: "Valor do Evento", type: "fixed_value", value: 18500 },
      { slug: "subtotal", label: "Sub Total", type: "sum", sources: ["atracao_musical_verba", "servicos_buffet_formandos", "bebidas_open_bar_4h", "drinks", "verba_camisa", "valor_evento"] },
      { slug: "total_geral", label: "Total Geral", type: "sum", sources: ["administracao", "subtotal"] },
      { slug: "valor_por_formando", label: "Valor por Formando", type: "division", numerator: "total_geral", denominator: "participants" },
    ],
  },
  {
    slug: "ensaio_50",
    label: "ENSAIO 50%",
    items: [
      { itemSlug: "sessao_fotografica_formandos", sortOrder: 1, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "included" }, quantityEditable: true },
      included(2, "fotos_coletivas_individuais"),
      { itemSlug: "coffee_break_formandos", sortOrder: 3, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 65 }, quantityEditable: true, priceEditable: true },
      included(4, "link_fotos"),
      included(5, "cenarios_lounge_espacos_fotos"),
      included(6, "espaco_beleza"),
      { itemSlug: "decoracao_geral", sortOrder: 7, subItemSlugs: ["forracao_tecidos", "vasos_arranjos", "trelicas_aluminio_painel_espaco", "poltronas", "abajus", "luminarias", "sofas", "painel_tecidos_folhagem", "tapetes", "mesas_centro", "carpete", "aparadores", "lounge_foto", "plantas_cachepo", "lustres"] },
      included(8, "acessorios_fotos"),
      included(9, "escada_foto_coletiva"),
      included(10, "local_grupo_aurora_4h"),
    ],
    summary: [
      { slug: "administracao", label: "Administracao", type: "percentage_of", percentage: 10, source: "subtotal" },
      { slug: "valor_orcamento", label: "Valor do Orcamento", type: "fixed_value", value: 19000 },
      { slug: "subtotal", label: "Sub Total", type: "sum", sources: ["coffee_break_formandos", "valor_orcamento"] },
      { slug: "total_geral", label: "Total Geral", type: "sum", sources: ["administracao", "subtotal"] },
      { slug: "valor_por_formando", label: "Valor por Formando", type: "division", numerator: "total_geral", denominator: "participants" },
    ],
  },
  {
    slug: "ensaio_365",
    label: "ENSAIO 365 DIAS",
    items: [
      { itemSlug: "sessao_fotografica_formandos", sortOrder: 1, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "included" }, quantityEditable: true },
      included(2, "fotos_coletivas_individuais"),
      { itemSlug: "coffee_break_formandos", sortOrder: 3, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 65 }, quantityEditable: true, priceEditable: true },
      included(4, "link_fotos"),
      included(5, "cenarios_lounge_espacos_fotos"),
      included(6, "espaco_beleza"),
      { itemSlug: "decoracao_geral", sortOrder: 7, subItemSlugs: ["forracao_tecidos", "vasos_arranjos", "trelicas_aluminio_painel_espaco", "poltronas", "abajus", "luminarias", "sofas", "painel_tecidos_folhagem", "tapetes", "mesas_centro", "carpete", "aparadores", "lounge_foto", "plantas_cachepo", "lustres"] },
      included(8, "acessorios_fotos"),
      included(9, "escada_foto_coletiva"),
      included(10, "local_grupo_aurora_4h"),
    ],
    summary: [
      { slug: "administracao", label: "Administracao", type: "percentage_of", percentage: 10, source: "subtotal" },
      { slug: "valor_orcamento", label: "Valor do Orcamento", type: "fixed_value", value: 19000 },
      { slug: "subtotal", label: "Sub Total", type: "sum", sources: ["coffee_break_formandos", "valor_orcamento"] },
      { slug: "total_geral", label: "Total Geral", type: "sum", sources: ["administracao", "subtotal"] },
      { slug: "valor_por_formando", label: "Valor por Formando", type: "division", numerator: "total_geral", denominator: "participants" },
    ],
  },
  {
    slug: "ensaio_fotografico",
    label: "ENSAIO FOTOGRAFICO",
    items: [
      { itemSlug: "sessao_fotografica_formandos", sortOrder: 1, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "included" }, quantityEditable: true },
      included(2, "fotos_coletivas_individuais"),
      { itemSlug: "coffee_break_formandos", sortOrder: 3, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 65 }, quantityEditable: true, priceEditable: true },
      included(4, "link_fotos"),
      included(5, "cenarios_lounge_espacos_fotos"),
      included(6, "espaco_beleza"),
      { itemSlug: "decoracao_geral", sortOrder: 7, subItemSlugs: ["forracao_tecidos", "vasos_arranjos", "trelicas_aluminio_painel_espaco", "poltronas", "abajus", "luminarias", "sofas", "painel_tecidos_folhagem", "tapetes", "mesas_centro", "carpete", "aparadores", "lounge_foto", "plantas_cachepo", "lustres"] },
      { itemSlug: "beca_formatura", sortOrder: 8, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "editable_default", value: 80 }, quantityEditable: true, priceEditable: true },
      included(9, "acessorios_fotos"),
      included(10, "escada_foto_coletiva"),
      included(11, "local_grupo_aurora_4h"),
    ],
    summary: [
      { slug: "administracao", label: "Administracao", type: "percentage_of", percentage: 10, source: "subtotal" },
      { slug: "valor_orcamento", label: "Valor do Orcamento", type: "fixed_value", value: 19000 },
      { slug: "subtotal", label: "Sub Total", type: "sum", sources: ["coffee_break_formandos", "beca_formatura", "valor_orcamento"] },
      { slug: "total_geral", label: "Total Geral", type: "sum", sources: ["administracao", "subtotal"] },
      { slug: "valor_por_formando", label: "Valor por Formando", type: "division", numerator: "total_geral", denominator: "participants" },
    ],
  },
  {
    slug: "cobertura_fotografica",
    label: "COBERTURA FOTOGRAFICA",
    items: [
      { itemSlug: "sessao_fotografica_eventos_contratados", sortOrder: 1, quantityRule: { type: "same", source: "participants" }, priceRule: { type: "fixed_value", value: 960 }, quantityEditable: true },
    ],
    summary: [
      { slug: "total_geral", label: "Total Geral", type: "same_value_of", source: "sessao_fotografica_eventos_contratados" },
      { slug: "valor_por_formando", label: "Valor por Formando", type: "division", numerator: "total_geral", denominator: "participants" },
    ],
  },
  {
    slug: "evento_100_dias",
    label: "EVENTO 100 DIAS (CORTESIA)",
    items: [
      included(1, "recepcionista"),
      included(2, "segurancas"),
      included(3, "servicos_buffet_formandos"),
      { itemSlug: "bebidas_open_bar_4h", sortOrder: 4, quantityRule: { type: "included_context" }, priceRule: { type: "included" }, subItemSlugs: ["refri", "cerveja", "agua", "suco_natural"] },
      included(5, "atracao_musical_verba"),
      { itemSlug: "decoracao_acordo_tema", sortOrder: 6, subItemSlugs: ["placas_tema", "tecidos_paredes", "itens_ref_tema", "puffes", "poltronas", "sofas", "plantas_cachepo", "forracao_carpete", "tapetes", "mesa_bistro", "banquetas"] },
      { itemSlug: "iluminacao", sortOrder: 7, subItemSlugs: ["refletor_led_20", "refletor_par38_10", "laser"] },
    ],
    summary: [],
  },
];

export const legacyAliases: LegacyAliasDefinition[] = [
  { aliasType: "event", legacyKey: "itens_descerramento_placa", canonicalSlug: "itens_descerramento_placa" },
  { aliasType: "event", legacyKey: "descerramento_placa", canonicalSlug: "descerramento_placa" },
  { aliasType: "event", legacyKey: "aula_saudade", canonicalSlug: "aula_saudade" },
  { aliasType: "event", legacyKey: "missa_culto", canonicalSlug: "missa_culto" },
  { aliasType: "event", legacyKey: "culto_cortesia", canonicalSlug: "culto_cortesia" },
  { aliasType: "event", legacyKey: "colacao_descerramento", canonicalSlug: "colacao_descerramento" },
  { aliasType: "event", legacyKey: "cerimonia_colacao", canonicalSlug: "cerimonia_colacao" },
  { aliasType: "event", legacyKey: "festa_50", canonicalSlug: "festa_50" },
  { aliasType: "event", legacyKey: "festa_365", canonicalSlug: "festa_365" },
  { aliasType: "event", legacyKey: "ensaio_50", canonicalSlug: "ensaio_50" },
  { aliasType: "event", legacyKey: "ensaio_365", canonicalSlug: "ensaio_365" },
  { aliasType: "event", legacyKey: "ensaio_fotografico", canonicalSlug: "ensaio_fotografico" },
  { aliasType: "event", legacyKey: "cobertura_fotografica", canonicalSlug: "cobertura_fotografica" },
  { aliasType: "event", legacyKey: "evento_100_dias", canonicalSlug: "evento_100_dias" },
  { aliasType: "item", legacyKey: "replica_placa", canonicalSlug: "replica_placa_15x20" },
  { aliasType: "item", legacyKey: "replica_placa_col", canonicalSlug: "replica_placa_15x20" },
  { aliasType: "item", legacyKey: "coffee_break", canonicalSlug: "coffee_break_formandos" },
  { aliasType: "item", legacyKey: "servicos_buffet", canonicalSlug: "servicos_buffet_formandos_professores" },
  { aliasType: "item", legacyKey: "bebidas_open_bar", canonicalSlug: "bebidas_open_bar_4h" },
  { aliasType: "item", legacyKey: "atracao_musical", canonicalSlug: "atracao_musical_verba" },
  { aliasType: "item", legacyKey: "livro_missal", canonicalSlug: "livro_missal_personalizado" },
  { aliasType: "item", legacyKey: "musica_sacra", canonicalSlug: "musica_sacra_verba" },
  { aliasType: "item", legacyKey: "taxa_igreja", canonicalSlug: "taxa_igreja_verba" },
  { aliasType: "item", legacyKey: "marcadores_bancos", canonicalSlug: "marcadores_bancos_padrinhos" },
  { aliasType: "item", legacyKey: "recepcionista_apoio_col", canonicalSlug: "recepcionista_apoio" },
  { aliasType: "item", legacyKey: "placa_formatura_col", canonicalSlug: "placa_formatura" },
  { aliasType: "item", legacyKey: "becas_formandos_col", canonicalSlug: "becas_luxo_formandos" },
  { aliasType: "item", legacyKey: "becas_formandos_cerimonia", canonicalSlug: "becas_luxo_formandos" },
  { aliasType: "item", legacyKey: "beca_formatura_ensaio", canonicalSlug: "beca_formatura" },
  { aliasType: "item", legacyKey: "canudos_col", canonicalSlug: "canudos_personalizados" },
  { aliasType: "item", legacyKey: "canudos_cerimonia", canonicalSlug: "canudos_personalizados" },
  { aliasType: "item", legacyKey: "cadeiras_formandos_col", canonicalSlug: "cadeiras_formandos" },
  { aliasType: "item", legacyKey: "cadeiras_formandos_cerimonia", canonicalSlug: "cadeiras_formandos" },
  { aliasType: "item", legacyKey: "arquibancada_col", canonicalSlug: "arquibancada_formandos" },
  { aliasType: "item", legacyKey: "arquibancada_cerimonia", canonicalSlug: "arquibancada_formandos" },
  { aliasType: "item", legacyKey: "painel_led_col", canonicalSlug: "painel_led" },
  { aliasType: "item", legacyKey: "placa_led_cerimonia", canonicalSlug: "placa_led" },
  { aliasType: "item", legacyKey: "locacao_auditorio_col", canonicalSlug: "locacao_auditorio" },
  { aliasType: "item", legacyKey: "locacao_auditorio_cerimonia", canonicalSlug: "locacao_auditorio" },
  { aliasType: "item", legacyKey: "buffet_festa50", canonicalSlug: "servicos_buffet_formandos" },
  { aliasType: "item", legacyKey: "buffet_festa365", canonicalSlug: "servicos_buffet_formandos" },
  { aliasType: "item", legacyKey: "openbar_festa50", canonicalSlug: "bebidas_open_bar_4h" },
  { aliasType: "item", legacyKey: "openbar_festa365", canonicalSlug: "bebidas_open_bar_4h" },
  { aliasType: "item", legacyKey: "drinks_festa50", canonicalSlug: "drinks" },
  { aliasType: "item", legacyKey: "drinks_festa365", canonicalSlug: "drinks" },
  { aliasType: "item", legacyKey: "camisa_festa50", canonicalSlug: "verba_camisa" },
  { aliasType: "item", legacyKey: "camisa_festa365", canonicalSlug: "verba_camisa" },
  { aliasType: "item", legacyKey: "dj_festa50", canonicalSlug: "atracao_musical_verba" },
  { aliasType: "item", legacyKey: "dj_festa365", canonicalSlug: "atracao_musical_verba" },
  { aliasType: "item", legacyKey: "coffee_break_ensaio", canonicalSlug: "coffee_break_formandos" },
  { aliasType: "item", legacyKey: "coffee_break_ensaio50", canonicalSlug: "coffee_break_formandos" },
  { aliasType: "item", legacyKey: "coffee_break_ensaio365", canonicalSlug: "coffee_break_formandos" },
  { aliasType: "item", legacyKey: "sessao_fotografica_ensaio", canonicalSlug: "sessao_fotografica_formandos" },
  { aliasType: "item", legacyKey: "sessao_fotografica_ensaio50", canonicalSlug: "sessao_fotografica_formandos" },
  { aliasType: "item", legacyKey: "sessao_fotografica_ensaio365", canonicalSlug: "sessao_fotografica_formandos" },
  { aliasType: "item", legacyKey: "sessao_fotografica_solenidades", canonicalSlug: "sessao_fotografica_eventos_contratados" },
  { aliasType: "item", legacyKey: "open_bar_100dias", canonicalSlug: "bebidas_open_bar_4h" },
  { aliasType: "item", legacyKey: "valor_evento_festa50", canonicalSlug: "valor_evento_fixo", notes: "Formula, nao item simples" },
  { aliasType: "item", legacyKey: "valor_evento_festa365", canonicalSlug: "valor_evento_fixo", notes: "Formula, nao item simples" },
  { aliasType: "item", legacyKey: "valor_orcamento_ensaio", canonicalSlug: "valor_orcamento_fixo", notes: "Formula, nao item simples" },
  { aliasType: "item", legacyKey: "valor_orcamento_ensaio50", canonicalSlug: "valor_orcamento_fixo", notes: "Formula, nao item simples" },
  { aliasType: "item", legacyKey: "valor_orcamento_ensaio365", canonicalSlug: "valor_orcamento_fixo", notes: "Formula, nao item simples" },
];
