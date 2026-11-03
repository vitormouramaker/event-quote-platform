import { afterEach, describe, expect, it } from "vitest";
import {
  getRuntimeCanonicalSlugByItemName,
  hydrateCanonicalRuntimeConfig,
  resetCanonicalRuntimeConfig,
} from "./canonicalRuntimeConfig";
import {
  getAuditoriumDisplayName,
  getResolvedAuditoriumSlug,
  isAuditoriumItemByIdOrName,
} from "../domain/budgetUiRules";
import { patchAuditoriumsSelector } from "./canonicalRuntimeConfig";

afterEach(() => resetCanonicalRuntimeConfig());

describe("auditorium detection survives API hydration with slugless UI items", () => {
  it("resolves canonical slug by name even when live item slug is its numeric id", () => {
    // Simula o catálogo runtime vindo da API com o item criado pela UI:
    // slug ausente (backend devolve id como slug), nome canônico.
    hydrateCanonicalRuntimeConfig({
      items: [
        {
          id: "285",
          db_id: "285",
          legacy_item_id: null,
          slug: null,
          name: "LOCAÇÃO DO AUDITÓRIO",
          unit_price: 0,
          default_quantity: 1,
        },
      ],
      selectors: [
        { slug: "locacao_auditorio", label: "Locação do Auditório", options: [
          { slug: "cristal", label: "Cristal", value: 10000 },
          { slug: "platina", label: "Platina", value: 20000 },
        ] },
      ],
      eventTemplates: [],
      legacyAliases: [],
    } as never);

    expect(getRuntimeCanonicalSlugByItemName("LOCAÇÃO DO AUDITÓRIO")).toBe("locacao_auditorio");
    expect(isAuditoriumItemByIdOrName("285", "LOCAÇÃO DO AUDITÓRIO")).toBe(true);
  });
});

describe("nome do auditorio na impressao", () => {
  it("usa o slug salvo quando dois auditorios tem o mesmo valor", () => {
    // Cristal (Capital) e Platina Litoral com o MESMO preco: casar por preco
    // escolhia o primeiro da lista e imprimia o auditorio errado.
    patchAuditoriumsSelector([
      { slug: "platina_litoral", name: "Platina Litoral", price: 15000, city: "Litoral" },
      { slug: "cristal", name: "Cristal", price: 15000, city: "Capital" },
    ]);

    const itemValues = { "285_price": 15000, "285_auditorium_slug": "cristal" };
    const slug = getResolvedAuditoriumSlug("285", itemValues);

    expect(slug).toBe("cristal");
    expect(getAuditoriumDisplayName(15000, slug)).toBe("Locação do Auditório Cristal");
    // Orcamento antigo (sem slug) mantem o fallback por preco.
    expect(getAuditoriumDisplayName(15000)).toBe("Locação do Auditório Platina Litoral");
  });

  it("sem slug, o fallback por preco respeita a cidade do orcamento", () => {
    patchAuditoriumsSelector([
      { slug: "platina_litoral", name: "Platina Litoral", price: 15000, city: "Litoral" },
      { slug: "cristal", name: "Cristal", price: 15000, city: "Capital" },
    ]);

    expect(getAuditoriumDisplayName(15000, undefined, "Capital")).toBe(
      "Locação do Auditório Cristal",
    );
    expect(getAuditoriumDisplayName(15000, undefined, "Litoral")).toBe(
      "Locação do Auditório Platina Litoral",
    );
  });
});
