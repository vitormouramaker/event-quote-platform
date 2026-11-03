import { describe, expect, it } from "vitest";
import { formatDateBR, parseLocalDate } from "./date";

describe("date utils (sem desvio de fuso)", () => {
  it("parseLocalDate interpreta YYYY-MM-DD como meia-noite LOCAL (dia preservado)", () => {
    const d = parseLocalDate("2026-07-30");
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6); // julho (0-based)
    expect(d?.getDate()).toBe(30); // não 29
  });

  it("formatDateBR não recua um dia", () => {
    expect(formatDateBR("2026-07-30")).toBe("30/07/2026");
    expect(formatDateBR("2029-12-30")).toBe("30/12/2029");
  });

  it("aceita ISO com hora e trata inválido/vazio", () => {
    expect(formatDateBR("2026-01-15T12:00:00.000Z")).not.toBe("");
    expect(formatDateBR("")).toBe("");
    expect(formatDateBR(undefined)).toBe("");
    expect(formatDateBR("abc", "Não informado")).toBe("Não informado");
    expect(parseLocalDate("nao-e-data")).toBeNull();
  });
});
