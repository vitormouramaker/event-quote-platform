import { describe, expect, it, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import {
  buildSummaryBudgetData,
  hasUnlockedBudgetChanges,
  validateBudgetStatusBeforeSave,
} from "./summaryStepSaveHelpers";
import type { SummaryFormValues } from "./SummaryStep.types";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

function baseForm(overrides: Partial<SummaryFormValues> = {}): SummaryFormValues {
  return {
    id: "temp-budget",
    status: "APPROVED",
    observation: "",
    instituicao: "Faculdade X",
    curso: "Direito",
    comissao: "Comissão Y",
    ...overrides,
  };
}

describe("summaryStepSaveHelpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valida observação obrigatória para status cancelado", () => {
    expect(validateBudgetStatusBeforeSave(baseForm({ status: "CANCELLED", observation: "   " }))).toBeNull();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("aceita status aprovado sem observação", () => {
    const result = validateBudgetStatusBeforeSave(baseForm({ status: "APPROVED", observation: "" }));
    expect(result).toEqual({ status: "APPROVED", observation: "" });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("detecta mudança ignorando campo id no snapshot", () => {
    const formValues = baseForm({ id: "id-atual", curso: "Medicina" });
    const ref = {
      current: JSON.stringify({ id: "id-original", curso: "Direito" }),
    };

    expect(hasUnlockedBudgetChanges(formValues, ref)).toBe(true);
  });

  it("não detecta mudança quando apenas id difere", () => {
    const formValues = baseForm({ id: "novo-id", curso: "Direito" });
    const originalSnapshot = { ...formValues, id: "antigo-id" };
    const ref = {
      current: JSON.stringify(originalSnapshot),
    };

    expect(hasUnlockedBudgetChanges(formValues, ref)).toBe(false);
  });

  it("monta payload de save preservando criador e lock de edição desbloqueada sem forceRelock", () => {
    const payload = buildSummaryBudgetData({
      formValues: baseForm({ id: "budget-1", observation: "obs" }),
      isEditing: true,
      budgetId: "budget-1",
      existingBudget: {
        id: "budget-1",
        instituicao: "Faculdade X",
        curso: "Direito",
        createdAt: "2025-01-01T00:00:00.000Z",
        status: "APPROVED",
        totalValue: 1000,
        isLocked: false,
      },
      originalCreator: "João",
      status: "APPROVED",
      observation: "obs",
      forceRelock: false,
      totalFinal: 900,
      subtotal: 1000,
      deficit: 50,
    });

    expect(payload.id).toBe("budget-1");
    expect(payload.createdBy).toBe("João");
    expect(payload.createdByName).toBe("João");
    expect(payload.isLocked).toBe(false);
    expect(payload.totalValue).toBe(900);
    expect(payload.originalTotalValue).toBe(1000);
    expect(payload.deficitValue).toBe(50);
    expect(payload.data.id).toBe("budget-1");
    expect(payload.createdAt).toBe("2025-01-01T00:00:00.000Z");
  });
  it("salva novos orcamentos com schemaVersion 2", () => {
    const payload = buildSummaryBudgetData({
      formValues: baseForm({
        selectedEvents: ["descerramento_placa"],
        items: { descerramento_placa: { coffee_break: 10 } },
      }),
      isEditing: false,
      budgetId: "temp-budget",
      originalCreator: "Maria",
      status: "APPROVED",
      observation: "",
      totalFinal: 1000,
      subtotal: 1000,
      deficit: 0,
    });

    expect(payload.data.schemaVersion).toBe(2);
  });

  it("preserva schemaVersion 1 ao editar orcamento legado", () => {
    const payload = buildSummaryBudgetData({
      formValues: baseForm({
        id: "budget-legacy",
        schemaVersion: 1,
        selectedEvents: ["descerramento_placa"],
      }),
      isEditing: true,
      budgetId: "budget-legacy",
      existingBudget: {
        id: "budget-legacy",
        instituicao: "Faculdade X",
        curso: "Direito",
        createdAt: "2025-01-01T00:00:00.000Z",
        status: "APPROVED",
        totalValue: 1000,
        isLocked: false,
        data: {
          schemaVersion: 1,
        },
      },
      originalCreator: "JoÃ£o",
      status: "APPROVED",
      observation: "",
      totalFinal: 900,
      subtotal: 1000,
      deficit: 0,
    });

    expect(payload.data.schemaVersion).toBe(1);
  });
});
