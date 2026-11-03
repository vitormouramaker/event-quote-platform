import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { budgetsApi } from "../../../services/api";
import type { BudgetStatusDto, BudgetWriteDto } from "../../../services/api";
import { budgetsQueryKey } from "../queries/useBudgetsQuery";
import { mapBudget, useBudgetStore, type Budget, type BudgetSavePayload } from "../../../store/budgetStore";
import { dashboardSummaryQueryKey } from "../../dashboard/queries/useDashboardSummaryQuery";

type UpdateBudgetMutationVars = {
  id: string;
  updates: Partial<Budget>;
};

/**
 * O react-hook-form trata segmentos numéricos de path (ex.: `items.27.285_price`)
 * como índices de array, então `items` e cada `items[eventId]` viram ARRAYS.
 * `JSON.stringify` de um array serializa apenas os índices numéricos e descarta
 * propriedades de chave string (`285_price`, `285_variation_label`), perdendo o
 * preço/variação no envio. Aqui convertemos o mapa de itens e cada evento de
 * volta para objeto plano, preservando TODAS as chaves (índices + props string).
 * Não toca em arrays legítimos como `selectedEvents` ou `customItems`.
 */
function objectifyBudgetItems(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  const items = record.items;
  if (!items || typeof items !== "object") return data;

  const toPlainObject = (value: unknown): unknown => {
    if (!value || typeof value !== "object") return value;
    const out: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>).forEach((key) => {
      out[key] = (value as Record<string, unknown>)[key];
    });
    return out;
  };

  const fixedItems: Record<string, unknown> = {};
  Object.keys(items as Record<string, unknown>).forEach((eventId) => {
    fixedItems[eventId] = toPlainObject((items as Record<string, unknown>)[eventId]);
  });

  return { ...record, items: fixedItems };
}

function toBudgetWriteDto(input: Partial<Budget> | BudgetSavePayload): BudgetWriteDto {
  return {
    instituicao: input.instituicao,
    curso: input.curso,
    comissao: input.comissao,
    telefone: input.telefone,
    controle: input.controle,
    observation: input.observation,
    totalValue: input.totalValue,
    originalTotalValue: input.originalTotalValue,
    deficitValue: input.deficitValue,
    discountPercent: input.discountPercent ?? 0,
    discountMode: input.discountMode,
    discountAmount: input.discountAmount ?? 0,
    approvedItemDiscounts: input.approvedItemDiscounts ?? {},
    approvedItemDiscountAmounts: input.approvedItemDiscountAmounts ?? {},
    formData: "data" in input ? (objectifyBudgetItems(input.data ?? {}) as Record<string, unknown>) : {},
    status: input.status ?? "PENDING",
    isLocked: input.isLocked ?? false,
    createdByName: input.createdByName,
    budgetCode: input.budgetCode,
  };
}

async function syncBudgets(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: budgetsQueryKey });
  await queryClient.invalidateQueries({ queryKey: dashboardSummaryQueryKey });
  // Await the store fetch to ensure the next page (which might use the store) has fresh data
  await useBudgetStore.getState().fetchBudgets();
}

async function getCurrentBudgetForUpdate(id: string): Promise<Budget | undefined> {
  const fromStore = useBudgetStore.getState().getBudgetById(id);
  if (fromStore) return fromStore;

  try {
    const res = await budgetsApi.getById(id);
    if (!res.ok || !res.data) return undefined;
    return mapBudget(res.data);
  } catch {
    return undefined;
  }
}

export function useCreateBudgetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: BudgetSavePayload): Promise<string | undefined> => {
      try {
        const apiPayload = toBudgetWriteDto(payload);
        const res = await budgetsApi.create(apiPayload);
        if (res.ok && res.data?.id) {
          await syncBudgets(queryClient);
          // Toast de sucesso é exibido por quem chama (useSummaryStepSaveFlow),
          // com a mensagem contextual de versão.
          return res.data.id;
        } else {
          toast.error(res.message || "Erro ao criar orçamento");
          return undefined;
        }
      } catch (err) {
        console.error("createBudget mutation:", err);
        toast.error("Erro ao salvar orçamento. Backend offline?");
        return undefined;
      }
    },
  });
}

export function useUpdateBudgetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: UpdateBudgetMutationVars): Promise<boolean> => {
      try {
        if (Object.keys(updates).length === 1 && "isLocked" in updates) {
          await budgetsApi.setLock(id, Boolean(updates.isLocked));
          await syncBudgets(queryClient);
          return true;
        }

        const current = await getCurrentBudgetForUpdate(id);
        if (!current) {
          toast.error("Orçamento não encontrado para atualização");
          return false;
        }

        const merged: Budget = { ...current, ...updates };
        const apiPayload = toBudgetWriteDto(merged);
        const res = await budgetsApi.update(id, apiPayload);
        if (res.ok) {
          await syncBudgets(queryClient);
          return true;
        }
        toast.error(res.message || "Erro ao atualizar orçamento");
        return false;
      } catch (err) {
        console.error("updateBudget mutation:", err);
        toast.error("Erro ao atualizar orçamento");
        return false;
      }
    },
  });
}

export function useArchiveBudgetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const res = await budgetsApi.setArchive(id, archived);
      if (!res.ok) throw new Error(res.message || "Erro ao arquivar orçamento");
      await syncBudgets(queryClient);
      return { id, archived };
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao arquivar orçamento");
    },
  });
}

export function useUpdateBudgetStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BudgetStatusDto }) => {
      const res = await budgetsApi.setStatus(id, status);
      if (!res.ok) throw new Error(res.message || "Erro ao atualizar status");
      await syncBudgets(queryClient);
      return { id, status };
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar status do orçamento");
    },
  });
}
