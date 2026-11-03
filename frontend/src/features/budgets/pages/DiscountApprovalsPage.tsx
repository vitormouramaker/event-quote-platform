
import { useState, useEffect } from "react";
import { useDiscountRequestsStore, type DiscountRequest, type ItemDiscountRequest, type EditRequest } from "../../../store/DiscountRequestsStore";
import { useAuthStore } from "../../../store/authStore";
import { useBudgetStore, type Budget } from "../../../store/budgetStore";
import { Button } from "../../../components/Button/Button";
import { EmptyStatePanel, ErrorStatePanel, LoadingStatePanel } from "../../../components/AsyncState/AsyncState";
import { ModalShell } from "../../../components/ModalShell/ModalShell";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { Input } from "../../../components/Input/Input";
import { Check, X, Clock, History, ChevronDown, ChevronUp, AlertCircle, FileEdit, Paperclip, Send, Eye, Building2 } from "lucide-react";
import { resolveAttachmentUrl, budgetsApi } from "../../../services/api";
import { mapBudget } from "../../../store/budgetStore";
import type { SummaryFormValues, SummaryCustomItems } from "../components/steps/SummaryStep.types";
import { DetailedCustomizationsPanel, ApprovedItemDiscountsRow } from "../components/steps/SummaryStep";
import {
  mascaraPercentual,
  mascaraReais,
  textoDoValor,
} from "../components/DiscountInputField";
import {
  formatAppliedDiscount,
  formatDiscountInput,
  resolveDiscountAmounts,
  resolveDiscountMode,
  resolveGlobalDiscountValue,
  resolveItemDiscountInput,
  type DiscountMode,
} from "../domain/discountInput";
import { calculateSummaryStepEventTotals } from "../domain/eventCalculations";
import { VenueDiscountApprovals } from "../../venueProposals/components/VenueDiscountApprovals";
import {
  usePendingVenueApprovals,
  usePendingVenueDiscounts,
} from "../../venueProposals/queries/useVenueProposalQueries";
import {
  buildApprovedItemDiscountDetails,
  buildApprovedItemRequestsFromDiscountMap,
  getAppliedItemDiscountPercentage,
} from "../domain/itemDiscountDetails";
import { getParticipationQuantity } from "../data/runtimeBudgetRules";
import { EVENT_TYPES, type EventType } from "../data/mockData";
import { toast } from "sonner";
import { useDiscountApprovalsDataQuery } from "../queries/useDiscountApprovalsDataQuery";
import { useUpdateBudgetMutation, useUpdateBudgetStatusMutation } from "../mutations/useBudgetMutations";
import { useUpdateEditRequestStatusMutation } from "../mutations/useEditRequestMutations";
import { useUpdateDiscountRequestStatusMutation } from "../mutations/useDiscountRequestMutations";
import { runEditApprovalFlow } from "./discountApprovalsEditFlow";
import approvalStyles from "../styles/DiscountApprovalsPage.module.css";

type TabType = "discounts" | "edits" | "budget_approvals" | "venue" | "history";

// Normalized Interface for UI
interface DisplayRequest {
    id: string;
    type: "GLOBAL" | "ITEM";
    budgetId?: string;
    eventId?: string; // Added field
    itemId?: string;
    itemName?: string;
    clientName: string;
    requestedBy: string;
    requestedAt: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
    
    originalValue: number;
    discountPercent: number;
    discountValue: number;
    finalValue: number;

    /** "FIXED" quando o desconto foi pedido em reais. */
    discountMode: DiscountMode;
    /** O que foi pedido, na unidade em que foi pedido (% ou R$). */
    requestedValue: number;
    
    originalDiscountPercent?: number; // Previous/Original before edit
    
    requestObservation: string; // reason
    observation?: string; // approval note
    approvedBy?: string;
    approvedAt?: string;
    attachmentName?: string;
    attachmentUrl?: string;
}

interface BudgetGroup {
    budgetId: string;
    clientName: string;
    requests: DisplayRequest[];
    totalDiscountValue: number; // Sum of requested discounts
}

type RequestActionHandler = (req: DisplayRequest) => void;

export function DiscountApprovalsPage() {
  const { user } = useAuthStore();
  const { updateItemRequestStatus } = useDiscountRequestsStore();
  const { getBudgetById, fetchBudgets, budgets: allBudgets } = useBudgetStore();
  const { data: approvalsData, isLoading, isError, error, refetch } = useDiscountApprovalsDataQuery();
  const updateBudgetMutation = useUpdateBudgetMutation();
  const updateBudgetStatusMutation = useUpdateBudgetStatusMutation();
  const updateEditRequestStatusMutation = useUpdateEditRequestStatusMutation();
  const updateDiscountRequestStatusMutation = useUpdateDiscountRequestStatusMutation();
  const discountRequests = approvalsData?.requests ?? [];
  const editRequests = approvalsData?.editRequests ?? [];

  // Buscar dados ao montar
  useEffect(() => {
    void fetchBudgets();
  }, [fetchBudgets]);

  const [activeTab, setActiveTab] = useState<TabType>("discounts");
  const [selectedRequest, setSelectedRequest] = useState<DisplayRequest | null>(null);
  const [actionType, setActionType] = useState<"APPROVE" | "REJECT" | null>(null);

  // Edit Request action state
  const [selectedEditRequest, setSelectedEditRequest] = useState<EditRequest | null>(null);
  const [editActionType, setEditActionType] = useState<"APPROVE" | "REJECT" | null>(null);
  const [editObservation, setEditObservation] = useState("");

  // Budget Approval state
  const [selectedBudgetForApproval, setSelectedBudgetForApproval] = useState<Budget | null>(null);
  const [budgetApprovalAction, setBudgetApprovalAction] = useState<"APPROVE" | "RETURN" | null>(null);
  const [budgetApprovalObservation, setBudgetApprovalObservation] = useState("");

  // Budget Preview state
  const [previewBudget, setPreviewBudget] = useState<Budget | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Action State
  const [observation, setObservation] = useState("");
  // O gestor edita na unidade em que o desconto foi pedido: percentual num
  // pedido percentual, reais num pedido de valor fixo.
  const [editDiscountValue, setEditDiscountValue] = useState<number>(0);
  // O texto do campo anda junto do numero: zero e campo VAZIO, e o valor fixo
  // aparece com a mascara de real enquanto se digita.
  const [editDiscountText, setEditDiscountText] = useState("");

  // Propostas de locacao esperando decisao: a aba propria da fila. O contador
  // soma as duas pendencias da locacao — desconto pedido e proposta enviada —
  // senao a aba fica sem aviso enquanto o menu lateral mostra pendencia.
  const pendingVenueDiscounts = usePendingVenueDiscounts();
  const pendingVenueApprovals = usePendingVenueApprovals();
  const pendingVenue = pendingVenueDiscounts.length + pendingVenueApprovals.length;

  const isAdminByRole = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";
  const canApproveDiscounts = isAdminByRole || user?.perm_approve_discounts === true;
  const canApproveEdits = isAdminByRole || user?.perm_approve_edit_requests === true;
  const userName = user?.name || "";

  // Normalization Helper
  const normalizeRequest = (req: DiscountRequest | ItemDiscountRequest): DisplayRequest => {
      if ('itemId' in req) {
          // `originalUnitPrice` guarda o valor do item na hora do pedido: e a
          // base sobre a qual um desconto em reais vira percentual.
          const pedido = resolveItemDiscountInput(req);
          const appliedPercent = getAppliedItemDiscountPercentage(
              req,
              req.originalUnitPrice,
          );
          // Item Request
          return {
              id: req.id,
              type: "ITEM",
              budgetId: req.budgetId,
              eventId: req.eventId, // Map eventId
              itemId: req.itemId,
              itemName: req.itemName,
              clientName: req.clientName,
              requestedBy: req.requestedBy,
              requestedAt: req.requestedAt,
              status: req.status,
              originalValue: req.originalUnitPrice,
              discountPercent: appliedPercent,
              discountValue: req.originalUnitPrice * (appliedPercent / 100),
              finalValue: req.originalUnitPrice * (1 - appliedPercent / 100),
              discountMode: pedido.mode,
              requestedValue: pedido.value,
              requestObservation: req.reason,
              observation: req.observation,
              approvedBy: req.approvedBy,
              approvedAt: req.approvedAt,
              attachmentName: req.attachmentName,
              attachmentUrl: req.attachmentUrl,
          };
      } else {
          // Global Request
          return {
              id: req.id,
              type: "GLOBAL",
              budgetId: req.budgetId,
              clientName: req.clientName,
              requestedBy: req.requestedBy,
              requestedAt: req.requestedAt,
              status: req.status,
              originalValue: req.totalValue,
              discountPercent: req.discountPercent,
              discountValue: req.discountValue,
              finalValue: req.finalValue,
              discountMode: resolveDiscountMode(req.discountMode),
              requestedValue:
                  resolveDiscountMode(req.discountMode) === "FIXED"
                      ? req.newDiscountValue ?? req.requestedAmount ?? req.discountValue
                      : req.discountPercent,
              originalDiscountPercent: req.originalDiscountPercent,
              requestObservation: req.requestObservation,
              observation: req.observation,
              approvedBy: req.approvedBy,
              approvedAt: req.approvedAt,
              attachmentName: req.attachmentName,
              attachmentUrl: req.attachmentUrl,
          };
      }
  };

  const groupRequests = (requests: DisplayRequest[]): BudgetGroup[] => {
      const groups: Record<string, BudgetGroup> = {};
      
      requests.forEach(req => {
          // GROUPING STRATEGY:
          // We use `budgetId` as the primary grouping key.
          // This ensures that different budgets for the same client (e.g. "Medicina" vs "Direito" for "Vitor") are separated.
          // If `budgetId` is missing (legacy data), we fallback to `clientName`.
          // If `budgetId` is 'temp-budget', we assume it's a draft and might group by clientName to avoid merging distinct drafts if possible, 
          // or just group all temp drafts together (limitation of no unique ID for drafts).
          
          let uniqueKey = req.budgetId || req.clientName;
          
          if (req.budgetId === 'temp-budget') {
             // For temp budgets, try to differentiate by clientName
             uniqueKey = `temp_${req.clientName}`;
          }

          if (!groups[uniqueKey]) {
              groups[uniqueKey] = {
                  budgetId: req.budgetId || 'unknown',
                  clientName: req.clientName, // This should now be the detailed title from SummaryStep
                  requests: [],
                  totalDiscountValue: 0
              };
          }
          groups[uniqueKey].requests.push(req);
          groups[uniqueKey].totalDiscountValue += req.discountValue;
      });

      return Object.values(groups);
  };

  const globalPending = discountRequests.filter((r) => r.status === "PENDING");
  const globalHistory = discountRequests.filter((r) => r.status !== "PENDING");
  // Item requests vêm do backend (query) — não do store volátil. Assim só
  // aparecem aqui depois de salvas (amarradas a uma versão do orçamento).
  const localItemRequests = approvalsData?.itemRequests ?? [];
  const itemPending = localItemRequests.filter((r) => r.status === "PENDING");
  const itemHistory = localItemRequests.filter((r) => r.status !== "PENDING");

  const allPending = [...globalPending, ...itemPending].map(normalizeRequest);
  const allHistory = [...globalHistory, ...itemHistory].map(normalizeRequest);

  const pendingRequests = canApproveDiscounts
    ? allPending
    : allPending.filter(req => req.requestedBy === userName);

  const historyRequests = canApproveDiscounts
    ? allHistory
    : allHistory.filter(req => req.requestedBy === userName);

  const pendingGroups = groupRequests(pendingRequests);
  const historyGroups = groupRequests(historyRequests);

  // Edit Requests
  const pendingEdits = editRequests.filter((r) =>
    canApproveEdits ? r.status === "PENDING" : r.requestedBy === userName && r.status === "PENDING"
  );
  const historyEdits = editRequests.filter((r) =>
    canApproveEdits ? r.status !== "PENDING" : r.requestedBy === userName && r.status !== "PENDING"
  );

  // Orçamentos aguardando aprovação (SENT_FOR_APPROVAL)
  const budgetsPendingApproval = allBudgets.filter((b) => {
    if (b.status !== "SENT_FOR_APPROVAL") return false;
    if (isAdminByRole) return true;
    return (b.createdByName || b.createdBy) === userName;
  });

  // Orçamentos aprovados/cancelados para o histórico
  const budgetsHistory = allBudgets.filter((b) => {
    if (b.status !== "APPROVED" && b.status !== "CANCELLED") return false;
    if (isAdminByRole) return true;
    return (b.createdByName || b.createdBy) === userName;
  });

  const handlePreviewBudget = async (budget: Budget) => {
    setIsLoadingPreview(true);
    try {
      const res = await budgetsApi.getById(budget.id);
      if (res.ok && res.data) {
        setPreviewBudget(mapBudget(res.data));
      } else {
        setPreviewBudget(budget);
      }
    } catch {
      setPreviewBudget(budget);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSubmitBudgetApproval = () => {
    if (!selectedBudgetForApproval || !budgetApprovalAction) return;
    if (budgetApprovalAction === "RETURN" && !budgetApprovalObservation.trim()) {
      toast.error("Informe o motivo da devolução.");
      return;
    }
    const nextStatus = budgetApprovalAction === "APPROVE" ? "APPROVED" : "PENDING";
    updateBudgetStatusMutation.mutate(
      { id: selectedBudgetForApproval.id, status: nextStatus },
      {
        onSuccess: () => {
          toast.success(budgetApprovalAction === "APPROVE" ? "Orçamento aprovado!" : "Orçamento devolvido para pendente.");
          setSelectedBudgetForApproval(null);
          setBudgetApprovalAction(null);
          setBudgetApprovalObservation("");
        },
      }
    );
  };

  const handleSubmitEditAction = () => {
    runEditApprovalFlow({
      selectedEditRequest,
      editActionType,
      editObservation,
      submitEditRequestStatus: ({ id, status, observation }) =>
        updateEditRequestStatusMutation.mutate({ id, status, observation }),
      unlockBudget: (budgetId) =>
        updateBudgetMutation.mutate({ id: budgetId, updates: { isLocked: false } }),
      resetDialog: () => {
        setSelectedEditRequest(null);
        setEditActionType(null);
        setEditObservation("");
      },
    });
  };

  const handleOpenAction = (req: DisplayRequest, type: "APPROVE" | "REJECT") => {
    setSelectedRequest(req);
    setActionType(type);
    setEditDiscountValue(req.requestedValue);
    setEditDiscountText(textoDoValor(req.requestedValue, req.discountMode));
    setObservation("");
  };

  const handleCloseAction = () => {
    setSelectedRequest(null);
    setActionType(null);
    setObservation("");
    setEditDiscountValue(0);
    setEditDiscountText("");
  };

  const handleSubmitAction = () => {
    if (!selectedRequest || !actionType) return;

    if (!observation.trim()) {
        toast.error("É obrigatório informar uma observação.");
        return;
    }

    // O que o gestor aprovou, nas duas unidades: o percentual alimenta o
    // calculo e os relatorios; o valor em reais e o que foi de fato decidido
    // quando o pedido veio em reais.
    const aprovado = resolveDiscountAmounts(selectedRequest.originalValue, {
        mode: selectedRequest.discountMode,
        value: editDiscountValue,
    });
    const aprovadoEmReais = selectedRequest.discountMode === "FIXED";

    if (actionType === "APPROVE") {
        if (selectedRequest.type === "ITEM" && selectedRequest.budgetId && selectedRequest.eventId && selectedRequest.itemId) {
            void updateItemRequestStatus(
                selectedRequest.budgetId,
                selectedRequest.eventId,
                selectedRequest.itemId,
                "APPROVED",
                {
                    approvedBy: user?.name || "Admin",
                    observation,
                    newDiscountPercent: aprovado.percent,
                    newDiscountAmount: aprovadoEmReais ? aprovado.amount : undefined,
                }
            );
        } else {
            updateDiscountRequestStatusMutation.mutate({
                id: selectedRequest.id,
                status: "APPROVED",
                observation,
                newDiscountPercent: aprovado.percent,
                newDiscountValue: aprovadoEmReais ? aprovado.amount : undefined,
            });
        }
        
        // Update Actual Budget
        if (selectedRequest.budgetId) {
            const currentBudget = getBudgetById(selectedRequest.budgetId);
            if (currentBudget) {
                if (selectedRequest.type === "ITEM") {
                    // Update Item Discount Map
                    const chave = `${selectedRequest.eventId}-${selectedRequest.itemId}`;
                    const newItemDiscounts = {
                        ...(currentBudget.approvedItemDiscounts || {}),
                        [chave]: aprovado.percent
                    };
                    // O valor em reais fica no mapa irmao: e ele que manda no
                    // calculo quando o desconto foi pedido em reais, para o
                    // desconto nao mudar se a quantidade do item mudar depois.
                    const newItemAmounts = {
                        ...(currentBudget.approvedItemDiscountAmounts || {}),
                        [chave]: aprovadoEmReais ? aprovado.amount : 0
                    };

                    updateBudgetMutation.mutate({ id: selectedRequest.budgetId, updates: {
                        approvedItemDiscounts: newItemDiscounts,
                        approvedItemDiscountAmounts: newItemAmounts
                    } });
                    
                    // Note: Global Discount VALUE might need update if based on %?
                    // But budget only stores global PERCENT. 
                    // The DISPLAY value is calculated on the fly in SummaryStep.
                    // So just updating the item discount MAP is enough for the budget data.
                } else {
                    // Global Request
                    updateBudgetMutation.mutate({ id: selectedRequest.budgetId, updates: {
                        discountPercent: aprovado.percent,
                        discountMode: selectedRequest.discountMode,
                        discountAmount: aprovadoEmReais ? aprovado.amount : 0
                    } });
                }
            }
        }
        toast.success("Solicitação aprovada e orçamento atualizado!");
    } else {
        if (selectedRequest.type === "ITEM" && selectedRequest.budgetId && selectedRequest.eventId && selectedRequest.itemId) {
            void updateItemRequestStatus(
                selectedRequest.budgetId,
                selectedRequest.eventId,
                selectedRequest.itemId,
                "REJECTED",
                {
                    approvedBy: user?.name || "Admin",
                    observation
                }
            );
        } else {
            updateDiscountRequestStatusMutation.mutate({
                id: selectedRequest.id,
                status: "REJECTED",
                observation
            });
        }
        toast.success("Solicitação rejeitada.");
    }
    handleCloseAction();
  };

  // Helper to Calculate New Values Live in Modal
  const calculatePreviewValues = () => {
      if (!selectedRequest) return { discountVal: 0, finalVal: 0 };
      const { amount } = resolveDiscountAmounts(selectedRequest.originalValue, {
          mode: selectedRequest.discountMode,
          value: editDiscountValue,
      });
      const discountVal = Math.min(amount, Math.max(selectedRequest.originalValue, 0));
      return {
          discountVal,
          finalVal: Math.max(selectedRequest.originalValue - discountVal, 0),
      };
  };

  return (
    <div className={approvalStyles.page} style={{  width: "100%" }}>
      <header className={approvalStyles.pageHeader} style={{ marginBottom: "2rem" }}>
        <h2 className={approvalStyles.pageTitle} style={{ fontSize: "1.875rem", fontWeight: "700", color: "var(--color-text-main)", marginBottom: "0.5rem" }}>
            Central de Aprovações
        </h2>
        <p className={approvalStyles.pageSubtitle} style={{ color: "var(--color-text-secondary)" }}>
            Gerencie as solicitações de desconto dos orçamentos e itens.
        </p>
      </header>

      {/* TABS */}
      <div className={approvalStyles.tabsRow} style={{ display: "flex", gap: "1rem", marginBottom: "2rem", borderBottom: "1px solid var(--color-border)" }}>
        <button
            onClick={() => setActiveTab("discounts")}
            className={`${approvalStyles.tabButton} ${activeTab === "discounts" ? approvalStyles.tabButtonActive : ""}`}
            style={{
                padding: "0.75rem 1.5rem",
                background: "transparent", border: "none",
                borderBottom: activeTab === "discounts" ? "2px solid var(--color-primary)" : "2px solid transparent",
                color: activeTab === "discounts" ? "var(--color-primary)" : "var(--color-text-secondary)",
                fontWeight: "600", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "0.5rem"
            }}
        >
            <Clock size={18} /> Descontos
            {pendingRequests.length > 0 && (
              <span style={{
                minWidth: "20px", height: "20px", padding: "0 6px",
                borderRadius: "10px",
                backgroundColor: activeTab === "discounts" ? "var(--color-primary)" : "#ef4444",
                color: "white", fontSize: "11px", fontWeight: "700",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                {pendingRequests.length > 99 ? "99+" : pendingRequests.length}
              </span>
            )}
        </button>
        <button
            onClick={() => setActiveTab("edits")}
            className={`${approvalStyles.tabButton} ${activeTab === "edits" ? approvalStyles.tabButtonActive : ""}`}
            style={{
                padding: "0.75rem 1.5rem",
                background: "transparent", border: "none",
                borderBottom: activeTab === "edits" ? "2px solid var(--color-primary)" : "2px solid transparent",
                color: activeTab === "edits" ? "var(--color-primary)" : "var(--color-text-secondary)",
                fontWeight: "600", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "0.5rem"
            }}
        >
            <FileEdit size={18} /> Edições
            {pendingEdits.length > 0 && (
              <span style={{
                minWidth: "20px", height: "20px", padding: "0 6px",
                borderRadius: "10px",
                backgroundColor: activeTab === "edits" ? "var(--color-primary)" : "#ef4444",
                color: "white", fontSize: "11px", fontWeight: "700",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                {pendingEdits.length > 99 ? "99+" : pendingEdits.length}
              </span>
            )}
        </button>
        <button
            onClick={() => setActiveTab("budget_approvals")}
            className={`${approvalStyles.tabButton} ${activeTab === "budget_approvals" ? approvalStyles.tabButtonActive : ""}`}
            style={{
                padding: "0.75rem 1.5rem",
                background: "transparent", border: "none",
                borderBottom: activeTab === "budget_approvals" ? "2px solid var(--color-primary)" : "2px solid transparent",
                color: activeTab === "budget_approvals" ? "var(--color-primary)" : "var(--color-text-secondary)",
                fontWeight: "600", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "0.5rem"
            }}
        >
            <Send size={18} /> Orçamentos
            {isAdminByRole && budgetsPendingApproval.length > 0 && (
              <span style={{
                minWidth: "20px", height: "20px", padding: "0 6px",
                borderRadius: "10px",
                backgroundColor: activeTab === "budget_approvals" ? "var(--color-primary)" : "#ef4444",
                color: "white", fontSize: "11px", fontWeight: "700",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                {budgetsPendingApproval.length > 99 ? "99+" : budgetsPendingApproval.length}
              </span>
            )}
        </button>
        <button
            onClick={() => setActiveTab("venue")}
            className={`${approvalStyles.tabButton} ${activeTab === "venue" ? approvalStyles.tabButtonActive : ""}`}
            style={{
                padding: "0.75rem 1.5rem",
                background: "transparent", border: "none",
                borderBottom: activeTab === "venue" ? "2px solid var(--color-primary)" : "2px solid transparent",
                color: activeTab === "venue" ? "var(--color-primary)" : "var(--color-text-secondary)",
                fontWeight: "600", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "0.5rem"
            }}
        >
            <Building2 size={18} /> Locação
            {pendingVenue > 0 && (
              <span style={{
                minWidth: "20px", height: "20px", padding: "0 6px",
                borderRadius: "10px",
                backgroundColor: activeTab === "venue" ? "var(--color-primary)" : "#ef4444",
                color: "white", fontSize: "11px", fontWeight: "700",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                {pendingVenue > 99 ? "99+" : pendingVenue}
              </span>
            )}
        </button>
        <button
            onClick={() => setActiveTab("history")}
            className={`${approvalStyles.tabButton} ${activeTab === "history" ? approvalStyles.tabButtonActive : ""}`}
            style={{
                padding: "0.75rem 1.5rem",
                background: "transparent", border: "none",
                borderBottom: activeTab === "history" ? "2px solid var(--color-primary)" : "2px solid transparent",
                color: activeTab === "history" ? "var(--color-primary)" : "var(--color-text-secondary)",
                fontWeight: "600", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "0.5rem"
            }}
        >
            <History size={18} /> Histórico
        </button>
      </div>

      {/* CONTENT */}
      {/* DEV TOOLS */}
      {/* <div className={approvalStyles.devToolsRow} style={{ marginBottom: "1rem", display: "flex", justifyContent: "flex-end" }}>
        <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
                if(confirm("Tem certeza? Isso apagará todas as solicitações de desconto salvas localmente.")) {
                    localStorage.removeItem("discount-requests-storage");
                    window.location.reload();
                }
            }}
            style={{ color: "#ef4444", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}
        >
            <History size={14} /> Limpar Dados (Dev)
        </Button>
      </div> */}

      <div className={approvalStyles.contentGrid} style={{ display: "grid", gap: "1.5rem" }}>
        {isLoading && <LoadingStatePanel message="Carregando solicitações..." />}
        {isError && (
          <ErrorStatePanel
            title="Erro ao carregar aprovações"
            message={error instanceof Error ? error.message : "Tente novamente."}
            actions={<Button variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>}
          />
        )}
        {activeTab === "discounts" ? (
            pendingGroups.length === 0 ? (
                <EmptyStatePanel message="Nenhuma solicitação de desconto pendente." />
            ) : (
                pendingGroups.map(group => (
                    <BudgetGroupCard
                        key={group.budgetId + group.clientName}
                        group={group}
                        isAdmin={canApproveDiscounts}
                        onApprove={(req) => handleOpenAction(req, "APPROVE")}
                        onReject={(req) => handleOpenAction(req, "REJECT")}
                    />
                ))
            )
        ) : activeTab === "venue" ? (
            <VenueDiscountApprovals podeAprovar={canApproveDiscounts} />
        ) : activeTab === "edits" ? (
            pendingEdits.length === 0 ? (
                <EmptyStatePanel message="Nenhuma solicitação de edição pendente." />
            ) : (
                pendingEdits.map(req => (
                    <div key={req.id} className={approvalStyles.editRequestCard} style={{
                        backgroundColor: "var(--color-surface)",
                        borderRadius: "var(--radius-lg)",
                        border: "1px solid var(--color-border)",
                        padding: "1.5rem"
                    }}>
                        <div className={approvalStyles.editRequestCardRow} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div className={approvalStyles.editRequestCardMain} style={{ flex: 1 }}>
                                <div className={approvalStyles.editRequestCardTitleRow} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                    <StatusPill size="xs" bg="#f3e8ff" color="#7e22ce" style={{ borderRadius: "4px" }}>EDIÇÃO</StatusPill>
                                    <span style={{ fontWeight: "600", fontSize: "1rem" }}>{req.clientName}</span>
                                    {getBudgetById(req.budgetId)?.version && (getBudgetById(req.budgetId)?.version ?? 1) > 1 && (
                                        <StatusPill size="xs" bg="#dcfce7" color="#16a34a" style={{ borderRadius: "4px" }}>
                                            V.{getBudgetById(req.budgetId)?.version}
                                        </StatusPill>
                                    )}
                                </div>
                                <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", margin: "4px 0" }}>
                                    Solicitado por: <strong>{req.requestedBy}</strong> em {new Date(req.requestedAt).toLocaleDateString("pt-BR")}
                                </p>
                                <p style={{ fontSize: "0.875rem", marginTop: "8px", display: "flex", alignItems: "flex-start", gap: "4px" }}>
                                    <AlertCircle size={14} style={{ marginTop: "2px", flexShrink: 0, color: "#d97706" }} />
                                    <span style={{ fontStyle: "italic" }}>{req.reason}</span>
                                </p>
                            </div>
                            {canApproveEdits && (
                                <div className={approvalStyles.editRequestCardActions} style={{ display: "flex", gap: "0.5rem", marginLeft: "1rem" }}>
                                    <Button variant="outline" size="sm" onClick={() => { setSelectedEditRequest(req); setEditActionType("REJECT"); setEditObservation(""); }} style={{ borderColor: "#ef4444", color: "#ef4444" }}>
                                        <X size={16} />
                                    </Button>
                                    <Button size="sm" onClick={() => { setSelectedEditRequest(req); setEditActionType("APPROVE"); setEditObservation(""); }} style={{ backgroundColor: "#22c55e" }}>
                                        <Check size={16} />
                                    </Button>
                                </div>
                            )}
                            {!canApproveEdits && (
                                <StatusPill size="sm" bg="#fef3c7" color="#d97706">Pendente</StatusPill>
                            )}
                        </div>
                    </div>
                ))
            )
        ) : activeTab === "budget_approvals" ? (
            budgetsPendingApproval.length === 0 ? (
                <EmptyStatePanel message="Nenhum orçamento aguardando aprovação." />
            ) : (
                budgetsPendingApproval.map((budget) => {
                    const clientTitle = [budget.instituicao, budget.curso, budget.comissao].filter(Boolean).join(" — ");
                    return (
                        <div key={budget.id} style={{
                            backgroundColor: "var(--color-surface)",
                            borderRadius: "var(--radius-lg)",
                            border: "1px solid var(--color-border)",
                            padding: "1.5rem",
                        }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                        <StatusPill size="xs" bg="#eff6ff" color="#1e40af" style={{ borderRadius: "4px" }}>ORÇAMENTO</StatusPill>
                                        <span style={{ fontWeight: "600", fontSize: "1rem" }}>{clientTitle}</span>
                                        {budget.budgetCode && (
                                            <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", fontFamily: "monospace" }}>
                                                {budget.budgetCode}
                                            </span>
                                        )}
                                    </div>
                                    <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", margin: "4px 0" }}>
                                        Enviado por: <strong>{budget.createdByName || budget.createdBy}</strong> em {new Date(budget.updatedAt ?? budget.createdAt).toLocaleDateString("pt-BR")}
                                    </p>
                                    <p style={{ fontSize: "0.9rem", fontWeight: 600, marginTop: "6px" }}>
                                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(budget.totalValue)}
                                    </p>
                                    {budget.observation && (
                                        <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "6px", fontStyle: "italic" }}>
                                            Obs: {budget.observation}
                                        </p>
                                    )}
                                </div>
                                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, alignItems: "center" }}>
                                    <Button variant="outline" size="sm"
                                        isLoading={isLoadingPreview}
                                        onClick={() => void handlePreviewBudget(budget)}
                                        title="Visualizar orçamento"
                                        style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
                                    >
                                        <Eye size={16} />
                                    </Button>
                                    {isAdminByRole ? (
                                        <>
                                            <Button variant="outline" size="sm"
                                                onClick={() => { setSelectedBudgetForApproval(budget); setBudgetApprovalAction("RETURN"); setBudgetApprovalObservation(""); }}
                                                style={{ borderColor: "#f97316", color: "#f97316" }}
                                            >
                                                <X size={16} />
                                            </Button>
                                            <Button size="sm"
                                                onClick={() => { setSelectedBudgetForApproval(budget); setBudgetApprovalAction("APPROVE"); setBudgetApprovalObservation(""); }}
                                                style={{ backgroundColor: "#22c55e" }}
                                            >
                                                <Check size={16} />
                                            </Button>
                                        </>
                                    ) : (
                                        <StatusPill size="sm" bg="#eff6ff" color="#1e40af">Aguardando</StatusPill>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })
            )
        ) : (
            // Histórico: mostra descontos + edições + orçamentos
            (historyGroups.length === 0 && historyEdits.length === 0 && budgetsHistory.length === 0) ? (
                <EmptyStatePanel message="Nenhum histórico disponível." />
            ) : (
                <>
                    {historyGroups.length > 0 && (
                        <>
                            <h3 className={approvalStyles.sectionHeading} style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>Descontos</h3>
                            {historyGroups.map(group => (
                                <BudgetGroupCard 
                                    key={group.budgetId + group.clientName} 
                                    group={group}
                                    isAdmin={canApproveDiscounts}
                                    isHistory
                                />
                            ))}
                        </>
                    )}
                    {budgetsHistory.length > 0 && (
                        <>
                            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text-secondary)", marginTop: historyGroups.length > 0 ? "1rem" : undefined, marginBottom: "0.5rem" }}>Orçamentos</h3>
                            {budgetsHistory.map((budget) => {
                                const clientTitle = [budget.instituicao, budget.curso, budget.comissao].filter(Boolean).join(" — ");
                                const isApprovedBudget = budget.status === "APPROVED";
                                return (
                                    <div key={budget.id} style={{
                                        backgroundColor: "var(--color-surface)",
                                        borderRadius: "var(--radius-lg)",
                                        border: "1px solid var(--color-border)",
                                        padding: "1rem",
                                    }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                                    <StatusPill size="xs" bg="#eff6ff" color="#1e40af" style={{ borderRadius: "4px" }}>ORÇAMENTO</StatusPill>
                                                    <span style={{ fontWeight: "600", fontSize: "0.95rem" }}>{clientTitle}</span>
                                                    {budget.budgetCode && (
                                                        <span style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", fontFamily: "monospace" }}>{budget.budgetCode}</span>
                                                    )}
                                                </div>
                                                <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", margin: "4px 0" }}>
                                                    Enviado por: <strong>{budget.createdByName || budget.createdBy}</strong>
                                                    {" · "}
                                                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(budget.totalValue)}
                                                </p>
                                                {isApprovedBudget ? (
                                                    <p style={{ fontSize: "0.8rem", color: "#16a34a", display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
                                                        <Check size={12} /> Aprovado
                                                    </p>
                                                ) : (
                                                    <p style={{ fontSize: "0.8rem", color: "#dc2626", display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
                                                        <X size={12} /> Cancelado
                                                    </p>
                                                )}
                                            </div>
                                            <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0, alignItems: "center" }}>
                                                <Button variant="outline" size="sm"
                                                    isLoading={isLoadingPreview}
                                                    onClick={() => void handlePreviewBudget(budget)}
                                                    title="Visualizar orçamento"
                                                    style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
                                                >
                                                    <Eye size={16} />
                                                </Button>
                                                <StatusPill
                                                    size="sm"
                                                    bg={isApprovedBudget ? "#dcfce7" : "#fee2e2"}
                                                    color={isApprovedBudget ? "#16a34a" : "#dc2626"}
                                                >
                                                    {isApprovedBudget ? "Aprovado" : "Cancelado"}
                                                </StatusPill>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                    {historyEdits.length > 0 && (
                        <>
                            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text-secondary)", marginTop: "1rem", marginBottom: "0.5rem" }}>Edições</h3>
                            {historyEdits.map(req => (
                                <div key={req.id} className={approvalStyles.editHistoryCard} style={{
                                    backgroundColor: "var(--color-surface)",
                                    borderRadius: "var(--radius-lg)",
                                    border: "1px solid var(--color-border)",
                                    padding: "1rem"
                                }}>
                                    <div className={approvalStyles.editHistoryCardRow} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div className={approvalStyles.editHistoryCardMain}>
                                            <div className={approvalStyles.editRequestCardTitleRow} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                                                <StatusPill size="xs" bg="#f3e8ff" color="#7e22ce" style={{ borderRadius: "4px" }}>EDIÇÃO</StatusPill>
                                                <span style={{ fontWeight: "600" }}>{req.clientName}</span>
                                                {getBudgetById(req.budgetId)?.version && (getBudgetById(req.budgetId)?.version ?? 1) > 1 && (
                                                    <StatusPill size="xs" bg="#dcfce7" color="#16a34a" style={{ borderRadius: "4px" }}>
                                                        V.{getBudgetById(req.budgetId)?.version}
                                                    </StatusPill>
                                                )}
                                            </div>
                                            <p style={{ fontSize: "0.8rem", color: "#666" }}>Motivo: {req.reason}</p>
                                            {req.approvedBy && <p style={{ fontSize: "0.8rem", color: req.status === "APPROVED" ? "#16a34a" : "#dc2626" }}>{req.status === "APPROVED" ? `✓ Aprovado por ${req.approvedBy}` : `✗ Rejeitado por ${req.approvedBy}`}{req.observation ? ` — ${req.observation}` : ""}</p>}
                                        </div>
                                        <StatusPill
                                          size="sm"
                                          bg={req.status === "APPROVED" ? "#dcfce7" : "#fee2e2"}
                                          color={req.status === "APPROVED" ? "#16a34a" : "#dc2626"}
                                        >
                                          {req.status === "APPROVED" ? "Aprovado" : "Rejeitado"}
                                        </StatusPill>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </>
            )
        )}
      </div>

      {/* MODAL / DIALOG OVERLAY */}
      {selectedRequest && actionType && (
        <ModalShell maxWidth="500px" zIndex={50} panelStyle={{ padding: "2rem" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {actionType === "APPROVE" ? <Check size={24} color="#22c55e" /> : <X size={24} color="#ef4444" />}
                    {actionType === "APPROVE" ? "Aprovar Solicitação" : "Rejeitar Solicitação"}
                </h3>

                <div style={{ marginBottom: "1.5rem", padding: "1rem", backgroundColor: "var(--color-background)", borderRadius: "var(--radius-md)" }}>
                    <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>
                        {selectedRequest.type === "ITEM" ? "Item / Evento" : "Cliente"}
                    </p>
                    <p style={{ fontWeight: "600" }}>
                        {selectedRequest.type === "ITEM" 
                            ? `${selectedRequest.itemName} (${selectedRequest.clientName})`
                            : selectedRequest.clientName}
                    </p>
                    
                    <div className={approvalStyles.modalMetricsGrid} style={{ marginTop: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                        <div>
                            <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>Valor Base</p>
                            <p style={{ fontWeight: "600" }}>{formatCurrency(selectedRequest.originalValue)}</p>
                        </div>
                        <div>
                            <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>Desconto Solicitado</p>
                            <p style={{ fontWeight: "600", color: "var(--color-primary)" }}>
                                {formatDiscountInput({
                                    mode: selectedRequest.discountMode,
                                    value: selectedRequest.requestedValue,
                                })}{" "}
                                ({formatCurrency(selectedRequest.discountValue)})
                            </p>
                        </div>
                    </div>
                </div>

                {actionType === "APPROVE" && (
                    <div style={{ marginBottom: "1.5rem" }}>
                        <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", marginBottom: "0.5rem" }}>
                            {selectedRequest.discountMode === "FIXED"
                                ? "Valor do Desconto (R$)"
                                : "Percentual de Desconto"}
                        </label>
                        <div className={approvalStyles.modalInlineRow} style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                            <Input
                                type="text"
                                inputMode="decimal"
                                leftIcon={selectedRequest.discountMode === "FIXED" ? "R$" : "%"}
                                value={editDiscountText}
                                onChange={(e) => {
                                    const { texto, valor } =
                                        selectedRequest.discountMode === "FIXED"
                                            ? mascaraReais(e.target.value)
                                            : mascaraPercentual(e.target.value);
                                    setEditDiscountText(texto);
                                    setEditDiscountValue(valor);
                                }}
                                style={{ width: "150px" }}
                            />
                            <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
                                Novo Final: <b>{formatCurrency(calculatePreviewValues().finalVal)}</b>
                            </span>
                        </div>
                        {editDiscountValue !== selectedRequest.requestedValue && (
                            <p style={{ fontSize: "0.75rem", color: "#eab308", marginTop: "0.25rem" }}>
                                * Valor alterado do original ({formatDiscountInput({
                                    mode: selectedRequest.discountMode,
                                    value: selectedRequest.requestedValue,
                                })})
                            </p>
                        )}
                    </div>
                )}

                {selectedRequest.attachmentName && selectedRequest.attachmentUrl && (
                  <div style={{ marginBottom: "1.5rem", padding: "0.75rem", backgroundColor: "#f0f9ff", borderRadius: "var(--radius-md)", border: "1px solid #bae6fd" }}>
                    <p style={{ fontSize: "0.8rem", fontWeight: "500", color: "#0369a1", marginBottom: "0.35rem" }}>Anexo da Solicitação</p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Paperclip size={14} color="#0369a1" />
                      <a
                        href={resolveAttachmentUrl(selectedRequest.attachmentUrl)}
                        download={selectedRequest.attachmentName}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: "0.875rem", color: "#0369a1", textDecoration: "underline", wordBreak: "break-all" }}
                      >
                        {selectedRequest.attachmentName}
                      </a>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: "2rem" }}>
                    <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", marginBottom: "0.5rem" }}>
                        Observação (Obrigatória)
                    </label>
                    <textarea
                        value={observation}
                        onChange={(e) => setObservation(e.target.value)}
                        placeholder="Justifique a aprovação, alteração ou rejeição..."
                        style={{
                            width: "100%",
                            minHeight: "100px",
                            padding: "0.75rem",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--color-border)",
                            backgroundColor: "var(--color-background)",
                            color: "var(--color-text-main)",
                            fontFamily: "inherit",
                            resize: "vertical"
                        }}
                    />
                </div>

                <div className={approvalStyles.modalActions} style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
                    <Button variant="ghost" onClick={handleCloseAction}>Cancelar</Button>
                    <Button 
                        onClick={handleSubmitAction}
                        style={{ backgroundColor: actionType === "APPROVE" ? "#22c55e" : "#ef4444" }}
                    >
                        Confirmar
                    </Button>
                </div>
        </ModalShell>
      )}

      {/* MODAL DE APROVAÇÃO/DEVOLUÇÃO DE ORÇAMENTO */}
      {selectedBudgetForApproval && budgetApprovalAction && (
        <ModalShell maxWidth="500px" zIndex={50} panelStyle={{ padding: "2rem" }}>
          <h3 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {budgetApprovalAction === "APPROVE" ? <Check size={24} color="#22c55e" /> : <X size={24} color="#f97316" />}
            {budgetApprovalAction === "APPROVE" ? "Aprovar Orçamento" : "Devolver para Pendente"}
          </h3>
          <div style={{ marginBottom: "1rem", padding: "1rem", backgroundColor: "var(--color-background)", borderRadius: "var(--radius-md)" }}>
            <p style={{ fontWeight: "600" }}>
              {[selectedBudgetForApproval.instituicao, selectedBudgetForApproval.curso, selectedBudgetForApproval.comissao].filter(Boolean).join(" — ")}
            </p>
            <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginTop: "4px" }}>
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(selectedBudgetForApproval.totalValue)}
            </p>
          </div>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", marginBottom: "0.5rem" }}>
              Observação {budgetApprovalAction === "APPROVE" ? "(opcional)" : "(obrigatória)"}
            </label>
            <textarea
              value={budgetApprovalObservation}
              onChange={(e) => setBudgetApprovalObservation(e.target.value)}
              placeholder={budgetApprovalAction === "APPROVE" ? "Observação sobre a aprovação..." : "Motivo da devolução..."}
              style={{ width: "100%", minHeight: "90px", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-main)", fontFamily: "inherit", resize: "vertical" }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
            <Button variant="ghost" onClick={() => { setSelectedBudgetForApproval(null); setBudgetApprovalAction(null); }}>Cancelar</Button>
            <Button
              isLoading={updateBudgetStatusMutation.isPending}
              onClick={handleSubmitBudgetApproval}
              style={{ backgroundColor: budgetApprovalAction === "APPROVE" ? "#22c55e" : "#f97316" }}
            >
              Confirmar
            </Button>
          </div>
        </ModalShell>
      )}

      {/* MODAL DE PREVIEW DE ORÇAMENTO (FULLSCREEN) */}
      {previewBudget && (
        <div
          onClick={() => setPreviewBudget(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "1.5vh 1.5vw",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "97vw", height: "97vh",
              backgroundColor: "var(--color-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border)",
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              padding: "1rem 1.5rem",
              borderBottom: "1px solid var(--color-border)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              flexShrink: 0,
              backgroundColor: "var(--color-bg-tertiary)",
            }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--color-text-main)" }}>
                  {[previewBudget.instituicao, previewBudget.curso, previewBudget.comissao].filter(Boolean).join(" — ")}
                </span>
                {previewBudget.budgetCode && (
                  <span style={{ marginLeft: "0.75rem", fontSize: "0.8rem", fontFamily: "monospace", color: "var(--color-text-secondary)" }}>
                    {previewBudget.budgetCode}
                  </span>
                )}
              </div>
              <button
                onClick={() => setPreviewBudget(null)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: "0.5rem",
                  borderRadius: "var(--radius-md)", color: "var(--color-text-secondary)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                title="Fechar"
              >
                <X size={22} />
              </button>
            </div>
            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
              <BudgetPreviewContent budget={previewBudget} />
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE APROVAÇÃO/REJEIÇÃO DE EDIÇÃO */}
      {selectedEditRequest && editActionType && (
        <ModalShell maxWidth="500px" zIndex={50} panelStyle={{ padding: "2rem" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: "600", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {editActionType === "APPROVE" ? <Check size={24} color="#22c55e" /> : <X size={24} color="#ef4444" />}
                    {editActionType === "APPROVE" ? "Aprovar Edição" : "Rejeitar Edição"}
                </h3>
                <div style={{ marginBottom: "1rem", padding: "1rem", backgroundColor: "var(--color-background)", borderRadius: "var(--radius-md)" }}>
                    <p style={{ fontWeight: "600" }}>{selectedEditRequest.clientName}</p>
                    <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginTop: "4px" }}>Motivo: {selectedEditRequest.reason}</p>
                </div>
                <div style={{ marginBottom: "1.5rem" }}>
                    <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", marginBottom: "0.5rem" }}>Observação (Obrigatória)</label>
                    <textarea
                        value={editObservation}
                        onChange={(e) => setEditObservation(e.target.value)}
                        placeholder="Justifique a decisão..."
                        style={{ width: "100%", minHeight: "90px", padding: "0.75rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", backgroundColor: "var(--color-background)", color: "var(--color-text-main)", fontFamily: "inherit", resize: "vertical" }}
                    />
                </div>
                <div className={approvalStyles.modalActions} style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
                    <Button variant="ghost" onClick={() => { setSelectedEditRequest(null); setEditActionType(null); }}>Cancelar</Button>
                    <Button onClick={handleSubmitEditAction} style={{ backgroundColor: editActionType === "APPROVE" ? "#22c55e" : "#ef4444" }}>Confirmar</Button>
                </div>
        </ModalShell>
      )}
    </div>
  );
}

// Sub-components

function BudgetGroupCard({ group, isAdmin, onApprove, onReject, isHistory }: { group: BudgetGroup, isAdmin: boolean, onApprove?: RequestActionHandler, onReject?: RequestActionHandler, isHistory?: boolean }) {
    const [expanded, setExpanded] = useState(false);
    
    return (
        <div className={approvalStyles.groupCard} style={{ 
            backgroundColor: "var(--color-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border)",
            overflow: "hidden"
        }}>
           <div 
             onClick={() => setExpanded(!expanded)}
             className={approvalStyles.groupCardHeader}
             style={{ 
                 padding: "1.5rem", 
                 cursor: "pointer", 
                 display: "flex", 
                 justifyContent: "space-between", 
                 alignItems: "center",
                 backgroundColor: expanded ? "var(--color-background)" : "transparent",
                 transition: "background-color 0.2s"
             }}
           >
               <div className={approvalStyles.groupCardHeaderMain} style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                   <div style={{
                       width: "40px", height: "40px", borderRadius: "50%",
                       backgroundColor: "#e0f2fe", color: "#0369a1",
                       display: "flex", alignItems: "center", justifyContent: "center",
                       fontWeight: "bold"
                   }}>
                       {group.clientName.charAt(0).toUpperCase()}
                   </div>
                   <div className={approvalStyles.groupCardTitleWrap}>
                       <h3 className={approvalStyles.groupCardTitle} style={{ fontWeight: "600", fontSize: "1.125rem", color: "var(--color-text-main)" }}>
                           {group.clientName}
                       </h3>
                       <p className={approvalStyles.groupCardSubtitle} style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
                           {group.requests.length} solicitação(ões) • Total Desconto: {formatCurrency(group.totalDiscountValue)}
                       </p>
                   </div>
               </div>
               <div className={approvalStyles.groupCardHeaderAside} style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    {!expanded && (
                         <div style={{ display: 'flex', gap: '4px' }}>
                            {group.requests.slice(0, 3).map((r, i) => (
                                <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: r.status === 'APPROVED' ? '#22c55e' : r.status === 'REJECTED' ? '#ef4444' : '#eab308' }} />
                            ))}
                            {group.requests.length > 3 && <span style={{ fontSize: '12px', color: '#999' }}>...</span>}
                         </div>
                    )}
                   {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
               </div>
           </div>

           {expanded && (
               <div className={approvalStyles.groupCardBody} style={{ padding: "1.5rem", borderTop: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)" }}>
                   <div className={approvalStyles.groupCardRows} style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem" }}>
                       {group.requests.map(req => (
                           <RequestRow 
                                key={req.id} 
                                request={req} 
                                isAdmin={isAdmin}
                                onApprove={onApprove}
                                onReject={onReject}
                                isHistory={isHistory}
                           />
                       ))}
                   </div>
               </div>
           )}
        </div>
    );
}

function RequestRow({ request, isAdmin, onApprove, onReject, isHistory }: { request: DisplayRequest, isAdmin: boolean, onApprove?: RequestActionHandler, onReject?: RequestActionHandler, isHistory?: boolean }) {
    const isApproved = request.status === "APPROVED";

    return (
        <div className={approvalStyles.requestRow} style={{ 
            padding: "1rem", 
            backgroundColor: "var(--color-surface)", 
            borderRadius: "var(--radius-md)", 
            border: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
        }}>
            <div className={approvalStyles.requestRowMain} style={{ flex: 1 }}>
                <div className={approvalStyles.requestRowTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    {request.type === 'GLOBAL' ? (
                        <span style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem", borderRadius: "4px", backgroundColor: "#f3e8ff", color: "#7e22ce", fontWeight: "600" }}>GLOBAL</span>
                    ) : (
                        <span style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem", borderRadius: "4px", backgroundColor: "#e0f2fe", color: "#0369a1", fontWeight: "600" }}>ITEM</span>
                    )}
                    <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                        {request.itemName || "Desconto Geral no Orçamento"}
                    </span>
                 </div>
                 <div className={approvalStyles.requestRowMeta} style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--color-text-secondary)', alignItems: 'center' }}>
                     <span>Base: {formatCurrency(request.originalValue)}</span>
                     <span>Solicitado: <span style={{ color: 'var(--color-primary)', fontWeight: '500' }}>{formatDiscountInput({ mode: request.discountMode, value: request.requestedValue })} ({formatCurrency(request.discountValue)})</span></span>
                     {request.requestObservation && (
                         <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontStyle: 'italic' }}>
                             <AlertCircle size={12} /> {request.requestObservation}
                         </span>
                     )}
                 </div>
                 {isHistory && (
                     <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#666', borderTop: '1px dashed #eee', paddingTop: '0.5rem' }}>
                         {isApproved ? (
                             <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                 <Check size={12} /> Aprovado por {request.approvedBy} - Obs: {request.observation}
                             </span>
                         ) : (
                             <span style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                 <X size={12} /> Rejeitado por {request.approvedBy} - Obs: {request.observation}
                             </span>
                         )}
                     </div>
                 )}
            </div>

            {/* Actions for Pending */}
            {!isHistory && isAdmin && (
                <div className={approvalStyles.requestRowActions} style={{ display: "flex", gap: "0.5rem", marginLeft: "1rem" }}>
                     <Button variant="outline" size="sm" onClick={() => onReject && onReject(request)} style={{ borderColor: "#ef4444", color: "#ef4444" }} title="Rejeitar">
                        <X size={16} />
                    </Button>
                    <Button size="sm" onClick={() => onApprove && onApprove(request)} style={{ backgroundColor: "#22c55e" }} title="Aprovar">
                       <Check size={16} />
                    </Button>
                </div>
            )}
            
            {/* Status for History or Non-Admin */}
            {(isHistory || (!isAdmin && !isHistory)) && (
                 <div className={approvalStyles.requestRowStatusWrap} style={{ marginLeft: "1rem" }}>
                     {request.status === 'PENDING' ? (
                         <StatusPill size="sm" bg="#fef3c7" color="#d97706">Pendente</StatusPill>
                     ) : isApproved ? (
                         <StatusPill size="sm" bg="#dcfce7" color="#16a34a">Aprovado</StatusPill>
                     ) : (
                         <StatusPill size="sm" bg="#fee2e2" color="#dc2626">Rejeitado</StatusPill>
                     )}
                 </div>
            )}
        </div>
    );
}

function getParticipation(formValues: SummaryFormValues, eventId: string): number {
  return getParticipationQuantity(formValues as Record<string, unknown>, eventId, 0);
}

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  PENDING: { label: "Pendente", bg: "#fef9c3", color: "#854d0e" },
  SENT_FOR_APPROVAL: { label: "Enviado p/ Aprovação", bg: "#dbeafe", color: "#1e40af" },
  APPROVED: { label: "Aprovado", bg: "#dcfce7", color: "#166534" },
  CANCELLED: { label: "Cancelado", bg: "#fee2e2", color: "#991b1b" },
};

function BudgetPreviewContent({ budget }: { budget: Budget }) {
  const formValues = (budget.data ?? {}) as SummaryFormValues;
  const selectedEventIds: string[] = Array.isArray(formValues.selectedEvents)
    ? (formValues.selectedEvents as string[])
    : [];
  const approvedItemDiscounts = budget.approvedItemDiscounts ?? {};
  const approvedItemDiscountAmounts = budget.approvedItemDiscountAmounts ?? {};
  const customItems = (formValues.customItems ?? {}) as SummaryCustomItems;
  const resolvedItemRequests = buildApprovedItemRequestsFromDiscountMap(
    formValues,
    EVENT_TYPES,
    approvedItemDiscounts,
    approvedItemDiscountAmounts,
  );
  const approvedItemDiscountDetails = buildApprovedItemDiscountDetails(
    formValues,
    EVENT_TYPES,
    resolvedItemRequests,
  );

  const itemRequestsMap: Record<string, typeof resolvedItemRequests> = { [budget.id]: resolvedItemRequests };
  const calculateEventTotal = (event: EventType) => calculateSummaryStepEventTotals(event, formValues, itemRequestsMap);

  let subtotal = 0;
  let totalDiscounted = 0;
  selectedEventIds.forEach((eventId) => {
    if (eventId === "culto_cortesia" || eventId === "evento_100_dias") return;
    const event = EVENT_TYPES.find((e) => e.id === eventId);
    if (!event) return;
    const result = calculateEventTotal(event);
    subtotal += result.total;
    totalDiscounted += result.discountedTotal;
  });

  const storedDeficit = budget.deficitValue ?? 0;
  const discountPercent = budget.discountPercent ?? 0;
  const discountValue = resolveGlobalDiscountValue(totalDiscounted, budget);
  const totalFinal = totalDiscounted - discountValue;

  const infoRows: [string, string | null | undefined][] = [
    ["Instituição", budget.instituicao],
    ["Curso", budget.curso],
    ["Comissão", budget.comissao],
    ["Telefone", budget.telefone],
    ["Controle", budget.controle],
    ["Criado por", budget.createdByName || budget.createdBy],
    ["Código", budget.budgetCode],
  ];
  const statusMeta = STATUS_LABELS[budget.status] ?? STATUS_LABELS.PENDING;

  const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontWeight: 600, fontSize: "0.75rem", color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "2px solid var(--color-border)", whiteSpace: "nowrap" };
  const tdStyle: React.CSSProperties = { padding: "8px 10px", fontSize: "0.875rem", color: "var(--color-text-main)", verticalAlign: "top" };
  const tdRight: React.CSSProperties = { ...tdStyle, textAlign: "right" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Info geral */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.75rem", padding: "1rem", backgroundColor: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
        {infoRows.filter(([, v]) => v).map(([label, value]) => (
          <div key={label}>
            <p style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
            <p style={{ fontSize: "0.9rem", color: "var(--color-text-main)", fontWeight: 500, marginTop: "2px", overflowWrap: "anywhere" }}>{value}</p>
          </div>
        ))}
        <div>
          <p style={{ fontSize: "0.7rem", color: "var(--color-text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</p>
          <span style={{ display: "inline-block", marginTop: "4px", padding: "2px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700, backgroundColor: statusMeta.bg, color: statusMeta.color }}>
            {statusMeta.label}
          </span>
        </div>
      </div>

      {/* Observação */}
      {budget.observation && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "var(--radius-md)" }}>
          <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#92400e", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Observação</p>
          <p style={{ fontSize: "0.9rem", color: "#78350f" }}>{budget.observation}</p>
        </div>
      )}

      {/* Eventos — um bloco por evento com todos os itens */}
      {selectedEventIds.length === 0 ? (
        <p style={{ color: "var(--color-text-secondary)", fontStyle: "italic" }}>Nenhum evento selecionado.</p>
      ) : (
        selectedEventIds.map((eventId) => {
          const event = EVENT_TYPES.find((e) => e.id === eventId);
          if (!event) return null;

          const participation = getParticipation(formValues, eventId);
          const removedIds = customItems[eventId]?.removedIds ?? [];
          const addedItems = customItems[eventId]?.added ?? [];
          const itemsData = (formValues.items as Record<string, Record<string, unknown>> | undefined)?.[eventId] ?? {};
          const { total: evtTotal, discountedTotal: evtDiscounted } = calculateEventTotal(event);
          const isDeficit = eventId === "culto_cortesia";

          // Visible base items (non-header, not removed)
          const visibleItems = event.items.filter((item) => !item.isHeader && !removedIds.includes(item.id));

          return (
            <div key={eventId} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
              {/* Event header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", backgroundColor: "var(--color-bg-tertiary)", borderBottom: "1px solid var(--color-border)" }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-text-main)" }}>{event.title}</span>
                  {isDeficit && <span style={{ marginLeft: "8px", fontSize: "0.75rem", padding: "2px 8px", borderRadius: "999px", backgroundColor: "#fef3c7", color: "#92400e", fontWeight: 600 }}>Déficit</span>}
                </div>
                {participation > 0 && (
                  <span style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                    {participation} formando{participation !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Items table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr style={{ backgroundColor: "var(--color-bg-secondary)" }}>
                      <th style={{ ...thStyle, width: "40%" }}>Item</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Qtd</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Valor Unit.</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Desconto</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item, idx) => {
                      const rawQty = itemsData[item.id];
                      const rawPrice = itemsData[`${item.id}_price`];
                      const effectiveQty = rawQty !== undefined ? Number(rawQty) : (item.fixedQty ?? participation);
                      const effectivePrice = rawPrice !== undefined ? Number(rawPrice) : (item.unitPrice ?? 0);
                      const discountKey = `${eventId}-${item.id}`;
                      const itemDiscountPct = approvedItemDiscounts[discountKey] ?? 0;
                      const isIncluded = Boolean(item.displayValue);
                      const itemTotal = isIncluded ? 0 : effectiveQty * effectivePrice;
                      const itemTotalDiscounted = isIncluded ? 0 : itemTotal * (1 - itemDiscountPct / 100);
                      const rowBg = idx % 2 === 0 ? "transparent" : "var(--color-bg-secondary)";

                      return (
                        <tr key={item.id} style={{ backgroundColor: rowBg, borderBottom: "1px solid var(--color-border)" }}>
                          <td style={tdStyle}>
                            {item.name}
                            {removedIds.includes(item.id) && <span style={{ marginLeft: "6px", fontSize: "0.7rem", color: "#dc2626" }}>(removido)</span>}
                          </td>
                          <td style={tdRight}>
                            {isIncluded ? "-" : (effectiveQty > 0 ? effectiveQty : "-")}
                          </td>
                          <td style={tdRight}>
                            {isIncluded
                              ? <span style={{ fontSize: "0.75rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "#f0fdf4", color: "#16a34a", fontWeight: 600 }}>{item.displayValue}</span>
                              : (effectivePrice > 0 ? formatCurrency(effectivePrice) : "-")
                            }
                          </td>
                          <td style={{ ...tdRight, color: itemDiscountPct > 0 ? "#16a34a" : "var(--color-text-secondary)" }}>
                            {itemDiscountPct > 0 ? `${itemDiscountPct}%` : "-"}
                          </td>
                          <td style={{ ...tdRight, fontWeight: 500 }}>
                            {isIncluded ? (
                              <span style={{ fontSize: "0.75rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "#f0fdf4", color: "#16a34a", fontWeight: 600 }}>Incluso</span>
                            ) : itemTotal > 0 ? (
                              itemDiscountPct > 0 ? (
                                <span>
                                  <span style={{ textDecoration: "line-through", color: "var(--color-text-secondary)", fontSize: "0.8rem", marginRight: "4px" }}>{formatCurrency(itemTotal)}</span>
                                  <span style={{ color: "#16a34a" }}>{formatCurrency(itemTotalDiscounted)}</span>
                                </span>
                              ) : formatCurrency(itemTotal)
                            ) : "-"}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Custom added items */}
                    {addedItems.map((addedItem, idx) => {
                      const qty = Number(addedItem.quantity) || 0;
                      const price = Number(addedItem.unitPrice) || 0;
                      const total = addedItem.isNoFixedValue ? 0 : qty * price;
                      const addedItemId = addedItem.id || `added_${idx}`;
                      const itemDiscountPct = approvedItemDiscounts[`${eventId}-${addedItemId}`] ?? 0;
                      const totalDiscounted = addedItem.isNoFixedValue
                        ? 0
                        : total * (1 - itemDiscountPct / 100);
                      const rowBg = (visibleItems.length + idx) % 2 === 0 ? "transparent" : "var(--color-bg-secondary)";
                      return (
                        <tr key={`added-${idx}`} style={{ backgroundColor: rowBg, borderBottom: "1px solid var(--color-border)" }}>
                          <td style={tdStyle}>
                            <span style={{ marginRight: "6px", fontSize: "0.7rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "#f0fdf4", color: "#16a34a", fontWeight: 600 }}>+</span>
                            {addedItem.name || "Item personalizado"}
                          </td>
                          <td style={tdRight}>{addedItem.isNoFixedValue ? "-" : (qty > 0 ? qty : "-")}</td>
                          <td style={tdRight}>{addedItem.isNoFixedValue ? <span style={{ fontSize: "0.75rem", color: "#16a34a" }}>Incluso</span> : (price > 0 ? formatCurrency(price) : "-")}</td>
                          <td style={{ ...tdRight, color: itemDiscountPct > 0 ? "#16a34a" : "var(--color-text-secondary)" }}>
                            {itemDiscountPct > 0 ? `${itemDiscountPct}%` : "-"}
                          </td>
                          <td style={{ ...tdRight, fontWeight: 500 }}>
                            {addedItem.isNoFixedValue ? <span style={{ fontSize: "0.75rem", color: "#16a34a" }}>Incluso</span> : total > 0 ? itemDiscountPct > 0 ? (
                              <span>
                                <span style={{ textDecoration: "line-through", color: "var(--color-text-secondary)", fontSize: "0.8rem", marginRight: "4px" }}>{formatCurrency(total)}</span>
                                <span style={{ color: "#16a34a" }}>{formatCurrency(totalDiscounted)}</span>
                              </span>
                            ) : formatCurrency(total) : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Event footer with total */}
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--color-border)", backgroundColor: "var(--color-bg-tertiary)" }}>
                      <td colSpan={4} style={{ ...tdStyle, fontWeight: 700, textAlign: "right", color: "var(--color-text-secondary)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                        {isDeficit ? "Custo Cortesia" : "Total do Evento"}
                      </td>
                      <td style={{ ...tdRight, fontWeight: 700 }}>
                        {isDeficit ? (
                          <span style={{ color: "#d9534f" }}>{formatCurrency(storedDeficit)}</span>
                        ) : evtDiscounted < evtTotal ? (
                          <span>
                            <span style={{ textDecoration: "line-through", color: "var(--color-text-secondary)", fontSize: "0.8rem", marginRight: "4px" }}>{formatCurrency(evtTotal)}</span>
                            <span style={{ color: "#16a34a" }}>{formatCurrency(evtDiscounted)}</span>
                          </span>
                        ) : (
                          formatCurrency(evtTotal)
                        )}
                      </td>
                    </tr>
                    {!isDeficit && participation > 0 && (
                      <tr style={{ backgroundColor: "var(--color-bg-tertiary)" }}>
                        <td colSpan={4} style={{ ...tdStyle, textAlign: "right", color: "var(--color-text-secondary)", fontSize: "0.8rem" }}>
                          Valor por formando
                        </td>
                        <td style={{ ...tdRight, color: "var(--color-primary)", fontWeight: 600 }}>
                          {formatCurrency(evtDiscounted / participation)}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })
      )}

      {/* Personalizações (resumo de itens adicionados/removidos) */}
      <DetailedCustomizationsPanel customItems={customItems} />

      {/* Resumo financeiro */}
      <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--color-bg-tertiary)", borderBottom: "1px solid var(--color-border)" }}>
          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-text-main)" }}>Resumo Financeiro</span>
        </div>
        <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
            <span>Subtotal (Eventos Pagos)</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>

          <ApprovedItemDiscountsRow details={approvedItemDiscountDetails} />

          {(discountValue > 0 || discountPercent > 0) && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", color: "#dc2626" }}>
              <span>Desconto Global Aplicado ({formatAppliedDiscount(budget)})</span>
              <span>- {formatCurrency(discountValue)}</span>
            </div>
          )}

          <div style={{ height: "1px", backgroundColor: "var(--color-border)", margin: "0.25rem 0" }} />

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.1rem", fontWeight: 700, color: "var(--color-text-main)" }}>
            <span>Total Final (Cliente)</span>
            <span>{formatCurrency(totalFinal > 0 ? totalFinal : (budget.totalValue ?? 0))}</span>
          </div>

          {storedDeficit > 0 && (
            <>
              <div style={{ height: "1px", backgroundColor: "var(--color-border)", margin: "0.25rem 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", color: "#d9534f" }}>
                <span>Déficit / Custos Cortesia</span>
                <span>{formatCurrency(storedDeficit)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const formatCurrency = (val: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
