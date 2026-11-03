import type { VenueSettings } from "../domain/venueProposal";

/**
 * Tabela de preços de referência do Centro de Eventos Aurora Hall.
 *
 * A fonte da verdade é o banco (`venue_settings`), que o gestor edita. Isto
 * aqui é só o fallback de quando a API ainda não respondeu — sem ele a tela
 * abriria sem nenhuma opção de locação.
 */
export const VENUE_SETTINGS_FALLBACK: VenueSettings = {
  entrances: [
    {
      id: "principal",
      name: "Entrada Principal",
      description: "Acesso pelo salão principal",
      price: 83500,
    },
    {
      id: "setor_b",
      name: "Entrada Setor B",
      description: "Acesso pelo Setor B",
      price: 49500,
    },
    {
      id: "setor_c",
      name: "Entrada Setor C",
      description: "Acesso pelo Setor C",
      price: 32500,
    },
  ],
  optionals: [
    {
      id: "estacionamento",
      name: "Estacionamento",
      condition: "Opcional",
      price: 3400,
      perDay: false,
    },
    {
      id: "praca_alimentacao",
      name: "Praça de alimentação",
      condition: "Opcional",
      price: 3400,
      perDay: false,
    },
    {
      id: "cozinha",
      name: "Cozinha",
      condition: "Diária / opcional",
      price: 1600,
      perDay: true,
    },
    {
      id: "camara_fria",
      name: "Câmara fria",
      condition: "Diária de 24 horas / opcional",
      price: 830,
      perDay: true,
    },
  ],
  climateControlDailyRate: 7750,
  extraDailyPercent: 50,
  includedSetupDays: 1,
  includedTeardownDays: 1,
  validityDays: 15,
};

/**
 * O que vem da API pode estar incompleto (tabela semeada antes de um campo
 * novo existir). Completa com o fallback em vez de quebrar a tela.
 */
export function normalizeVenueSettings(raw: unknown): VenueSettings {
  const dados = (raw ?? {}) as Partial<VenueSettings>;
  const numero = (valor: unknown, padrao: number) => {
    const convertido = Number(valor);
    return Number.isFinite(convertido) ? convertido : padrao;
  };

  return {
    entrances: Array.isArray(dados.entrances) && dados.entrances.length > 0
      ? dados.entrances.map((entrada) => ({
          id: String(entrada.id ?? ""),
          name: String(entrada.name ?? ""),
          description: String(entrada.description ?? ""),
          price: numero(entrada.price, 0),
        }))
      : VENUE_SETTINGS_FALLBACK.entrances,
    optionals: Array.isArray(dados.optionals)
      ? dados.optionals.map((opcional) => ({
          id: String(opcional.id ?? ""),
          name: String(opcional.name ?? ""),
          condition: String(opcional.condition ?? ""),
          price: numero(opcional.price, 0),
          perDay: Boolean(opcional.perDay),
        }))
      : VENUE_SETTINGS_FALLBACK.optionals,
    climateControlDailyRate: numero(
      dados.climateControlDailyRate,
      VENUE_SETTINGS_FALLBACK.climateControlDailyRate,
    ),
    extraDailyPercent: numero(
      dados.extraDailyPercent,
      VENUE_SETTINGS_FALLBACK.extraDailyPercent,
    ),
    includedSetupDays: numero(
      dados.includedSetupDays,
      VENUE_SETTINGS_FALLBACK.includedSetupDays,
    ),
    includedTeardownDays: numero(
      dados.includedTeardownDays,
      VENUE_SETTINGS_FALLBACK.includedTeardownDays,
    ),
    validityDays: numero(dados.validityDays, VENUE_SETTINGS_FALLBACK.validityDays),
  };
}
