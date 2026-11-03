import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  buildClientTitle,
  getEditingContext,
  getOriginalCreator,
  migrateTempRequestsIfNeeded,
  syncGlobalDiscountRequestAfterSave,
} from "./useSummaryStepSaveFlow";
import type { SummaryFormValues } from "./SummaryStep.types";
import type { Budget } from "../../../../store/budgetStore";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
  },
}));

function form(overrides: Partial<SummaryFormValues> = {}): SummaryFormValues {
  return {
    id: "temp-budget",
    instituicao: "Faculdade X",
    curso: "Engenharia",
    comissao: "Comissão Z",
    status: "APPROVED",
    ...overrides,
  };
}

describe("useSummaryStepSaveFlow helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("monta clientTitle com fallback", () => {
    expect(buildClientTitle(form())).toBe("Faculdade X - Engenharia - Comissão Z");
    expect(buildClientTitle(form({ comissao: "" }))).toBe("Faculdade X - Engenharia - Cliente");
  });

  it("resolve contexto de edição corretamente", () => {
    const budget: Budget = {
      id: "b1",
      instituicao: "I",
      curso: "C",
      createdAt: "2025-01-01",
      status: "PENDING",
      totalValue: 0,
    };
    const getBudgetById = vi.fn().mockReturnValue(budget);
    const ctx = getEditingContext(form({ id: "b1" }), getBudgetById);

    expect(ctx.isEditing).toBe(true);
    expect(ctx.budgetId).toBe("b1");
    expect(ctx.existingBudget).toBe(budget);
    expect(getBudgetById).toHaveBeenCalledWith("b1");
  });

  it("preserva criador original com fallbacks", () => {
    expect(getOriginalCreator({ createdByName: "Ana" } as Budget, "Vitor")).toBe("Ana");
    expect(getOriginalCreator({ createdBy: "Carlos" } as Budget, "Vitor")).toBe("Carlos");
    expect(getOriginalCreator(undefined, "Vitor")).toBe("Vitor");
    expect(getOriginalCreator(undefined)).toBe("Desconhecido");
  });

  it("faz flush das requests staged da origem para a nova versão salva", () => {
    const migrateTempBudget = vi.fn();

    // Orçamento novo: do temp para a nova versão
    migrateTempRequestsIfNeeded({
      isEditing: false,
      budgetId: "temp-budget",
      formValues: form({ id: "temp-budget" }),
      savedBudgetId: "uuid-final",
      clientTitle: "Cliente A",
      migrateTempBudget,
    });

    expect(migrateTempBudget).toHaveBeenCalledWith("temp-budget", "uuid-final", "Cliente A");

    migrateTempBudget.mockClear();

    // Edição: da versão atual para a NOVA versão criada no save
    migrateTempRequestsIfNeeded({
      isEditing: true,
      budgetId: "uuid-existente",
      formValues: form({ id: "uuid-existente" }),
      savedBudgetId: "uuid-nova-versao",
      clientTitle: "Cliente B",
      migrateTempBudget,
    });

    expect(migrateTempBudget).toHaveBeenCalledWith("uuid-existente", "uuid-nova-versao", "Cliente B");

    migrateTempBudget.mockClear();

    // Sem destino (save falhou e não é edição): não faz flush
    migrateTempRequestsIfNeeded({
      isEditing: false,
      budgetId: "temp-budget",
      formValues: form({ id: "temp-budget" }),
      savedBudgetId: undefined,
      clientTitle: "Cliente C",
      migrateTempBudget,
    });

    expect(migrateTempBudget).not.toHaveBeenCalled();
  });

  it("cria solicitação global aprovada automaticamente para admin e evita duplicata pendente", async () => {
    const addRequest = vi.fn().mockResolvedValue(undefined);

    await syncGlobalDiscountRequestAfterSave({
      requestedDiscount: 10,
      requestedDiscountMode: "PERCENT",
      savedBudgetId: "b1",
      globalRequests: [],
      requestObservation: "Negociação",
      clientTitle: "Cliente Teste",
      subtotal: 1000,
      userName: "Gestor",
      isAdmin: true,
      addRequest,
    });

    expect(addRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetId: "b1",
        status: "APPROVED",
        discountPercent: 10,
        discountValue: 100,
        finalValue: 900,
      }),
      undefined,
    );
    expect(toast.success).toHaveBeenCalled();

    addRequest.mockClear();
    await syncGlobalDiscountRequestAfterSave({
      requestedDiscount: 10,
      requestedDiscountMode: "PERCENT",
      savedBudgetId: "b1",
      globalRequests: [
        {
          id: "r1",
          budgetId: "b1",
          clientName: "Cliente Teste",
          totalValue: 1000,
          discountPercent: 10,
          discountValue: 100,
          finalValue: 900,
          requestedBy: "X",
          requestedAt: "2025-01-01",
          status: "PENDING",
          requestObservation: "Negociação",
        },
      ],
      requestObservation: "Negociação",
      clientTitle: "Cliente Teste",
      subtotal: 1000,
      userName: "Gestor",
      isAdmin: false,
      addRequest,
    });

    expect(addRequest).not.toHaveBeenCalled();
  });

  it("solicitacao em valor fixo guarda os reais pedidos e o percentual equivalente", async () => {
    const addRequest = vi.fn().mockResolvedValue(undefined);

    await syncGlobalDiscountRequestAfterSave({
      requestedDiscount: 500,
      requestedDiscountMode: "FIXED",
      savedBudgetId: "b2",
      globalRequests: [],
      requestObservation: "Fechamento",
      clientTitle: "Cliente Fixo",
      subtotal: 7420,
      userName: "Vendedor",
      isAdmin: false,
      addRequest,
    });

    const [payload] = addRequest.mock.calls[0];
    expect(payload).toMatchObject({
      budgetId: "b2",
      status: "PENDING",
      discountMode: "FIXED",
      requestedAmount: 500,
      discountValue: 500,
      finalValue: 6920,
    });
    // O percentual equivalente nao e redondo, mas reproduz os R$ 500.
    expect(7420 * (payload.discountPercent / 100)).toBeCloseTo(500, 2);
  });

  it("nao confunde 10% com R$ 10 ao procurar uma solicitacao pendente igual", async () => {
    const addRequest = vi.fn().mockResolvedValue(undefined);
    const pendenteEmPorcentagem = {
      id: "r1",
      budgetId: "b3",
      clientName: "Cliente",
      totalValue: 1000,
      discountPercent: 10,
      discountValue: 100,
      finalValue: 900,
      requestedBy: "X",
      requestedAt: "2025-01-01",
      status: "PENDING" as const,
      requestObservation: "Motivo",
    };

    await syncGlobalDiscountRequestAfterSave({
      requestedDiscount: 10,
      requestedDiscountMode: "FIXED",
      savedBudgetId: "b3",
      globalRequests: [pendenteEmPorcentagem],
      requestObservation: "Motivo",
      clientTitle: "Cliente",
      subtotal: 1000,
      userName: "Vendedor",
      isAdmin: false,
      addRequest,
    });

    // Mesmo numero, unidade diferente: e outro pedido.
    expect(addRequest).toHaveBeenCalledTimes(1);
  });
});
