import { describe, expect, it } from "vitest";
import { familyOf, groupVenueVersions, versionOf } from "./venueVersions";

const linha = (
  id: string,
  patch: Partial<{
    proposal_code: string;
    family_code: string | null;
    version: number | string | null;
  }> = {},
) => ({
  id,
  proposal_code: `PROP-${id}`,
  family_code: null,
  version: 1,
  created_at: "2026-10-20T10:00:00.000Z",
  ...patch,
});

describe("versoes da proposta de locacao", () => {
  it("proposta antiga, sem familia gravada, e familia de si mesma", () => {
    expect(familyOf(linha("A"))).toBe("PROP-A");
    expect(versionOf(linha("A", { version: null }))).toBe(1);
  });

  it("agrupa as versoes e poe a vigente na frente", () => {
    const familias = groupVenueVersions([
      linha("v1", { family_code: "PROP-X", version: 1 }),
      linha("v3", { family_code: "PROP-X", version: 3 }),
      linha("v2", { family_code: "PROP-X", version: 2 }),
    ]);

    expect(familias).toHaveLength(1);
    expect(familias[0].latest.id).toBe("v3");
    expect(familias[0].previous.map((r) => r.id)).toEqual(["v2", "v1"]);
  });

  it("propostas sem parentesco ficam em familias separadas", () => {
    const familias = groupVenueVersions([linha("A"), linha("B")]);
    expect(familias).toHaveLength(2);
    expect(familias.every((f) => f.previous.length === 0)).toBe(true);
  });

  it("mantem a ordem em que as familias chegaram", () => {
    const familias = groupVenueVersions([
      linha("novo", { family_code: "PROP-NOVO" }),
      linha("antigo", { family_code: "PROP-ANTIGO" }),
    ]);

    expect(familias.map((f) => f.family)).toEqual(["PROP-NOVO", "PROP-ANTIGO"]);
  });

  it("versao invalida ou ausente conta como 1", () => {
    expect(versionOf(linha("A", { version: "abc" }))).toBe(1);
    expect(versionOf(linha("A", { version: 0 }))).toBe(1);
    expect(versionOf(linha("A", { version: "4" }))).toBe(4);
  });
});
