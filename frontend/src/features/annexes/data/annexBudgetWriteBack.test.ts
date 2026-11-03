import { describe, expect, it } from "vitest";
import type { Budget } from "../../../store/budgetStore";
import { buildBudgetVersionFromAnnexEdits } from "./annexBudgetWriteBack";

const baseBudget: Budget = {
  id: "budget-1",
  instituicao: "UNIDEMO",
  curso: "Medicina",
  comissao: "Comissao",
  telefone: "(11) 99999-0000",
  createdAt: "2026-09-01T10:00:00.000Z",
  status: "APPROVED",
  totalValue: 1000,
  version: 1,
  budgetCode: "ORC-TEST",
  data: {
    selectedEvents: ["descerramento_placa"],
    participation_descerramento: 20,
    items: {
      descerramento_placa: {
        placa_formatura: 1,
        placa_formatura_price: 2500,
      },
    },
  },
};

describe("write-back do anexo contratual", () => {
  it("grava quantidade e preço na chave que o editor do orçamento lê", () => {
    const payload = buildBudgetVersionFromAnnexEdits({
      budget: baseBudget,
      edits: [
        {
          eventId: "descerramento_placa",
          itemId: "placa_formatura",
          quantity: 10,
          unitPrice: 2500,
        },
      ],
      allBudgets: [baseBudget],
      budgetEvents: [],
    });

    const items = (payload.data as Record<string, unknown>).items as Record<
      string,
      Record<string, unknown>
    >;

    // O editor lê items[eventId][itemId] para a quantidade e [itemId]_price.
    expect(items.descerramento_placa.placa_formatura).toBe(10);
    expect(items.descerramento_placa.placa_formatura_price).toBe(2500);
    expect(items.descerramento_placa.placa_formatura_price_manual).toBe(true);
  });

  it("cria a próxima versão na mesma família e marca o item alterado", () => {
    const v2: Budget = { ...baseBudget, id: "budget-2", parentId: "budget-1", version: 2 };

    const payload = buildBudgetVersionFromAnnexEdits({
      budget: v2,
      edits: [
        {
          eventId: "descerramento_placa",
          itemId: "placa_formatura",
          quantity: 5,
          unitPrice: 2000,
        },
      ],
      allBudgets: [baseBudget, v2],
      budgetEvents: [],
    });

    const data = payload.data as Record<string, unknown>;
    expect(data.version).toBe(3);
    expect(data.parentId).toBe("budget-1");
    expect(data.editedViaAnnex).toBe(true);
    expect(
      (data.annexEdits as Record<string, Record<string, true>>).descerramento_placa
        .placa_formatura,
    ).toBe(true);
    expect(payload.budgetCode).toBe("ORC-TEST");
  });
});
