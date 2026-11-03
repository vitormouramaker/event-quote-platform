import { describe, expect, it } from "vitest";
import type { EventTemplateDto } from "../../../services/api";
import {
  buildBaseItemsCatalog,
  buildBudgetEventsCatalog,
  filterBudgetEventsByCity,
  resolveCanonicalEventSlugByTitle,
} from "./budgetCatalog";

function makeEventTemplate(
  overrides: Partial<EventTemplateDto> & Pick<EventTemplateDto, "id" | "name" | "items">,
): EventTemplateDto {
  return {
    id: overrides.id,
    name: overrides.name,
    city: overrides.city ?? "Capital",
    type: "Pago",
    items: overrides.items,
    event_item_configs: overrides.event_item_configs ?? [],
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("buildBudgetEventsCatalog", () => {
  it("preserva flag e lista de sub-itens no catalogo base", () => {
    const items = buildBaseItemsCatalog([
      {
        id: "decoracao-completa",
        name: "Decoraçao Completa",
        unit_price: 0,
        default_quantity: 1,
        editable: true,
        dynamic_by_students: false,
        has_subitems: true,
        subitems: [{ name: "Sofás" }, { name: "Poltronas" }],
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(items[0]).toMatchObject({
      id: "decoracao-completa",
      hasSubitems: true,
      subitems: [{ name: "Sofás" }, { name: "Poltronas" }],
    });
  });

  it("preserva regra legada de quantidade dinamica para replica da placa na colacao", () => {
    const events = buildBudgetEventsCatalog([
      makeEventTemplate({
        id: "colacao_descerramento",
        name: "Colação de Grau e Descerramento no Mesmo Local",
        items: [
          {
            id: "replica_placa_col",
            name: "Réplica da Placa 15x20",
            unit_price: 80,
            default_quantity: 1,
            editable: true,
            dynamic_by_students: false,
            has_subitems: false,
            subitems: [],
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    ]);

    expect(events[0]?.items[0]).toMatchObject({
      id: "replica_placa_col",
      dynamicByStudents: true,
      defaultQuantity: 1,
    });
  });

  it("preserva regra legada de quantidade dinamica quando o item da API usa id novo", () => {
    const events = buildBudgetEventsCatalog([
      makeEventTemplate({
        id: "itens_descerramento_placa",
        name: "Itens do Descerramento de Placa",
        items: [
          {
            id: "uuid-replica",
            name: "Replica da Placa 15x20",
            unit_price: 80,
            default_quantity: 1,
            editable: true,
            dynamic_by_students: false,
            has_subitems: false,
            subitems: [],
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    ]);

    expect(events[0]?.items[0]).toMatchObject({
      id: "uuid-replica",
      dynamicByStudents: true,
      quantityRule: { mode: "same" },
    });
  });

  it("preserva regra legada de quantidade fixa para item fixo da colacao", () => {
    const events = buildBudgetEventsCatalog([
      makeEventTemplate({
        id: "colacao_descerramento",
        name: "Colação de Grau e Descerramento no Mesmo Local",
        items: [
          {
            id: "recepcionista_apoio_col",
            name: "Recepcionista de Apoio",
            unit_price: 350,
            default_quantity: 0,
            editable: true,
            dynamic_by_students: false,
            has_subitems: false,
            subitems: [],
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    ]);

    expect(events[0]?.items[0]).toMatchObject({
      id: "recepcionista_apoio_col",
      fixedQty: 1,
      defaultQuantity: 0,
      dynamicByStudents: false,
    });
  });

  it("preserva cidade do evento e permite filtrar catalogo por cidade", () => {
    const events = buildBudgetEventsCatalog([
      makeEventTemplate({
        id: "evento-capital",
        name: "Evento Capital",
        city: "Capital",
        items: [],
      }),
      makeEventTemplate({
        id: "evento-interior",
        name: "Evento Interior",
        city: "Interior",
        items: [],
      }),
    ]);

    expect(events.map((event) => ({ id: event.id, city: event.city }))).toEqual([
      { id: "evento-capital", city: "Capital" },
      { id: "evento-interior", city: "Interior" },
    ]);
    expect(filterBudgetEventsByCity(events, "Capital").map((event) => event.id)).toEqual([
      "evento-capital",
    ]);
    expect(filterBudgetEventsByCity(events, "Interior").map((event) => event.id)).toEqual([
      "evento-interior",
    ]);
  });

  it("preserva variacoes vindas da API no catalogo base", () => {
    const items = buildBaseItemsCatalog([
      {
        id: "atracao-musical-verba",
        name: "Atração Musical - Verba",
        unit_price: 500,
        default_quantity: 1,
        editable: true,
        dynamic_by_students: false,
        has_subitems: false,
        subitems: [],
        variations: [
          { id: "dj", name: "DJ", unit_price: 700, default_quantity: 1 },
          { id: "banda", name: "BANDA", unit_price: 1400, default_quantity: 1 },
        ],
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(items[0]?.variations).toEqual([
      { id: "dj", name: "DJ", unit_price: 700, default_quantity: 1 },
      { id: "banda", name: "BANDA", unit_price: 1400, default_quantity: 1 },
    ]);
  });
});

describe("resolveCanonicalEventSlugByTitle", () => {
  // Garante o mapeamento título -> slug usado para identificar o grupo
  // mutuamente exclusivo de descerramento quando o id da API é UUID.
  it("resolve os tres eventos do grupo de descerramento por titulo", () => {
    expect(resolveCanonicalEventSlugByTitle("ITENS DO DESCERRAMENTO DE PLACA")).toBe(
      "itens_descerramento_placa",
    );
    expect(resolveCanonicalEventSlugByTitle("DESCERRAMENTO DE PLACA")).toBe(
      "descerramento_placa",
    );
    expect(
      resolveCanonicalEventSlugByTitle("Colação de Grau e Descerramento no Mesmo Local"),
    ).toBe("colacao_descerramento");
  });

  it("ignora caixa, acentos e espacos extras", () => {
    expect(resolveCanonicalEventSlugByTitle("  itens   do descerramento de placa ")).toBe(
      "itens_descerramento_placa",
    );
  });

  it("retorna null para titulo desconhecido ou vazio", () => {
    expect(resolveCanonicalEventSlugByTitle("Evento Inexistente")).toBeNull();
    expect(resolveCanonicalEventSlugByTitle("")).toBeNull();
    expect(resolveCanonicalEventSlugByTitle(null)).toBeNull();
  });
});
