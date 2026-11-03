import { create } from "zustand";
import { budgetsApi } from "../services/api";
import type { BudgetRowDto, BudgetStatusDto, BudgetWriteDto } from "../services/api";
import { toast } from "sonner";
import { deepFixMojibake, fixMojibakeText } from "../utils/textEncoding";
import type { BudgetCanonicalSnapshot } from "../features/budgets/migration/legacyBudgetAdapter";
import { adaptBudgetStoredFormData } from "../features/budgets/migration/legacyBudgetAdapter";

export interface Budget {
  id: string;
  instituicao: string;
  curso: string;
  comissao?: string;
  telefone?: string;
  controle?: string;
  observation?: string;
  createdBy?: string;
  createdByName?: string;
  discountPercent?: number;
  /** "FIXED" quando o desconto geral foi pedido em reais. */
  discountMode?: string;
  /** Desconto geral em reais; manda no cálculo quando o modo é FIXED. */
  discountAmount?: number;
  originalTotalValue?: number;
  isLocked?: boolean;
  createdAt: string;
  updatedAt?: string;
  approvedAt?: string;
  status: "PENDING" | "SENT_FOR_APPROVAL" | "APPROVED" | "CANCELLED";
  totalValue: number;
  deficitValue?: number;
  data?: BudgetStoredFormData;
  approvedItemDiscounts?: Record<string, number>;
  /** Desconto de item pedido em reais, por chave `eventoId-itemId`. */
  approvedItemDiscountAmounts?: Record<string, number>;
  parentId?: string;
  version?: number;
  budgetCode?: string;
  archivedAt?: string;
  archivedByName?: string;
}

export interface BudgetStoredFormData {
  eventStartDate?: string;
  eventEndDate?: string;
  schemaVersion?: number;
  canonicalSnapshot?: BudgetCanonicalSnapshot;
  [key: string]: unknown;
}

export type BudgetSavePayload = {
  instituicao?: string;
  curso?: string;
  comissao?: string;
  telefone?: string;
  controle?: string;
  observation?: string;
  totalValue?: number;
  originalTotalValue?: number;
  deficitValue?: number;
  discountPercent?: number;
  discountMode?: string;
  discountAmount?: number;
  approvedItemDiscounts?: Record<string, number>;
  approvedItemDiscountAmounts?: Record<string, number>;
  data?: unknown;
  status?: BudgetStatusDto;
  isLocked?: boolean;
  createdByName?: string;
  budgetCode?: string;
};

// Mapeia snake_case do banco para camelCase do frontend
export function mapBudget(row: BudgetRowDto): Budget {
  const undefIfNull = <T,>(value: T | null | undefined): T | undefined =>
    value === null ? undefined : value;

  return {
    id: row.id,
    instituicao: fixMojibakeText(row.instituicao),
    curso: fixMojibakeText(row.curso),
    comissao: undefIfNull(row.comissao ? fixMojibakeText(row.comissao) : row.comissao),
    telefone: undefIfNull(row.telefone ? fixMojibakeText(row.telefone) : row.telefone),
    controle: undefIfNull(row.controle),
    observation: undefIfNull(row.observation ? fixMojibakeText(row.observation) : row.observation),
    createdBy: undefIfNull(row.created_by_name ? fixMojibakeText(row.created_by_name) : row.created_by_name),
    createdByName: undefIfNull(row.created_by_name ? fixMojibakeText(row.created_by_name) : row.created_by_name),
    discountPercent: Number(row.discount_percent ?? 0),
    discountMode: row.discount_mode ?? undefined,
    discountAmount:
      row.discount_amount === null || row.discount_amount === undefined
        ? undefined
        : Number(row.discount_amount),
    originalTotalValue: row.original_total_value ? Number(row.original_total_value) : undefined,
    isLocked: undefIfNull(row.is_locked),
    createdAt: row.created_at,
    updatedAt: undefIfNull(row.updated_at),
    approvedAt: undefIfNull(row.approved_at),
    status: row.status,
    totalValue: Number(row.total_value ?? 0),
    deficitValue: row.deficit_value ? Number(row.deficit_value) : undefined,
    data: row.form_data
      ? adaptBudgetStoredFormData(deepFixMojibake(row.form_data as BudgetStoredFormData))
      : undefined,
    approvedItemDiscounts: row.approved_item_discounts ?? {},
    approvedItemDiscountAmounts: row.approved_item_discount_amounts ?? {},
    parentId: (row.form_data as any)?.parentId,
    version: (row.form_data as any)?.version,
    budgetCode: row.budget_code ?? undefined,
    archivedAt: undefIfNull(row.archived_at),
    archivedByName: undefIfNull(row.archived_by_name ? fixMojibakeText(row.archived_by_name) : row.archived_by_name),
  };
}

interface BudgetState {
  budgets: Budget[];
  isLoading: boolean;
  fetchBudgets: () => Promise<void>;
  fetchBudgetById: (id: string) => Promise<Budget | undefined>;
  addBudget: (budget: BudgetSavePayload) => Promise<string | undefined>; // retorna o ID gerado pelo banco
  updateBudget: (id: string, updates: Partial<Budget>) => Promise<void>;
  updateStatus: (id: string, status: Budget["status"]) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  clearBudgets: () => void;
  getBudgetById: (id: string) => Budget | undefined;
}

export const useBudgetStore = create<BudgetState>((set, get) => ({
  budgets: [],
  isLoading: false,

  fetchBudgets: async () => {
    set({ isLoading: true });
    try {
      const res = await budgetsApi.getAll();
      if (res.ok) {
        set({ budgets: (res.data ?? []).map(mapBudget) });
      }
    } catch (err) {
      console.error("fetchBudgets:", err);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchBudgetById: async (id: string): Promise<Budget | undefined> => {
    set({ isLoading: true });
    try {
      const res = await budgetsApi.getById(id);
      if (!res.ok || !res.data) {
        return undefined;
      }

      const mapped = mapBudget(res.data);
      set((state) => {
        const exists = state.budgets.some((b) => b.id === mapped.id);
        return {
          budgets: exists
            ? state.budgets.map((b) => (b.id === mapped.id ? mapped : b))
            : [...state.budgets, mapped],
        };
      });

      return mapped;
    } catch (err) {
      console.error("fetchBudgetById:", err);
      return undefined;
    } finally {
      set({ isLoading: false });
    }
  },

  addBudget: async (budgetPayload: BudgetSavePayload): Promise<string | undefined> => {
    try {
      // Mapear campos camelCase do frontend para o formato esperado pelo backend
      const apiPayload: BudgetWriteDto = {
        instituicao: budgetPayload.instituicao,
        curso: budgetPayload.curso,
        comissao: budgetPayload.comissao,
        telefone: budgetPayload.telefone,
        controle: budgetPayload.controle,
        observation: budgetPayload.observation,
        totalValue: budgetPayload.totalValue,
        originalTotalValue: budgetPayload.originalTotalValue,
        deficitValue: budgetPayload.deficitValue,
        discountPercent: budgetPayload.discountPercent ?? 0,
        discountMode: budgetPayload.discountMode,
        discountAmount: budgetPayload.discountAmount ?? 0,
        approvedItemDiscounts: budgetPayload.approvedItemDiscounts ?? {},
        approvedItemDiscountAmounts: budgetPayload.approvedItemDiscountAmounts ?? {},
        formData: budgetPayload.data ?? {},
        status: budgetPayload.status ?? "PENDING",
        isLocked: budgetPayload.isLocked ?? false,
        createdByName: budgetPayload.createdByName,
        // Sem o código, o backend gera um novo: a nova versão sairia da família
        // do orçamento e a pasta de versões perderia a versão anterior.
        budgetCode: budgetPayload.budgetCode,
      };
      const res = await budgetsApi.create(apiPayload);
      if (res.ok) {
        // Re-fetch para garantir consistência
        await get().fetchBudgets();
        toast.success("Orçamento salvo com sucesso!");
        // Retorna o ID real gerado pelo PostgreSQL
        return res.data?.id as string | undefined;
      } else {
        toast.error(res.message || "Erro ao criar orçamento");
        return undefined;
      }
    } catch (err) {
      console.error("addBudget:", err);
      toast.error("Erro ao salvar orçamento. Backend offline?");
      return undefined;
    }
  },

  updateBudget: async (id: string, updates: Partial<Budget>) => {
    try {
      // Se for apenas atualização de lock
      if (Object.keys(updates).length === 1 && "isLocked" in updates) {
        await budgetsApi.setLock(id, updates.isLocked!);
        set((state) => ({
          budgets: state.budgets.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        }));
        return;
      }

      // Atualização completa
      const current = get().getBudgetById(id);
      const merged = { ...current, ...updates };
      const apiPayload: BudgetWriteDto = {
        instituicao: merged.instituicao,
        curso: merged.curso,
        comissao: merged.comissao,
        telefone: merged.telefone,
        controle: merged.controle,
        observation: merged.observation,
        totalValue: merged.totalValue,
        originalTotalValue: merged.originalTotalValue,
        deficitValue: merged.deficitValue,
        discountPercent: merged.discountPercent ?? 0,
        discountMode: merged.discountMode,
        discountAmount: merged.discountAmount ?? 0,
        approvedItemDiscounts: merged.approvedItemDiscounts ?? {},
        approvedItemDiscountAmounts: merged.approvedItemDiscountAmounts ?? {},
        formData: merged.data ?? {},
        status: merged.status ?? "PENDING",
        isLocked: merged.isLocked ?? false,
        createdByName: merged.createdByName,
      };
      const res = await budgetsApi.update(id, apiPayload);
      if (res.ok) {
        await get().fetchBudgets();
      } else {
        toast.error(res.message || "Erro ao atualizar orçamento");
      }
    } catch (err) {
      console.error("updateBudget:", err);
      toast.error("Erro ao atualizar orçamento");
    }
  },

  updateStatus: async (id: string, status: Budget["status"]) => {
    try {
      await budgetsApi.setStatus(id, status);
      set((state) => ({
        budgets: state.budgets.map((b) => (b.id === id ? { ...b, status } : b)),
      }));
    } catch (err) {
      console.error("updateStatus:", err);
    }
  },

  deleteBudget: async (id: string) => {
    try {
      const res = await budgetsApi.remove(id);
      if (res.ok) {
        set((state) => ({ budgets: state.budgets.filter((b) => b.id !== id) }));
        toast.success("Orçamento excluído!");
      } else {
        toast.error(res.message || "Erro ao excluir orçamento");
      }
    } catch (err) {
      console.error("deleteBudget:", err);
      toast.error("Erro ao excluir orçamento");
    }
  },

  clearBudgets: () => set({ budgets: [] }),

  getBudgetById: (id: string) => get().budgets.find((b) => b.id === id),
}));
