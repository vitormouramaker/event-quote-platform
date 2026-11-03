import {
  getRuntimeCanonicalSelector,
  getRuntimeCanonicalSlugByItemName,
  resolveRuntimeCanonicalEventSlug,
  resolveRuntimeCanonicalItemSlug,
} from "../migration/canonicalRuntimeConfig";

// Acima deste número de formandos usa-se o auditório maior (Platina); abaixo,
// o menor (Cristal). 25 conta como "grande" (Platina).
export const AUDITORIUM_PARTICIPANT_THRESHOLD = 25;

const AUDITORIUM_PRICE_FIELD_BY_ITEM_ID: Record<string, string> = {
  locacao_auditorio_col: "locacao_auditorio_col_price",
  locacao_auditorio_cerimonia: "locacao_auditorio_cerimonia_price",
};

const PARTICIPATION_LINKED_INCLUDED_ITEM_SLUGS = new Set([
  "replica_placa_15x20",
  "becas_luxo_formandos",
  "canudos_personalizados",
  "cadeiras_formandos",
  "arquibancada_formandos",
  "painel_led",
  "placa_led",
]);

export function resolveCanonicalItemSlug(itemId: string) {
  return resolveRuntimeCanonicalItemSlug(itemId);
}

export function resolveCanonicalEventSlug(eventId: string) {
  return resolveRuntimeCanonicalEventSlug(eventId);
}

export function isCanonicalItem(itemId: string, canonicalSlug: string) {
  return resolveCanonicalItemSlug(itemId) === canonicalSlug;
}

export function isCanonicalEvent(eventId: string, canonicalSlug: string) {
  return resolveCanonicalEventSlug(eventId) === canonicalSlug;
}

export function isAuditoriumItem(itemId: string) {
  return isCanonicalItem(itemId, "locacao_auditorio");
}

// Detecta o item "Locação do Auditório" por id canônico OU por nome. Necessário
// porque eventos criados pela UI têm itens com id numérico (sem slug/legacy),
// então a resolução por id falha e só o nome casa com o slug canônico.
export function isAuditoriumItemByIdOrName(itemId: string, itemName?: string) {
  if (isAuditoriumItem(itemId)) return true;
  if (itemName && getRuntimeCanonicalSlugByItemName(itemName) === "locacao_auditorio") return true;
  return false;
}

export function isMusicAttractionItem(itemId: string) {
  return isCanonicalItem(itemId, "atracao_musical_verba");
}

export function isPlaqueReplicaItem(itemId: string) {
  return isCanonicalItem(itemId, "replica_placa_15x20");
}

export function isStudentChairsItem(itemId: string) {
  return isCanonicalItem(itemId, "cadeiras_formandos");
}

export function isBudgetFixedValueItem(itemId: string) {
  return isCanonicalItem(itemId, "valor_orcamento_fixo");
}

export function isStudentPhotoSessionItem(itemId: string) {
  return isCanonicalItem(itemId, "sessao_fotografica_formandos");
}

export function isContractedEventPhotoSessionItem(itemId: string) {
  return isCanonicalItem(itemId, "sessao_fotografica_eventos_contratados");
}

export function isParticipationLinkedIncludedItem(itemId: string) {
  const canonicalSlug = resolveCanonicalItemSlug(itemId);
  return canonicalSlug ? PARTICIPATION_LINKED_INCLUDED_ITEM_SLUGS.has(canonicalSlug) : false;
}

export function is100DaysOpenBarItem(eventId: string, itemId: string) {
  return isCanonicalEvent(eventId, "evento_100_dias") && isCanonicalItem(itemId, "bebidas_open_bar_4h");
}

export function getMusicAttractionOptions() {
  return getRuntimeCanonicalSelector("atracao_musical_verba")?.options ?? [];
}

export function getMusicAttractionLabel(type: string | null | undefined) {
  const normalizedType = type ?? getMusicAttractionOptions()[0]?.slug ?? "dj";
  const selectedOption = getMusicAttractionOptions().find(
    (option) => option.slug === normalizedType,
  );

  return selectedOption
    ? `Atração Musical (${selectedOption.label})`
    : "Atração Musical";
}

export function getAuditoriumOptions() {
  return getRuntimeCanonicalSelector("locacao_auditorio")?.options ?? [];
}

// Auditorios da cidade do orcamento. Cadastro sem cidade (city null) vale para
// todas — e o caso dos auditorios antigos, anteriores a esse campo.
export function getAuditoriumOptionsForCity(city?: string | null) {
  const options = getAuditoriumOptions();
  if (!city) return options;
  const scoped = options.filter((option) => !option.city || option.city === city);
  // Se a cidade nao tem nenhum auditorio cadastrado, mostra todos em vez de um
  // select vazio (melhor um dropdown completo do que travar o orcamento).
  return scoped.length > 0 ? scoped : options;
}

export function getDefaultAuditoriumPrice() {
  return getAuditoriumOptions().find((option) => typeof option.value === "number")?.value ?? 7000;
}

// Preço padrão do auditório conforme o número de formandos:
// < 25 formandos → Cristal (menor); >= 25 formandos → Platina (maior).
// Continua trocável manualmente no seletor.
export function getParticipantDrivenAuditoriumPrice(participants: number) {
  const options = getAuditoriumOptions().filter(
    (option): option is typeof option & { value: number } => typeof option.value === "number",
  );
  if (options.length === 0) return getDefaultAuditoriumPrice();

  const wantsLarge = Number(participants) >= AUDITORIUM_PARTICIPANT_THRESHOLD;
  const cristal = options.find((o) => /cristal/i.test(o.slug) || /cristal/i.test(o.label));
  const platina = options.find((o) => /platina/i.test(o.slug) || /platina/i.test(o.label));
  if (cristal && platina) {
    return wantsLarge ? platina.value : cristal.value;
  }

  // Fallback sem Cristal/Platina nomeados: menor valor abaixo do limite, maior acima.
  const sorted = [...options].sort((a, b) => a.value - b.value);
  return (wantsLarge ? sorted[sorted.length - 1] : sorted[0]).value;
}

export function getAuditoriumPriceField(itemId: string) {
  return AUDITORIUM_PRICE_FIELD_BY_ITEM_ID[itemId] ?? "locacao_auditorio_col_price";
}

export function getResolvedAuditoriumPrice(
  itemId: string,
  itemValues: Record<string, unknown>,
) {
  // O preço do auditório pode estar em chaves diferentes conforme o esquema do
  // orçamento: id de banco (`<id>_price`, fluxo atual), legado canônico
  // (`locacao_auditorio_col_price`) ou variação. Tenta na ordem mais específica.
  const candidates = [
    AUDITORIUM_PRICE_FIELD_BY_ITEM_ID[itemId],
    `${itemId}_price`,
    "locacao_auditorio_col_price",
    "locacao_auditorio_cerimonia_price",
    "locacao_auditorio_price",
  ];
  for (const field of candidates) {
    if (!field) continue;
    const value = Number(itemValues[field]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return getDefaultAuditoriumPrice();
}

// Slug do auditorio escolhido, gravado no orcamento quando o consultor
// seleciona no select. Orcamentos antigos (anteriores ao campo) nao tem.
export function getResolvedAuditoriumSlug(
  itemId: string,
  itemValues: Record<string, unknown>,
): string | undefined {
  const raw = itemValues[`${itemId}_auditorium_slug`];
  return typeof raw === "string" && raw.trim() ? raw : undefined;
}

export function getAuditoriumDisplayName(
  price: number,
  slug?: string,
  city?: string | null,
) {
  const options = getAuditoriumOptions();
  // Casa pelo slug salvo; so cai no preco em orcamentos antigos. Auditorios de
  // cidades diferentes podem ter o MESMO valor, entao casar por preco escolhia
  // o auditorio errado (ex.: Cristal saindo como "Platina Litoral"). Quando nao ha
  // slug, o fallback por preco respeita a cidade do orcamento antes de olhar a
  // lista inteira.
  const cityOptions = city ? getAuditoriumOptionsForCity(city) : options;
  const selectedOption =
    (slug ? options.find((option) => option.slug === slug) : undefined) ??
    cityOptions.find((option) => option.value === price) ??
    options.find((option) => option.value === price);

  return selectedOption
    ? `Locação do Auditório ${selectedOption.label}`
    : "Locação do Auditório";
}
