import { describe, expect, it } from "vitest";
import {
  dedupeItemsByNormalizedName,
  getDisplayItemName,
  matchesItemSearch,
  normalizeItemNameKey,
} from "./itemNameDedup";

describe("itemNameDedup", () => {
  it("strip trailing event suffix from display name", () => {
    expect(getDisplayItemName("Acessórios para Fotos (Ensaio 365 Dias)")).toBe("Acessórios para Fotos");
  });

  it("normalize duplicate names to same key", () => {
    expect(normalizeItemNameKey("Acessórios para Fotos")).toBe(
      normalizeItemNameKey("Acessórios para Fotos (Ensaio 50%)"),
    );
  });

  it("dedupe picks plain base item first", () => {
    const deduped = dedupeItemsByNormalizedName([
      { id: "evt", name: "Acessórios para Fotos (Ensaio 50%)", sourceEventTitle: "Ensaio 50%" },
      { id: "base", name: "Acessórios para Fotos", sourceEventTitle: "Itens Base" },
      { id: "evt-2", name: "Acessórios para Fotos (Ensaio 365 Dias)", sourceEventTitle: "Ensaio 365 Dias" },
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe("base");
  });

  it("search matches both raw bugged name and cleaned name", () => {
    expect(matchesItemSearch("Acessórios para Fotos (Ensaio 365 Dias)", "Acessorios para Fotos")).toBe(true);
    expect(matchesItemSearch("Acessórios para Fotos (Ensaio 365 Dias)", "Ensaio 365")).toBe(true);
  });
});
