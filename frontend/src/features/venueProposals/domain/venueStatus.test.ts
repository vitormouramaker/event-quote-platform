import { describe, expect, it } from "vitest";
import {
  canEditVenueProposal,
  resolveVenueStatus,
  venueLockReason,
  venueStatusOptions,
} from "./venueStatus";

describe("ciclo de vida da proposta de locacao", () => {
  it("status desconhecido ou ausente e pendente", () => {
    expect(resolveVenueStatus(undefined)).toBe("PENDING");
    expect(resolveVenueStatus(null)).toBe("PENDING");
    expect(resolveVenueStatus("")).toBe("PENDING");
    expect(resolveVenueStatus("qualquer")).toBe("PENDING");
    expect(resolveVenueStatus("approved")).toBe("APPROVED");
  });

  describe("quem pode editar", () => {
    it("consultor so mexe enquanto esta pendente", () => {
      expect(canEditVenueProposal("PENDING", false)).toBe(true);
      expect(canEditVenueProposal("SENT_FOR_APPROVAL", false)).toBe(false);
      expect(canEditVenueProposal("APPROVED", false)).toBe(false);
      expect(canEditVenueProposal("CANCELLED", false)).toBe(false);
    });

    it("gestor mexe em qualquer uma", () => {
      expect(canEditVenueProposal("APPROVED", true)).toBe(true);
      expect(canEditVenueProposal("CANCELLED", true)).toBe(true);
    });
  });

  it("explica o travamento, e so quando ele existe", () => {
    expect(venueLockReason("PENDING")).toBeNull();
    expect(venueLockReason("SENT_FOR_APPROVAL")).toContain("enviada para aprovação");
    expect(venueLockReason("APPROVED")).toContain("aprovada");
  });

  describe("status que cada um pode aplicar", () => {
    it("consultor manda para aprovacao e pode voltar atras", () => {
      expect(venueStatusOptions("PENDING", false)).toEqual([
        "PENDING",
        "SENT_FOR_APPROVAL",
      ]);
    });

    it("consultor nao aprova nem cancela", () => {
      const opcoes = venueStatusOptions("SENT_FOR_APPROVAL", false);
      expect(opcoes).not.toContain("APPROVED");
      expect(opcoes).not.toContain("CANCELLED");
    });

    it("gestor tem o ciclo inteiro", () => {
      expect(venueStatusOptions("SENT_FOR_APPROVAL", true)).toEqual([
        "PENDING",
        "SENT_FOR_APPROVAL",
        "APPROVED",
        "CANCELLED",
      ]);
    });
  });
});
