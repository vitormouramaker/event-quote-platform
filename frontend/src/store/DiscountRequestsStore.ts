import { create } from "zustand";
import { discountsApi, editRequestsApi } from "../services/api";
import type {
  DiscountRequestRowDto,
  ItemDiscountRequestRowDto,
  EditRequestRowDto,
  UpdateItemDiscountStatusDto,
} from "../services/api";
import { toast } from "sonner";
import { queryClient } from "../lib/queryClient";
import { fixMojibakeText } from "../utils/textEncoding";

// ---- Interfaces (mantidas para compatibilidade com o restante do código) ----

export interface DiscountRequest {
  id: string;
  budgetId?: string;
  clientName: string;
  totalValue: number;
  discountPercent: number;
  originalDiscountPercent?: number;
  discountValue: number;
  finalValue: number;
  /** "FIXED" quando o desconto foi pedido em reais. */
  discountMode?: string;
  /** Valor em reais pedido; preenchido somente no modo FIXED. */
  requestedAmount?: number;
  newDiscountValue?: number;
  requestedBy: string;
  requestedAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  approvedBy?: string;
  approvedAt?: string;
  observation?: string;
  requestObservation: string;
  attachmentName?: string;
  attachmentUrl?: string;
}

export interface ItemDiscountRequest {
  id: string;
  budgetId: string;
  clientName: string;
  eventId: string;
  itemId: string;
  itemName: string;
  originalUnitPrice: number;
  requestedPercentage: number;
  /** "FIXED" quando o desconto do item foi pedido em reais. */
  discountMode?: string;
  requestedAmount?: number;
  newDiscountAmount?: number;
  requestedBy: string;
  requestedAt: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  approvedBy?: string;
  approvedAt?: string;
  observation?: string;
  newDiscountPercent?: number;
  attachmentName?: string;
  attachmentUrl?: string;
  attachmentFile?: File | null;
}

export interface EditRequest {
  id: string;
  budgetId: string;
  clientName: string;
  requestedBy: string;
  requestedAt: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedBy?: string;
  approvedAt?: string;
  observation?: string;
}

// Mappers snake_case â†’ camelCase
export function mapDiscountRequest(r: DiscountRequestRowDto): DiscountRequest {
  const undefIfNull = <T,>(value: T | null | undefined): T | undefined =>
    value === null ? undefined : value;

  return {
    id: r.id,
    budgetId: undefIfNull(r.budget_id),
    clientName: fixMojibakeText(r.client_name),
    totalValue: Number(r.total_value ?? 0),
    discountPercent: Number(r.discount_percent ?? 0),
    discountValue: Number(r.discount_value ?? 0),
    finalValue: Number(r.final_value ?? 0),
    discountMode: r.discount_mode ?? undefined,
    // `??` em vez de `||`: um valor zerado é dado, não ausência.
    requestedAmount:
      r.requested_amount === null || r.requested_amount === undefined
        ? undefined
        : Number(r.requested_amount),
    newDiscountValue:
      r.new_discount_value === null || r.new_discount_value === undefined
        ? undefined
        : Number(r.new_discount_value),
    requestedBy: fixMojibakeText(r.requested_by),
    requestedAt: r.requested_at,
    status: r.status,
    approvedBy: undefIfNull(r.approved_by ? fixMojibakeText(r.approved_by) : r.approved_by),
    approvedAt: undefIfNull(r.approved_at),
    observation: undefIfNull(r.observation ? fixMojibakeText(r.observation) : r.observation),
    requestObservation: r.request_observation ? fixMojibakeText(r.request_observation) : "",
    attachmentName: undefIfNull(r.attachment_name),
    attachmentUrl: undefIfNull(r.attachment_url),
  };
}

export function mapItemRequest(r: ItemDiscountRequestRowDto): ItemDiscountRequest {
  const undefIfNull = <T,>(value: T | null | undefined): T | undefined =>
    value === null ? undefined : value;

  return {
    id: r.id,
    budgetId: r.budget_id,
    clientName: fixMojibakeText(r.client_name),
    eventId: r.event_id,
    itemId: r.item_id,
    itemName: fixMojibakeText(r.item_name),
    originalUnitPrice: Number(r.original_unit_price ?? 0),
    requestedPercentage: Number(r.requested_percentage ?? 0),
    discountMode: r.discount_mode ?? undefined,
    requestedAmount:
      r.requested_amount === null || r.requested_amount === undefined
        ? undefined
        : Number(r.requested_amount),
    newDiscountAmount:
      r.new_discount_amount === null || r.new_discount_amount === undefined
        ? undefined
        : Number(r.new_discount_amount),
    requestedBy: fixMojibakeText(r.requested_by),
    requestedAt: r.requested_at,
    reason: r.reason ? fixMojibakeText(r.reason) : "",
    status: r.status,
    approvedBy: undefIfNull(r.approved_by ? fixMojibakeText(r.approved_by) : r.approved_by),
    approvedAt: undefIfNull(r.approved_at),
    observation: undefIfNull(r.observation ? fixMojibakeText(r.observation) : r.observation),
    newDiscountPercent: r.new_discount_percent ? Number(r.new_discount_percent) : undefined,
    attachmentName: undefIfNull(r.attachment_name),
    attachmentUrl: undefIfNull(r.attachment_url),
  };
}

export function mapEditRequest(r: EditRequestRowDto): EditRequest {
  const undefIfNull = <T,>(value: T | null | undefined): T | undefined =>
    value === null ? undefined : value;

  return {
    id: r.id,
    budgetId: r.budget_id,
    clientName: fixMojibakeText(r.client_name),
    requestedBy: fixMojibakeText(r.requested_by),
    requestedAt: r.requested_at,
    reason: r.reason ? fixMojibakeText(r.reason) : "",
    status: r.status,
    approvedBy: undefIfNull(r.approved_by ? fixMojibakeText(r.approved_by) : r.approved_by),
    approvedAt: undefIfNull(r.approved_at),
    observation: undefIfNull(r.observation ? fixMojibakeText(r.observation) : r.observation),
  };
}

// ---- Store ----

export interface DiscountRequestsState {
  requests: DiscountRequest[];
  itemRequests: Record<string, ItemDiscountRequest[]>;
  editRequests: EditRequest[];
  relockGuardDirtyBudgets: Record<string, boolean>;

  // Fetch
  fetchAll: () => Promise<void>;
  fetchByBudget: (budgetId: string) => Promise<void>;

  // Global Discount
  addRequest: (request: Omit<DiscountRequest, "id" | "requestedAt">, attachmentFile?: File | null) => Promise<void>;
  updateRequestStatus: (
    id: string,
    status: "APPROVED" | "REJECTED",
    metadata?: {
      approvedBy: string;
      observation: string;
      newDiscountPercent?: number;
      newDiscountValue?: number;
    }
  ) => Promise<void>;

  // Item Discount
  addItemRequest: (budgetId: string, request: Omit<ItemDiscountRequest, "id" | "requestedAt">, attachmentFile?: File | null) => Promise<void>;
  updateItemRequestStatus: (
    budgetId: string, eventId: string, itemId: string,
    status: "APPROVED" | "REJECTED",
    metadata?: {
      approvedBy: string;
      observation: string;
      newDiscountPercent?: number;
      newDiscountAmount?: number;
    }
  ) => Promise<void>;
  removeItemRequest: (budgetId: string, eventId: string, itemId: string) => Promise<void>;
  updateItemRequest: (budgetId: string, eventId: string, itemId: string, updates: Partial<ItemDiscountRequest>) => void;

  // Edit Request
  addEditRequest: (request: Omit<EditRequest, "id" | "requestedAt">) => Promise<void>;
  updateEditRequestStatus: (
    id: string,
    status: "APPROVED" | "REJECTED",
    metadata: { approvedBy: string; observation: string }
  ) => Promise<void>;
  getEditRequests: (budgetId?: string) => EditRequest[];

  // Selectors
  getPendingRequests: () => (DiscountRequest | ItemDiscountRequest)[];
  getHistoryRequests: () => (DiscountRequest | ItemDiscountRequest)[];
  getItemRequestsByBudget: (budgetId: string) => ItemDiscountRequest[];
  markRelockGuardBudgetDirty: (budgetId?: string) => void;
  clearRelockGuardBudgetDirty: (budgetId?: string) => void;
  hasRelockGuardBudgetDirty: (budgetId?: string) => boolean;

  // Legado (não usado com API, mas mantido para compatibilidade)
  migrateTempBudget: (tempId: string, finalId: string, clientName: string) => void;
}

// Verifica se um ID é um UUID válido do banco (não um ID temporário como "temp-budget")
function isRealId(id?: string): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function mergeFetchedItemRequests(
  existing: ItemDiscountRequest[],
  fetched: ItemDiscountRequest[],
): ItemDiscountRequest[] {
  const optimisticPending = existing.filter(
    (request) => !isRealId(request.id) && request.status === "PENDING",
  );

  if (optimisticPending.length === 0) {
    return fetched;
  }

  const merged = [...fetched];

  optimisticPending.forEach((localRequest) => {
    const alreadyFetched = fetched.some((remoteRequest) =>
      remoteRequest.eventId === localRequest.eventId &&
      remoteRequest.itemId === localRequest.itemId &&
      remoteRequest.status === localRequest.status &&
      remoteRequest.requestedPercentage === localRequest.requestedPercentage &&
      remoteRequest.reason === localRequest.reason,
    );

    if (!alreadyFetched) {
      merged.push(localRequest);
    }
  });

  return merged;
}

export const useDiscountRequestsStore = create<DiscountRequestsState>((set, get) => ({
  requests: [],
  itemRequests: {},
  editRequests: [],
  relockGuardDirtyBudgets: {},

  // ---- FETCH ----
  fetchAll: async () => {
    try {
      const [dr, er] = await Promise.all([
        discountsApi.getAll(),
        editRequestsApi.getAll(),
      ]);
      if (dr.ok) {
        set({ requests: (dr.data ?? []).map(mapDiscountRequest) });
      }
      if (er.ok) {
        set({ editRequests: (er.data ?? []).map(mapEditRequest) });
      }
    } catch (err) {
      console.error("fetchAll discount/edit:", err);
    }
  },

  fetchByBudget: async (budgetId: string) => {
    try {
      const [dr, ir, er] = await Promise.all([
        discountsApi.getByBudget(budgetId),
        discountsApi.getItemsByBudget(budgetId),
        editRequestsApi.getByBudget(budgetId),
      ]);
      if (dr.ok) {
        set((state) => ({
          requests: [
            ...state.requests.filter((r) => r.budgetId !== budgetId),
            ...(dr.data ?? []).map(mapDiscountRequest),
          ],
        }));
      }
      if (ir.ok) {
        const fetchedItemRequests = (ir.data ?? []).map(mapItemRequest);
        set((state) => ({
          itemRequests: {
            ...state.itemRequests,
            [budgetId]: mergeFetchedItemRequests(
              state.itemRequests[budgetId] ?? [],
              fetchedItemRequests,
            ),
          },
        }));
      }
      if (er.ok) {
        set((state) => ({
          editRequests: [
            ...state.editRequests.filter((r) => r.budgetId !== budgetId),
            ...(er.data ?? []).map(mapEditRequest),
          ],
        }));
      }
    } catch (err) {
      console.error("fetchByBudget:", err);
    }
  },

  // ---- DISCOUNT GLOBAL ----
  addRequest: async (request, attachmentFile) => {
    try {
      // Se o budgetId ainda for temporário (antes do save), armazenar apenas localmente
      if (!isRealId(request.budgetId)) {
        const local: DiscountRequest = {
          ...request,
          id: `temp-${Date.now()}`,
          requestedAt: new Date().toISOString(),
        };
        set((state) => ({ requests: [...state.requests, local] }));
        return;
      }
      const res = await discountsApi.create(request, attachmentFile);
      if (res.ok) {
        set((state) => ({ requests: [...state.requests, mapDiscountRequest(res.data)] }));
        get().markRelockGuardBudgetDirty(request.budgetId);
        void queryClient.invalidateQueries({ queryKey: ["discount-approvals-data"] });
      } else {
        toast.error(res.message || "Erro ao enviar solicitação");
      }
    } catch (err) {
      console.error("addRequest:", err);
      toast.error("Erro ao enviar solicitação de desconto");
    }
  },

  updateRequestStatus: async (id, status, metadata) => {
    try {
      const res = await discountsApi.updateStatus(
        id, status, metadata?.observation ?? "", metadata?.newDiscountPercent,
        metadata?.newDiscountValue
      );
      if (res.ok) {
        set((state) => ({
          requests: state.requests.map((r) =>
            r.id === id ? { ...r, status, approvedBy: metadata?.approvedBy, observation: metadata?.observation } : r
          ),
        }));
        void queryClient.invalidateQueries({ queryKey: ["discount-approvals-data"] });
      }
    } catch (err) {
      console.error("updateRequestStatus:", err);
    }
  },

  // ---- ITEM DISCOUNT ----
  addItemRequest: async (budgetId, request, attachmentFile) => {
    // Staging local: a solicitação de item só vai ao backend no Salvar, quando
    // é gravada contra a NOVA versão do orçamento (flush em migrateTempBudget).
    const local: ItemDiscountRequest = {
      ...request,
      id: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      budgetId,
      requestedAt: new Date().toISOString(),
      attachmentFile: attachmentFile || undefined,
    };
    set((state) => ({
      itemRequests: {
        ...state.itemRequests,
        [budgetId]: [...(state.itemRequests[budgetId] ?? []), local],
      },
    }));
    get().markRelockGuardBudgetDirty(budgetId);
  },

  updateItemRequestStatus: async (budgetId, eventId, itemId, status, metadata) => {
    try {
      const payload: UpdateItemDiscountStatusDto = {
        budgetId, eventId, itemId, status,
        observation: metadata?.observation ?? "",
        newDiscountPercent: metadata?.newDiscountPercent,
        newDiscountAmount: metadata?.newDiscountAmount,
      };
      await discountsApi.updateItemStatus(payload);
      set((state) => ({
        itemRequests: {
          ...state.itemRequests,
          [budgetId]: (state.itemRequests[budgetId] ?? []).map((r) =>
            r.eventId === eventId && r.itemId === itemId
              ? {
                  ...r,
                  status,
                  approvedBy: metadata?.approvedBy,
                  newDiscountPercent: metadata?.newDiscountPercent ?? r.newDiscountPercent,
                  newDiscountAmount: metadata?.newDiscountAmount ?? r.newDiscountAmount,
                }
              : r
          ),
        },
      }));
      void queryClient.invalidateQueries({ queryKey: ["discount-approvals-data"] });
    } catch (err) {
      console.error("updateItemRequestStatus:", err);
    }
  },

  removeItemRequest: async (budgetId, eventId, itemId) => {
    // Staging local: a remoção só reflete no backend ao Salvar — a nova versão
    // é criada já sem este item.
    set((state) => ({
      itemRequests: {
        ...state.itemRequests,
        [budgetId]: (state.itemRequests[budgetId] ?? []).filter(
          (r) => !(r.eventId === eventId && r.itemId === itemId)
        ),
      },
    }));
    get().markRelockGuardBudgetDirty(budgetId);
  },

  updateItemRequest: (budgetId, eventId, itemId, updates) => {
    set((state) => ({
      itemRequests: {
        ...state.itemRequests,
        [budgetId]: (state.itemRequests[budgetId] ?? []).map((r) =>
          r.eventId === eventId && r.itemId === itemId ? { ...r, ...updates } : r
        ),
      },
    }));
    get().markRelockGuardBudgetDirty(budgetId);
  },

  // ---- EDIT REQUESTS ----
  addEditRequest: async (request) => {
    try {
      const res = await editRequestsApi.create(request);
      if (res.ok) {
        set((state) => ({ editRequests: [...state.editRequests, mapEditRequest(res.data)] }));
        void queryClient.invalidateQueries({ queryKey: ["discount-approvals-data"] });
        toast.success("Solicitação de edição enviada!");
      } else {
        toast.error(res.message || "Erro ao enviar solicitação de edição");
      }
    } catch (err) {
      console.error("addEditRequest:", err);
      toast.error("Erro ao enviar solicitação de edição");
    }
  },

  updateEditRequestStatus: async (id, status, metadata) => {
    try {
      const res = await editRequestsApi.updateStatus(id, status, metadata.observation);
      if (res.ok) {
        set((state) => ({
          editRequests: state.editRequests.map((r) =>
            r.id === id ? { ...r, status, approvedBy: metadata.approvedBy } : r
          ),
        }));
        void queryClient.invalidateQueries({ queryKey: ["discount-approvals-data"] });
      }
    } catch (err) {
      console.error("updateEditRequestStatus:", err);
    }
  },

  getEditRequests: (budgetId?: string) => {
    const all = get().editRequests;
    return budgetId ? all.filter((r) => r.budgetId === budgetId) : all;
  },

  // ---- SELECTORS ----
  getPendingRequests: () => {
    const { requests, itemRequests } = get();
    const globalPending = requests.filter((r) => r.status === "PENDING");
    const itemPending = Object.values(itemRequests).flat().filter((r) => r.status === "PENDING");
    return [...globalPending, ...itemPending];
  },

  getHistoryRequests: () => {
    const { requests, itemRequests } = get();
    const globalHistory = requests.filter((r) => r.status !== "PENDING");
    const itemHistory = Object.values(itemRequests).flat().filter((r) => r.status !== "PENDING");
    return [...globalHistory, ...itemHistory];
  },

  getItemRequestsByBudget: (budgetId: string) => get().itemRequests[budgetId] ?? [],

  markRelockGuardBudgetDirty: (budgetId?: string) => {
    if (!isRealId(budgetId)) return;
    const safeBudgetId = budgetId as string;
    set((state) => ({
      relockGuardDirtyBudgets: {
        ...state.relockGuardDirtyBudgets,
        [safeBudgetId]: true,
      },
    }));
  },

  clearRelockGuardBudgetDirty: (budgetId?: string) => {
    if (!budgetId) return;
    set((state) => {
      if (!state.relockGuardDirtyBudgets[budgetId]) return state;
      const relockGuardDirtyBudgets = { ...state.relockGuardDirtyBudgets };
      delete relockGuardDirtyBudgets[budgetId];
      return { relockGuardDirtyBudgets };
    });
  },

  hasRelockGuardBudgetDirty: (budgetId?: string) => {
    if (!budgetId) return false;
    return Boolean(get().relockGuardDirtyBudgets[budgetId]);
  },

  // Flush das solicitações de item staged (de `tempId`, que pode ser um id
  // temporário OU o id da versão sendo editada) para a NOVA versão `finalId`.
  // Apenas solicitações PENDING são recriadas como pedido; APPROVED (aplicação
  // direta do gestor) viajam no campo approvedItemDiscounts do orçamento salvo.
  migrateTempBudget: (tempId: string, finalId: string, clientName: string) => {
    const { itemRequests, fetchByBudget, markRelockGuardBudgetDirty } = get();
    const tempRequests = itemRequests[tempId];
    if (!tempRequests || tempRequests.length === 0) return;
    if (!isRealId(finalId)) return;

    const pendingRequests = tempRequests
      .filter((req) => !req.status || req.status === "PENDING")
      .map((req) => ({
        ...req,
        budgetId: finalId,
      }));

    if (tempId !== finalId && pendingRequests.length > 0) {
      set((state) => ({
        itemRequests: {
          ...state.itemRequests,
          [finalId]: pendingRequests,
        },
      }));
    }

    // Executa de forma assíncrona para não bloquear o fluxo de salvamento
    (async () => {
      let successCount = 0;

      for (const req of tempRequests) {
        if (req.status && req.status !== "PENDING") continue;
        // O que o gestor aprovou (`newDiscount*`) nao viaja no pedido: ele
        // pertence a versao anterior, e esta aqui esta sendo recriada como
        // pendente. `discountMode` e `requestedAmount` sim, porque sao o
        // pedido em si quando o desconto foi pedido em reais.
        const {
          id, budgetId, requestedAt, approvedBy, approvedAt,
          newDiscountPercent, newDiscountAmount, observation,
          attachmentUrl, attachmentName,
          attachmentFile, ...apiPayload
        } = req;

        const payload = {
          ...apiPayload,
          budgetId: finalId,
          clientName,
        };

        try {
          const res = await discountsApi.createItem(payload, attachmentFile);
          if (res.ok) successCount++;
        } catch (err) {
          console.error("Erro ao migrar item request:", err);
        }
      }

      // Remove os requests staged da store (o id de origem fica obsoleto)
      set((state) => {
        if (tempId === finalId) return state;
        const newItemRequests = { ...state.itemRequests };
        delete newItemRequests[tempId];
        return { itemRequests: newItemRequests };
      });

      // Recarrega do backend para reconciliar estado otimista/local com o banco.
      await fetchByBudget(finalId);
      if (successCount > 0) {
        markRelockGuardBudgetDirty(finalId);
      }
      void queryClient.invalidateQueries({ queryKey: ["discount-approvals-data"] });
    })();
  },
}));
