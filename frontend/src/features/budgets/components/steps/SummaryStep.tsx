import { useFormContext, useWatch } from "react-hook-form";
import { useEffect } from "react";
import { useAuthStore } from "../../../../store/authStore";
import { Button } from "../../../../components/Button/Button";
import { useBudgetStore } from "../../../../store/budgetStore";
import type { BudgetItem, EventType } from "../../data/mockData";
import {
  orderSelectedEvents,
  type BudgetCatalogEvent,
} from "../../data/budgetCatalog";
import { useNavigate } from "react-router-dom";
import styles from "./Steps.module.css";
import summaryStyles from "./SummaryStep.module.css";
import { useDiscountRequestsStore } from "../../../../store/DiscountRequestsStore";
import { Trash2 } from "lucide-react";
import { calculateSummaryStepEventTotals } from "../../domain/eventCalculations";
import { getParticipationQuantity } from "../../data/runtimeBudgetRules";
import { isCanonicalEvent } from "../../domain/budgetUiRules";
import { useCreateBudgetMutation } from "../../mutations/useBudgetMutations";
import { SummaryMoneyLine, formatCurrency } from "./SummaryStepMoney";
import { SummaryStepDiscountModal } from "./SummaryStepDiscountModal";
import { EventDetailsTable } from "./SummaryStepEventDetails";
import { useSummaryStepGlobalDiscountDraft } from "./useSummaryStepGlobalDiscountDraft";
import { useSummaryStepSaveFlow } from "./useSummaryStepSaveFlow";
import {
  DEFAULT_DISCOUNT_MODE,
  formatAppliedDiscount,
  formatDiscountInput,
  resolveDiscountAmounts,
  resolveDiscountMode,
  resolveGlobalDiscountValue,
  formatItemDiscount,
  resolveItemDiscountInput,
} from "../../domain/discountInput";
import {
  buildSummaryBlocks,
  sumSummaryBlocks,
} from "../../domain/summaryBlocks";
import {
  BudgetPaymentSummary,
  BudgetTotalsSummary,
} from "../BudgetPaymentSummary";
import {
  buildApprovedItemDiscountDetails,
  type ApprovedItemDiscountDetail,
} from "../../domain/itemDiscountDetails";
import type {
  ApprovedGlobalRequestLike,
  SummaryCustomItems,
  SummaryFormValues,
  VisibleItemRequestLike,
} from "./SummaryStep.types";

interface SummaryStepProps {
  onBack: () => void;
  budgetEvents: BudgetCatalogEvent[];
  /** Libera a navegação no guard de saída antes de salvar (evita modal "sair sem salvar"). */
  onBeforeSaveNavigate?: () => void;
}

export function ApprovedItemDiscountsRow({
  details,
}: {
  details: ApprovedItemDiscountDetail[];
}) {
  if (details.length === 0) return null;

  const totalDiscountValue = details.reduce(
    (acc, detail) => acc + detail.totalImpactAmount,
    0,
  );
  const requests = details.map((detail) => ({
    id: detail.id,
    itemName:
      detail.administrationImpactAmount > 0
        ? `${detail.itemName} + adm.`
        : detail.itemName,
    requestedPercentage: detail.appliedPercentage,
    discountMode: detail.discountMode,
    requestedAmount: detail.requestedAmount,
    newDiscountAmount: detail.newDiscountAmount,
    originalUnitPrice:
      detail.appliedPercentage > 0
        ? detail.totalImpactAmount / (detail.appliedPercentage / 100)
        : detail.baseAmount,
  }));

  return (
    <div
      className={summaryStyles.row}
      style={{
        color: "#16a34a",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "4px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
        <span>Descontos por Item (Aprovados)</span>
        <span>- {formatCurrency(totalDiscountValue)}</span>
      </div>
      <div style={{ fontSize: "11px", paddingLeft: "10px", width: "100%" }}>
        {requests.map((r) => (
          <div
            key={r.id}
            style={{ display: "flex", justifyContent: "space-between", color: "#15803d" }}
          >
            <span>• {r.itemName} ({r.requestedPercentage}%)</span>
            <span>- {formatCurrency(r.originalUnitPrice * (r.requestedPercentage / 100))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemDiscountRequestsPanel({
  requests,
  eventCatalog,
}: {
  requests: VisibleItemRequestLike[];
  eventCatalog?: BudgetCatalogEvent[];
}) {
  if (requests.length === 0) return null;

  const requestsByEvent: Record<string, VisibleItemRequestLike[]> = {};
  requests.forEach((req) => {
    if (!requestsByEvent[req.eventId]) requestsByEvent[req.eventId] = [];
    requestsByEvent[req.eventId].push(req);
  });

  return (
    <div
      style={{
        marginTop: "20px",
        padding: "10px",
        backgroundColor: "#f0fdf4",
        borderRadius: "8px",
        border: "1px solid #bbf7d0",
      }}
    >
      <h4
        style={{
          fontSize: "14px",
          fontWeight: "bold",
          color: "#15803d",
          marginBottom: "10px",
        }}
      >
        Detalhamento de Descontos Solicitados/Aprovados
      </h4>
      {Object.entries(requestsByEvent).map(([evtId, evtRequests]) => {
        const evtName = eventCatalog?.find((e) => e.id === evtId)?.title || evtId;
        return (
          <div key={evtId} style={{ marginBottom: "10px", fontSize: "13px" }}>
            <div style={{ fontWeight: "600", marginBottom: "4px", color: "#166534" }}>
              {evtName}
            </div>
            <ul style={{ paddingLeft: "20px", margin: 0 }}>
              {evtRequests.map((req, i) => (
                <li key={`${req.id}-${i}`} style={{ marginBottom: "4px" }}>
                  <span style={{ fontWeight: 500 }}>{req.itemName}</span>
                  <span
                    style={{
                      fontSize: "11px",
                      marginLeft: "6px",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      backgroundColor: req.status === "APPROVED" ? "#dcfce7" : "#fef9c3",
                      color: req.status === "APPROVED" ? "#166534" : "#854d0e",
                      border: `1px solid ${req.status === "APPROVED" ? "#86efac" : "#fde047"}`,
                    }}
                  >
                    {req.status === "APPROVED" ? "Aprovado" : "Pendente"}
                  </span>
                  <div style={{ fontSize: "11px", color: "#555", paddingLeft: "4px" }}>
                    Desconto: {formatItemDiscount(req)}
                    <span style={{ margin: "0 4px" }}>|</span>
                    Motivo: {req.reason}
                    {req.status === "APPROVED" && req.observation && (
                      <span>
                        {" "}
                        <span style={{ margin: "0 4px" }}>|</span> Obs. Aprovação: {req.observation}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function AdminGlobalDiscountControls({
  temDesconto,
  discountLabel,
  requestObservation,
  approvedGlobalObservation,
  onEdit,
  onApply,
}: {
  /** Um desconto fixo pode existir com percentual zerado, por isso e boolean. */
  temDesconto: boolean;
  /** "10%" ou "R$ 1.000,00", conforme o modo do desconto. */
  discountLabel: string;
  requestObservation: string;
  approvedGlobalObservation: string;
  onEdit: () => void;
  onApply: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: "10px" }}>
      {temDesconto ? (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "flex-end" }}>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "14px", fontWeight: "bold", color: "#16a34a" }}>
              Desconto Global Aplicado: {discountLabel}
            </span>
            <div style={{ fontSize: "11px", color: "#666" }}>
              Motivo: {requestObservation || approvedGlobalObservation || "Aplicado pelo gestor"}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onEdit} title="Editar Desconto">
            Editar
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={onApply} style={{ alignSelf: "flex-end" }}>
          Aplicar Desconto Extra
        </Button>
      )}
    </div>
  );
}

function UserGlobalDiscountControls({
  approvedGlobalRequest,
  temDesconto,
  discountLabel,
  approvedGlobalObservation,
  requestedDiscount,
  requestedDiscountLabel,
  requestObservation,
  onCancelPending,
  onOpenRequestModal,
}: {
  approvedGlobalRequest?: ApprovedGlobalRequestLike;
  temDesconto: boolean;
  discountLabel: string;
  approvedGlobalObservation: string;
  requestedDiscount: number;
  requestedDiscountLabel: string;
  requestObservation: string;
  onCancelPending: () => void;
  onOpenRequestModal: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: "10px" }}>
      {approvedGlobalRequest && temDesconto ? (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "flex-end" }}>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "14px", fontWeight: "bold", color: "#16a34a" }}>
              ✓ Desconto Global Aprovado: {discountLabel}
            </span>
            {approvedGlobalObservation && (
              <div style={{ fontSize: "11px", color: "#666" }}>Motivo: {approvedGlobalObservation}</div>
            )}
            {approvedGlobalRequest.approvedBy && (
              <div style={{ fontSize: "11px", color: "#15803d" }}>
                Aprovado por: {approvedGlobalRequest.approvedBy}
              </div>
            )}
          </div>
        </div>
      ) : requestedDiscount > 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "flex-end" }}>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: "14px", fontWeight: "bold", color: "#d97706" }}>
              Solicitação Pendente: {requestedDiscountLabel}
            </span>
            <div style={{ fontSize: "11px", color: "#666" }}>Motivo: {requestObservation}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancelPending} title="Cancelar Solicitação">
            <Trash2 size={16} />
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenRequestModal}
          style={{ alignSelf: "flex-end" }}
        >
          Solicitar Desconto Extra
        </Button>
      )}
    </div>
  );
}

export function DetailedCustomizationsPanel({
  customItems,
  eventCatalog,
}: {
  customItems: SummaryCustomItems | undefined;
  eventCatalog?: BudgetCatalogEvent[];
}) {
  if (!customItems || Object.keys(customItems).length === 0) return null;

  return (
    <div
      style={{
        marginTop: "20px",
        padding: "10px",
        backgroundColor: "#fffbeb",
        borderRadius: "8px",
        border: "1px solid #fcd34d",
      }}
    >
      <h4
        style={{
          fontSize: "14px",
          fontWeight: "bold",
          color: "#92400e",
          marginBottom: "10px",
        }}
      >
        Detalhamento das Personalizações
      </h4>
      {Object.entries(customItems).map(([evtId, data]) => {
        if (!data) return null;
        const evtName = eventCatalog?.find((e) => e.id === evtId)?.title || evtId;
        const added = data.added || [];
        const removedIds = data.removedIds || [];

        if (added.length === 0 && removedIds.length === 0) return null;

        return (
          <div key={evtId} style={{ marginBottom: "10px", fontSize: "13px" }}>
            <div style={{ fontWeight: "600", marginBottom: "4px" }}>{evtName}</div>
            {added.length > 0 && (
              <div style={{ marginBottom: "4px" }}>
                <span style={{ color: "#16a34a", fontWeight: "500" }}>Adicionados:</span>
                <ul style={{ paddingLeft: "20px", margin: 0 }}>
                  {added.map((it, i) => (
                    <li key={i}>
                      {it.quantity}x {it.name}
                      {it.isNoFixedValue ? " (Incluso)" : ` - ${formatCurrency(it.unitPrice ?? 0)}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {removedIds.length > 0 && (
              <div>
                <span style={{ color: "#dc2626", fontWeight: "500" }}>Removidos:</span>
                <ul style={{ paddingLeft: "20px", margin: 0 }}>
                  {removedIds.map((rid, i) => {
                    const originalItem = eventCatalog?.find((e) => e.id === evtId)?.items.find(
                      (it) => it.id === rid,
                    );
                    return <li key={i}>{originalItem?.name || rid}</li>;
                  })}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GlobalDiscountControlsSection(props: {
  isAdmin: boolean;
  temDesconto: boolean;
  discountLabel: string;
  requestObservation: string;
  approvedGlobalObservation: string;
  approvedGlobalRequest?: ApprovedGlobalRequestLike;
  requestedDiscount: number;
  requestedDiscountLabel: string;
  onEditAdminDiscount: () => void;
  onApplyAdminDiscount: () => void;
  onCancelPendingUserRequest: () => void;
  onOpenUserRequestModal: () => void;
}) {
  return (
    <div className={summaryStyles.discountRow}>
      {props.isAdmin ? (
        <AdminGlobalDiscountControls
          temDesconto={props.temDesconto}
          discountLabel={props.discountLabel}
          requestObservation={props.requestObservation}
          approvedGlobalObservation={props.approvedGlobalObservation}
          onEdit={props.onEditAdminDiscount}
          onApply={props.onApplyAdminDiscount}
        />
      ) : (
        <UserGlobalDiscountControls
          approvedGlobalRequest={props.approvedGlobalRequest}
          temDesconto={props.temDesconto}
          discountLabel={props.discountLabel}
          approvedGlobalObservation={props.approvedGlobalObservation}
          requestedDiscount={props.requestedDiscount}
          requestedDiscountLabel={props.requestedDiscountLabel}
          requestObservation={props.requestObservation}
          onCancelPending={props.onCancelPendingUserRequest}
          onOpenRequestModal={props.onOpenUserRequestModal}
        />
      )}
    </div>
  );
}



export function SummaryStep({ onBack, budgetEvents, onBeforeSaveNavigate }: SummaryStepProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { control, register, setValue } = useFormContext();
  const {
    addRequest,
    migrateTempBudget,
    requests: globalRequests,
  } = useDiscountRequestsStore();
  const formValues = useWatch({ control }) as SummaryFormValues;
  const globalDiscountDraft = useSummaryStepGlobalDiscountDraft();
  const {
    requestModalOpen,
    requestedDiscount,
    requestedDiscountMode,
    requestObservation,
    requestedAttachmentName,
    requestedAttachmentFile,
    setRequestedDiscount,
    setRequestedDiscountMode,
    setRequestObservation,
    openRequestModal,
    closeRequestModal,
    resetDraft,
    setDraft,
  } = globalDiscountDraft;
  const createBudgetMutation = useCreateBudgetMutation();

  const budgetId = formValues.id;

  useEffect(() => {
    resetDraft();
  }, [budgetId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!budgetId) return;

    const pendingReq = globalRequests.find(
      (r) => r.budgetId === budgetId && r.status === "PENDING"
    );

    if (!pendingReq) return;

    // Em um pedido de valor fixo o que o consultor digitou foi o valor em
    // reais; reabrir o modal com o percentual equivalente mostraria outro
    // número.
    const modo = resolveDiscountMode(pendingReq.discountMode);
    setRequestedDiscountMode(modo);
    setRequestedDiscount(
      modo === "FIXED"
        ? pendingReq.requestedAmount ?? pendingReq.discountValue
        : pendingReq.discountPercent,
    );
    setRequestObservation(pendingReq.requestObservation || "");
  }, [
    budgetId,
    globalRequests,
    setRequestedDiscount,
    setRequestedDiscountMode,
    setRequestObservation,
  ]);

  const isAdmin =
    user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";

  const { itemRequests } = useDiscountRequestsStore();

  const calculateEventTotal = (event: EventType) =>
    calculateSummaryStepEventTotals(event, formValues, itemRequests);

  const calculateCustomDeficit = (event: EventType) => {
    // Logic for Culto Cortesia and 100 Dias to be displayed as "Deficit"
    // They use Editable Unit Prices in ItemsStep now.
    if (isCanonicalEvent(event.id, "culto_cortesia")) {
      return event.items.reduce((acc: number, item: BudgetItem) => {
        const qty = Number(formValues.items?.[event.id]?.[item.id] || 0);
        // Prices are dynamic for these events in ItemsStep
        const dynamicPrice = Number(
          formValues.items?.[event.id]?.[`${item.id}_price`] || 0,
        );
        return acc + qty * dynamicPrice;
      }, 0);
    }
    return 0;
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalDiscounted = 0;
    let deficit = 0;

    const selectedEventIds = formValues.selectedEvents || [];
    selectedEventIds.forEach((eventId: string) => {
      const event = budgetEvents.find((e) => e.id === eventId);
      if (!event) return;

      if (
        isCanonicalEvent(event.id, "culto_cortesia") ||
        isCanonicalEvent(event.id, "evento_100_dias")
      ) {
        deficit += calculateCustomDeficit(event);
      } else {
        const result = calculateEventTotal(event);
        subtotal += result.total;
        totalDiscounted += result.discountedTotal;
      }
    });
    return { subtotal, totalDiscounted, deficit };
  };

  const { subtotal, totalDiscounted, deficit } = calculateTotals();
  const selectedEvents = orderSelectedEvents(
    budgetEvents.filter((event) =>
      (formValues.selectedEvents || []).includes(event.id),
    ),
    (formValues as { eventOrder?: string[] }).eventOrder,
  );
  const getParticipationQty = (eventId: string) =>
    getParticipationQuantity(formValues as Record<string, unknown>, eventId, 0);
  const autoInstallments = (() => {
    const startRaw = formValues?.eventStartDate as string | undefined;
    const endRaw = formValues?.eventEndDate as string | undefined;
    if (!startRaw || !endRaw) return 12;
    const startDate = new Date(startRaw);
    const endDate = new Date(endRaw);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 12;
    const months =
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth()) +
      1;
    return Math.max(1, months);
  })();
  const installmentsOverride =
    typeof formValues.installmentsOverride === "number"
      ? formValues.installmentsOverride
      : null;
  const effectiveInstallments = installmentsOverride ?? autoInstallments;
  // Mesma regra da impressão: com baile no orçamento o resumo mostra dois
  // totais — até a colação e o acumulado até o baile.
  const summaryBlocks = buildSummaryBlocks({
    events: selectedEvents.map((event) => {
      const participationQty = getParticipationQty(event.id);
      const eventTotal = calculateEventTotal(event).discountedTotal;
      return {
        eventId: event.id,
        title: event.title,
        total: eventTotal,
        valuePerStudent: participationQty > 0 ? eventTotal / participationQty : 0,
        closesSummaryBlock: event.closes_summary_block,
        summaryBlockLabel: event.summary_block_label,
      };
    }),
    installments: effectiveInstallments,
  });
  
  // Custom: If there are item discounts, use totalDiscounted as base for global discount?
  // Or should global discount apply to the ALREADY discounted value?
  // Standard practice: Item discounts reduce the subtotal. Global discount applies to the new subtotal.
  // So 'subtotal' for global discount checks should be 'totalDiscounted'.
  
  // Desconto global: pode vir do formulário (admin aplicou direto) ou de uma solicitação aprovada no store
  const approvedGlobalRequest = budgetId
    ? globalRequests.find(
        (r) => r.budgetId === budgetId && r.status === "APPROVED"
      )
    : undefined;

  const discountPercentFromForm = formValues.discountPercent || 0;
  const discountAmountFromForm = formValues.discountAmount || 0;
  const temDescontoNoForm = discountPercentFromForm > 0 || discountAmountFromForm > 0;

  // Usa o do store se o formulário não tiver valor (desconto aprovado externamente)
  const globalDiscountSource = temDescontoNoForm
    ? {
        discountPercent: discountPercentFromForm,
        discountMode: formValues.discountMode,
        discountAmount: discountAmountFromForm,
      }
    : {
        discountPercent: approvedGlobalRequest?.discountPercent || 0,
        discountMode: approvedGlobalRequest?.discountMode,
        discountAmount:
          approvedGlobalRequest?.requestedAmount ?? approvedGlobalRequest?.discountValue,
      };

  const discountPercent = globalDiscountSource.discountPercent || 0;
  const globalDiscountMode = resolveDiscountMode(globalDiscountSource.discountMode);
  const globalDiscountAmount = globalDiscountSource.discountAmount || 0;

  const approvedGlobalObservation =
    approvedGlobalRequest?.requestObservation ||
    approvedGlobalRequest?.observation ||
    "";

  const discountValue = resolveGlobalDiscountValue(totalDiscounted, globalDiscountSource);
  const totalFinal = totalDiscounted - discountValue;
  // Um desconto fixo existe mesmo com percentual 0 (orçamento sem base na hora
  // em que foi salvo), por isso as linhas abaixo olham o valor, não o percentual.
  const temDescontoGlobal = discountValue > 0 || discountPercent > 0;
  const globalDiscountLabel = formatAppliedDiscount(globalDiscountSource);

  // Descontos de item aprovados a persistir na versão: herda os já aprovados
  // do orçamento e soma os aplicados direto pelo gestor nesta sessão (APPROVED).
  const workingBudgetId = formValues.id || "temp-budget";
  const budgetSalvo = formValues.id
    ? useBudgetStore.getState().getBudgetById(formValues.id)
    : undefined;
  const approvedItemDiscounts: Record<string, number> = {
    ...(budgetSalvo?.approvedItemDiscounts ?? {}),
  };
  // Mapa irmao com o valor em reais: e ele que manda no calculo quando o
  // desconto do item foi pedido em reais, para nao escalar com a quantidade.
  const approvedItemDiscountAmounts: Record<string, number> = {
    ...(budgetSalvo?.approvedItemDiscountAmounts ?? {}),
  };
  (itemRequests[workingBudgetId] ?? []).forEach((r) => {
    if (r.status !== "APPROVED") return;
    const chave = `${r.eventId}-${r.itemId}`;
    const pedido = resolveItemDiscountInput(r);
    approvedItemDiscounts[chave] = r.newDiscountPercent ?? r.requestedPercentage;
    approvedItemDiscountAmounts[chave] = pedido.mode === "FIXED" ? pedido.value : 0;
  });

  const { handleFinish } = useSummaryStepSaveFlow({
    formValues,
    userName: user?.name,
    isAdmin,
    subtotal,
    totalFinal,
    deficit,
    requestedDiscount,
    requestedDiscountMode,
    requestObservation,
    requestedAttachmentName,
    requestedAttachmentFile,
    approvedItemDiscounts,
    approvedItemDiscountAmounts,
    globalRequests,
    getBudgetById: useBudgetStore.getState().getBudgetById,
    createBudget: (data) => createBudgetMutation.mutateAsync(data),
    addRequest,
    migrateTempBudget,
    onSavedNavigate: () => {
      onBeforeSaveNavigate?.();
      navigate("/budgets");
    },
    allBudgets: useBudgetStore.getState().budgets,
  });


  const currentStatus = useWatch({ control, name: "status" }) || "PENDING";
  const currentBudgetId = formValues.id || "temp-budget";
  const visibleItemRequests = Object.values(itemRequests[currentBudgetId] || []).filter(
    (r) => r.status === "PENDING" || r.status === "APPROVED",
  );
  const approvedItemDiscountDetails = buildApprovedItemDiscountDetails(
    formValues,
    budgetEvents,
    visibleItemRequests.filter((r) => r.status === "APPROVED"),
  );

  return (
    <div className={styles.container}>
      <h2 className={styles.sectionTitle}>Resumo do Orçamento</h2>

      <div className={summaryStyles.card}>
        {/* Status Selector */}
        <div className={summaryStyles.row} style={{ marginBottom: "20px" }}>
          <div style={{ width: "100%" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
              }}
            >
              Status Inicial
            </label>
            <select
              {...register("status")}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface)",
                fontSize: "14px",
              }}
            >
              <option value="PENDING">Pendente</option>
              {isAdmin && <option value="APPROVED">Aprovado</option>}
              <option value="CANCELLED">Cancelado</option>
            </select>
          </div>
        </div>

        {/* Observation field */}
        <div className={summaryStyles.row} style={{ marginBottom: "20px" }}>
          <div style={{ width: "100%" }}>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--color-text-secondary)",
              }}
            >
              Observação{currentStatus === "CANCELLED" && " (Motivo do Cancelamento — obrigatório)"}
            </label>
            <textarea
              {...register("observation")}
              placeholder={
                currentStatus === "CANCELLED"
                  ? "Informe o motivo do cancelamento..."
                  : "Alguma observação sobre o orçamento..."
              }
              rows={3}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "var(--radius-md)",
                border: currentStatus === "CANCELLED" ? "1px solid #f87171" : "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface)",
                fontSize: "14px",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>

        {/* Existing Summary Content */}
        <div className={summaryStyles.divider} />

        {/* Event Summary Table */}
        <EventDetailsTable
          formValues={formValues}
          eventCatalog={budgetEvents}
          calculateEventTotal={calculateEventTotal}
        />

        {selectedEvents.length > 0 && (
          <div
            style={{
              margin: "0 0 24px",
              border: "1px solid var(--color-border)",
              borderRadius: "12px",
              overflow: "hidden",
              background: "var(--color-surface)",
            }}
          >
            <div
              style={{
                background: "var(--color-bg-tertiary)",
                padding: "14px 20px",
                borderBottom: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "var(--color-text-main)",
                }}
              >
                Resumo Final · Condições de Pagamento
              </h3>
            </div>

            <div style={{ padding: "20px" }}>
              <div style={{ marginBottom: "16px" }}>
                {selectedEvents.map((event) => {
                  const eventTotal = calculateEventTotal(event).discountedTotal;
                  const participationQty = getParticipationQty(event.id);
                  const valuePerStudent =
                    participationQty > 0 ? eventTotal / participationQty : 0;

                  return (
                    <div
                      key={event.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "7px 0",
                        borderBottom: "1px solid var(--color-border)",
                        fontSize: "13px",
                      }}
                    >
                      <span style={{ color: "var(--color-text-secondary)" }}>
                        {event.title}
                      </span>
                      <span style={{ fontWeight: 500 }}>
                        {formatCurrency(valuePerStudent)} / formando
                      </span>
                    </div>
                  );
                })}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                  marginTop: "16px",
                  padding: "16px",
                  background: "var(--color-bg-tertiary)",
                  borderRadius: "8px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--color-text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: "8px",
                    }}
                  >
                    NÚMERO DE PARCELAS
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input
                      type="number"
                      min={1}
                      value={effectiveInstallments}
                      onChange={(event) => {
                        const value = parseInt(event.target.value, 10);
                        setValue(
                          "installmentsOverride",
                          isNaN(value) || value < 1 ? 1 : value,
                          { shouldDirty: true, shouldValidate: false },
                        );
                      }}
                      style={{
                        width: "80px",
                        padding: "7px 10px",
                        border: "1px solid var(--color-border)",
                        borderRadius: "6px",
                        fontSize: "15px",
                        fontWeight: 700,
                        textAlign: "center",
                        background: "var(--color-surface)",
                        color: "var(--color-text-main)",
                      }}
                    />
                    {installmentsOverride !== null ? (
                      <button
                        type="button"
                        onClick={() =>
                          setValue("installmentsOverride", null, {
                            shouldDirty: true,
                            shouldValidate: false,
                          })
                        }
                        style={{
                          fontSize: "12px",
                          color: "var(--color-primary)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 0,
                          textDecoration: "underline",
                        }}
                      >
                        Redefinir para automático ({autoInstallments}x)
                      </button>
                    ) : (
                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        calculado automaticamente das datas
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--color-text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginBottom: "4px",
                    }}
                  >
                    VALOR DA PARCELA
                  </div>
                  <div
                    style={{
                      fontSize: "22px",
                      fontWeight: 800,
                      color: "var(--color-primary)",
                    }}
                  >
                    {/* O orçamento inteiro, não um quadro isolado. */}
                    {formatCurrency(
                      effectiveInstallments > 0
                        ? sumSummaryBlocks(summaryBlocks).totalPerStudent /
                            effectiveInstallments
                        : 0,
                    )}
                  </div>
                </div>
              </div>

              {/* Valor cheio do orçamento, acima do resumo de pagamento. */}
              <div style={{ marginTop: "20px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                  Valor total do orçamento
                </div>
                <BudgetTotalsSummary blocks={summaryBlocks} />
              </div>

              {/* As MESMAS linhas do resumo da impressão. */}
              <div style={{ marginTop: "20px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                  Resumo final · condições de pagamento
                </div>
                <BudgetPaymentSummary
                  blocks={summaryBlocks}
                  installments={effectiveInstallments}
                />
              </div>
            </div>
          </div>
        )}

        <div
          className={summaryStyles.row}
          style={{
            flexDirection: "column",
            gap: "10px",
            alignItems: "flex-start",
            marginBottom: "20px",
          }}
        >
          {/* Detailed Customizations Table */}
          <DetailedCustomizationsPanel
            customItems={formValues.customItems as SummaryCustomItems | undefined}
            eventCatalog={budgetEvents}
          />

          {/* Detailed Discounts Table */}
          <ItemDiscountRequestsPanel
            requests={visibleItemRequests}
            eventCatalog={budgetEvents}
          />
        </div>

        <div className={summaryStyles.divider} />
        <SummaryMoneyLine label="Subtotal (Eventos Pagos)" value={subtotal} />

        {/* Item Discounts Row */}
        <ApprovedItemDiscountsRow
          details={approvedItemDiscountDetails}
        />

        <GlobalDiscountControlsSection
          isAdmin={isAdmin}
          temDesconto={temDescontoGlobal}
          discountLabel={globalDiscountLabel}
          requestObservation={requestObservation}
          approvedGlobalObservation={approvedGlobalObservation}
          approvedGlobalRequest={approvedGlobalRequest}
          requestedDiscount={requestedDiscount}
          requestedDiscountLabel={formatDiscountInput({
            mode: requestedDiscountMode,
            value: requestedDiscount,
          })}
          onEditAdminDiscount={() => {
            setDraft(
              globalDiscountMode === "FIXED" ? globalDiscountAmount : discountPercent,
              requestObservation || "Aplicado pelo gestor",
              undefined,
              globalDiscountMode,
            );
            openRequestModal();
          }}
          onApplyAdminDiscount={() => {
            resetDraft();
            openRequestModal();
          }}
          onCancelPendingUserRequest={() => {
            resetDraft();
          }}
          onOpenUserRequestModal={openRequestModal}
        />

        <div className={summaryStyles.divider} />

        {temDescontoGlobal && (
          <SummaryMoneyLine
            className={summaryStyles.row}
            style={{ color: "#dc2626" }}
            label={`Desconto Global Aplicado (${globalDiscountLabel})`}
            value={discountValue}
            prefix="- "
          />
        )}

        <SummaryMoneyLine
          className={summaryStyles.totalRow}
          label="Total Final (Cliente)"
          value={totalFinal}
        />

        {deficit > 0 && (
          <>
            <div
              className={summaryStyles.divider}
              style={{ marginTop: "20px" }}
            />
            <SummaryMoneyLine
              className={summaryStyles.row}
              style={{ color: "#d9534f", marginTop: "10px" }}
              label="Déficit / Custos Cortesia"
              value={deficit}
            />
          </>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.buttons}>
          <Button
            variant="outline"
            onClick={onBack}
            disabled={createBudgetMutation.isPending}
          >
            Voltar
          </Button>
          <Button
            onClick={() => void handleFinish()}
            isLoading={createBudgetMutation.isPending}
          >
            {formValues.id && formValues.id !== "temp-budget" ? "Salvar Alterações" : "Criar Orçamento"}
          </Button>
        </div>
      </div>

      <SummaryStepDiscountModal
        isOpen={requestModalOpen}
        onClose={closeRequestModal}
        onConfirm={(valor, obs, attachment, modo) => {
          setDraft(valor, obs, attachment, modo);
          if (isAdmin) {
            // Gestor aplica na hora: o total da tela já sai com o desconto.
            // Guarda o percentual equivalente também, porque é com ele que o
            // restante do sistema (motor, relatórios) trabalha.
            const { percent, amount } = resolveDiscountAmounts(totalDiscounted, {
              mode: modo,
              value: valor,
            });
            setValue("discountPercent", percent);
            setValue("discountMode", modo);
            setValue("discountAmount", modo === "FIXED" ? amount : 0);
          }
          closeRequestModal();
        }}
        onRemove={() => {
          resetDraft();
          if (isAdmin) {
            setValue("discountPercent", 0);
            setValue("discountMode", DEFAULT_DISCOUNT_MODE);
            setValue("discountAmount", 0);
          }
          closeRequestModal();
        }}
        totalValue={totalDiscounted}
        isAdmin={isAdmin}
        isEditing={!!requestedDiscount || (isAdmin && temDescontoGlobal)}
        initialMode={requestedDiscount ? requestedDiscountMode : globalDiscountMode}
        initialPercent={requestedDiscount || (isAdmin ? discountPercent : 0)}
        initialAmount={requestedDiscount || (isAdmin ? globalDiscountAmount : 0)}
        initialReason={requestObservation}
      />
    </div>
  );

}
