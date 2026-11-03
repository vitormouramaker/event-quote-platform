import { describe, expect, it } from "vitest";
import { shouldSyncHydratedField } from "./formHydrationGuard";

describe("ClientStep auto sync", () => {
  it("preserva item salvo ao hidratar uma versao existente", () => {
    const shouldSync = shouldSyncHydratedField({
      currentValue: 100,
      dirtyFields: {},
      fieldPath: "items.itens_descerramento_placa.replica_placa",
      hasPersistedBudgetId: true,
      isFormDirty: false,
    });

    expect(shouldSync).toBe(false);
  });

  it("preserva participacao salva ao hidratar uma versao existente", () => {
    const shouldSync = shouldSyncHydratedField({
      currentValue: 42,
      dirtyFields: {},
      fieldPath: "participation_descerramento",
      hasPersistedBudgetId: true,
      isFormDirty: false,
    });

    expect(shouldSync).toBe(false);
  });

  it("mantem sincronismo em novo orcamento quando o campo nao foi alterado manualmente", () => {
    const shouldSync = shouldSyncHydratedField({
      currentValue: 20,
      dirtyFields: {},
      fieldPath: "items.itens_descerramento_placa.replica_placa",
      hasPersistedBudgetId: false,
      isFormDirty: true,
    });

    expect(shouldSync).toBe(true);
  });

  it("nao sobrescreve campo de item alterado manualmente", () => {
    const shouldSync = shouldSyncHydratedField({
      currentValue: 30,
      dirtyFields: {
        items: {
          itens_descerramento_placa: {
            replica_placa: true,
          },
        },
      },
      fieldPath: "items.itens_descerramento_placa.replica_placa",
      hasPersistedBudgetId: true,
      isFormDirty: true,
    });

    expect(shouldSync).toBe(false);
  });

  it("nao sobrescreve participacao alterada manualmente", () => {
    const shouldSync = shouldSyncHydratedField({
      currentValue: 18,
      dirtyFields: {
        participation_descerramento: true,
      },
      fieldPath: "participation_descerramento",
      hasPersistedBudgetId: true,
      isFormDirty: true,
    });

    expect(shouldSync).toBe(false);
  });
});
