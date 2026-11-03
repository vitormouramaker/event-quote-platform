import { useState } from "react";
import { X, Send, CheckCircle2, MessageSquareReply } from "lucide-react";
import { ModalShell } from "../../../components/ModalShell/ModalShell";
import { Button } from "../../../components/Button/Button";
import { useAuthStore } from "../../../store/authStore";
import { useBudgetReviewsQuery } from "../queries/useBudgetReviewsQuery";
import { useBudgetReviewMutations } from "../mutations/useBudgetReviewMutations";
import type { Budget } from "../../../store/budgetStore";
import type { BudgetReviewKind, BudgetReviewStatus } from "../../../services/api";

const STATUS_META: Record<BudgetReviewStatus, { label: string; bg: string; text: string }> = {
  NONE: { label: "Sem devolutivas", bg: "#f1f5f9", text: "#475569" },
  PENDING_CREATOR: { label: "Aguardando ajustes do criador", bg: "#fef3c7", text: "#b45309" },
  PENDING_ANALYST: { label: "Aguardando reanálise do analista", bg: "#e0e7ff", text: "#4338ca" },
  APPROVED: { label: "Aprovado pelo analista", bg: "#dcfce7", text: "#15803d" },
};

const KIND_META: Record<BudgetReviewKind, { label: string; color: string }> = {
  devolutiva: { label: "Devolutiva", color: "#b45309" },
  resposta: { label: "Resposta do criador", color: "#1d4ed8" },
  aprovacao: { label: "Aprovação", color: "#15803d" },
};

function formatDateTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pt-BR");
}

export function BudgetReviewModal({
  budget,
  onClose,
}: {
  budget: Budget;
  onClose: () => void;
}) {
  const { user } = useAuthStore();
  const { data, isLoading } = useBudgetReviewsQuery(budget.id);
  const { createMutation } = useBudgetReviewMutations();
  const [message, setMessage] = useState("");

  const reviews = data?.reviews ?? [];
  const status: BudgetReviewStatus = data?.status ?? "NONE";

  const isAnalyst = user?.role === "ADM_ANALISTA_ORCAMENTO";
  const isAdmin = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";

  const canAnalyze = (isAnalyst || isAdmin) && (status === "NONE" || status === "PENDING_ANALYST");
  const canRespond = !isAnalyst && status === "PENDING_CREATOR";
  const isApproved = status === "APPROVED";

  const submit = (kind: BudgetReviewKind) => {
    createMutation.mutate(
      { budget_id: budget.id, kind, message: message.trim() || undefined },
      {
        onSuccess: (res) => {
          if (res.ok) setMessage("");
        },
      },
    );
  };

  const statusMeta = STATUS_META[status];

  return (
    <ModalShell onBackdropClick={onClose} maxWidth="640px" zIndex={190}>
      <div style={{ display: "flex", flexDirection: "column", maxHeight: "85vh" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--color-text-main)" }}>
              Devolutivas da análise
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: 2 }}>
              {budget.instituicao} — {budget.curso}
              {budget.budgetCode ? ` · ${budget.budgetCode}` : ""}
            </p>
            <span
              style={{
                display: "inline-block",
                marginTop: 8,
                padding: "3px 10px",
                borderRadius: 999,
                fontSize: "0.75rem",
                fontWeight: 700,
                backgroundColor: statusMeta.bg,
                color: statusMeta.text,
              }}
            >
              {statusMeta.label}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Histórico */}
        <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", flex: 1 }}>
          {isLoading ? (
            <p style={{ color: "var(--color-text-secondary)" }}>Carregando histórico...</p>
          ) : reviews.length === 0 ? (
            <p style={{ color: "var(--color-text-secondary)", fontStyle: "italic" }}>
              Nenhuma devolutiva registrada ainda.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {reviews.map((review) => {
                const meta = KIND_META[review.kind];
                return (
                  <div
                    key={review.id}
                    style={{
                      border: "1px solid var(--color-border)",
                      borderLeft: `4px solid ${meta.color}`,
                      borderRadius: "10px",
                      padding: "10px 14px",
                      backgroundColor: "var(--color-surface)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: meta.color }}>
                        {meta.label}
                      </span>
                      <span style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>
                        {formatDateTime(review.created_at)}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: 6 }}>
                      {review.author_name || "—"}
                    </div>
                    {review.message ? (
                      <p style={{ fontSize: "0.9rem", color: "var(--color-text-main)", whiteSpace: "pre-wrap", margin: 0 }}>
                        {review.message}
                      </p>
                    ) : review.kind === "aprovacao" ? (
                      <p style={{ fontSize: "0.9rem", color: meta.color, fontWeight: 600, margin: 0 }}>
                        Orçamento aprovado.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Ação */}
        {(canAnalyze || canRespond) && !isApproved ? (
          <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid var(--color-border)" }}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                canAnalyze
                  ? "Descreva os pontos da devolutiva (ou deixe em branco para aprovar)..."
                  : "Descreva como os pontos apontados foram sanados..."
              }
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                backgroundColor: "var(--color-background)",
                color: "var(--color-text-main)",
                fontSize: "0.9rem",
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              {canAnalyze ? (
                <>
                  <Button
                    variant="outline"
                    leftIcon={<CheckCircle2 size={16} />}
                    disabled={createMutation.isPending}
                    onClick={() => submit("aprovacao")}
                  >
                    Aprovar orçamento
                  </Button>
                  <Button
                    leftIcon={<Send size={16} />}
                    disabled={createMutation.isPending || !message.trim()}
                    onClick={() => submit("devolutiva")}
                  >
                    Enviar devolutiva
                  </Button>
                </>
              ) : (
                <Button
                  leftIcon={<MessageSquareReply size={16} />}
                  disabled={createMutation.isPending || !message.trim()}
                  onClick={() => submit("resposta")}
                >
                  Marcar como sanado / responder
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: "0.9rem 1.5rem",
              borderTop: "1px solid var(--color-border)",
              fontSize: "0.85rem",
              color: "var(--color-text-secondary)",
            }}
          >
            {isApproved
              ? "Este orçamento já foi aprovado pelo analista."
              : status === "PENDING_CREATOR"
                ? "Aguardando o criador do orçamento informar que os pontos foram sanados."
                : status === "PENDING_ANALYST"
                  ? "Aguardando o analista reanalisar o orçamento."
                  : "Somente o analista pode iniciar uma devolutiva."}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
