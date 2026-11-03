import type { Budget, BudgetStoredFormData } from "../../../../store/budgetStore";
import type { ItemVariationDto } from "../../../../services/api";

export type SummaryCustomAddedItem = {
  id?: string;
  name?: string;
  quantity?: number;
  unitPrice?: number;
  isNoFixedValue?: boolean;
  originalId?: string;
  originalEventId?: string;
  quantityEditable?: boolean;
  priceEditable?: boolean;
  displayValue?: string;
  quantityDisplay?: string;
  hasSubitems?: boolean;
  selectedVariationId?: string;
  variations?: ItemVariationDto[];
  subitems?: Array<{
    name: string;
  }>;
};

export type SummaryCustomItems = Record<
  string,
  {
    added?: SummaryCustomAddedItem[];
    removedIds?: string[];
  }
>;

export type SummaryFormValues = BudgetStoredFormData & {
  id?: string;
  selectedEvents?: string[];
  status?: Budget["status"];
  observation?: string;
  discountPercent?: number;
  /** "FIXED" quando o desconto geral foi pedido em reais. */
  discountMode?: string;
  /** Desconto geral em reais; manda no cálculo quando o modo é FIXED. */
  discountAmount?: number;
  instituicao?: string;
  curso?: string;
  comissao?: string;
  telefone?: string;
  controle?: string;
  customItems?: SummaryCustomItems;
  items?: Record<string, Record<string, string | number | boolean | null | undefined>>;
  [key: string]: unknown;
};

export type ApprovedItemDiscountLike = {
  id: string;
  itemName: string;
  requestedPercentage: number;
  newDiscountPercent?: number;
  originalUnitPrice: number;
};

export type VisibleItemRequestLike = ApprovedItemDiscountLike & {
  eventId: string;
  itemId?: string;
  status: string;
  reason: string;
  observation?: string;
};

export type ApprovedGlobalRequestLike = {
  approvedBy?: string;
};

export type EventTotalsResult = {
  total: number;
  discountedTotal: number;
};

export type SummaryBudgetDataPayload = {
  id?: string;
  instituicao?: string;
  curso?: string;
  comissao?: string;
  telefone?: string;
  controle?: string;
  createdAt: string;
  updatedAt: string;
  status: Budget["status"];
  observation: string;
  createdBy: string;
  createdByName: string;
  isLocked: boolean;
  totalValue: number;
  originalTotalValue: number;
  deficitValue: number;
  data: SummaryFormValues;
  discountPercent?: number;
  /** "FIXED" quando o desconto geral foi pedido em reais. */
  discountMode?: string;
  discountAmount?: number;
  /** Descontos de item já aprovados, herdados/aplicados na versão salva. */
  approvedItemDiscounts?: Record<string, number>;
  /** Desconto de item pedido em reais, por chave `eventoId-itemId`. */
  approvedItemDiscountAmounts?: Record<string, number>;
  /** Código único da família do orçamento (herdado do original em versões) */
  budgetCode?: string;
};
