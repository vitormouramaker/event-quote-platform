import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2, ExternalLink } from "lucide-react";
import { Button } from "../../../components/Button/Button";
import { formatAppliedDiscount } from "../../budgets/domain/discountInput";
import {
  buildVenueProposalTotals,
  mergeSavedVenueProposalForm,
  resolveVenueSettings,
  type VenueProposalForm,
} from "../domain/venueProposal";
import {
  usePendingVenueApprovals,
  usePendingVenueDiscounts,
  useVenueProposalsQuery,
  useVenueSettingsQuery,
} from "../queries/useVenueProposalQueries";
import { VENUE_STATUS_LABEL } from "../domain/venueStatus";

export { usePendingVenueDiscounts };
import { useVenueProposalMutations } from "../mutations/useVenueProposalMutations";
import type { VenueProposalRowDto } from "../../../services/api";
import styles from "../pages/VenueProposal.module.css";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function descontoPedido(row: VenueProposalRowDto) {
  return formatAppliedDiscount({
    discountMode: row.discount_mode,
    discountPercent: Number(row.discount_percent ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
  });
}

/**
 * Aba de locação na tela de Aprovações.
 *
 * A proposta de locação é um produto à parte, mas a decisão de desconto é a
 * mesma rotina do gestor — por isso aparece na mesma fila, em aba própria.
 */
export function VenueDiscountApprovals({ podeAprovar }: { podeAprovar: boolean }) {
  const navigate = useNavigate();
  const pendentes = usePendingVenueDiscounts();
  const aguardandoAprovacao = usePendingVenueApprovals();
  const { data: proposals = [] } = useVenueProposalsQuery();
  const { data: settings } = useVenueSettingsQuery();
  const { reviewDiscountMutation, updateStatusMutation } = useVenueProposalMutations();

  const [emAnalise, setEmAnalise] = useState<string | null>(null);
  const [observation, setObservation] = useState("");
  const [propostaEmAnalise, setPropostaEmAnalise] = useState<string | null>(null);
  const [motivoDevolucao, setMotivoDevolucao] = useState("");

  // Decididos: sem isto a aprovação sumia da tela sem deixar rastro de quem
  // decidiu e por quê.
  const decididos = proposals.filter(
    (row) => row.discount_status === "APPROVED" || row.discount_status === "REJECTED",
  );

  const decidir = async (row: VenueProposalRowDto, status: "APPROVED" | "REJECTED") => {
    if (!observation.trim()) {
      toast.error("É obrigatório informar uma observação.");
      return;
    }
    // O total aprovado sai do mesmo cálculo da tela da proposta, a partir do
    // snapshot salvo: o gestor aprova exatamente o que o consultor montou.
    const salvo = (row.data ?? {}) as Partial<VenueProposalForm>;
    const tabela = settings ? resolveVenueSettings(salvo, settings) : null;
    const form = tabela ? mergeSavedVenueProposalForm(salvo, tabela) : null;
    const totals = form && tabela ? buildVenueProposalTotals(form, tabela) : null;

    try {
      await reviewDiscountMutation.mutateAsync({
        id: row.id,
        status,
        observation: observation.trim(),
        discountPercent: Number(row.discount_percent ?? 0),
        discountAmount: Number(row.discount_amount ?? 0),
        totalValue: totals ? totals.total : Number(row.total_value ?? 0),
      });
      setEmAnalise(null);
      setObservation("");
    } catch (erro) {
      // O toast de erro já sai na mutation; aqui só evita a promise solta e
      // mantém o cartão aberto para o gestor tentar de novo.
      console.error("Falha ao revisar desconto da proposta de locação:", erro);
    }
  };

  const decidirProposta = async (
    row: VenueProposalRowDto,
    status: "APPROVED" | "PENDING",
  ) => {
    // Devolver sem dizer por que deixa o consultor sem saber o que corrigir.
    if (status === "PENDING" && !motivoDevolucao.trim()) {
      toast.error("Informe o motivo da devolução.");
      return;
    }
    try {
      await updateStatusMutation.mutateAsync({
        id: row.id,
        status,
        observation: motivoDevolucao.trim() || undefined,
      });
      setPropostaEmAnalise(null);
      setMotivoDevolucao("");
    } catch (erro) {
      console.error("Falha ao decidir a proposta de locação:", erro);
    }
  };

  return (
    <>
      {aguardandoAprovacao.length > 0 && (
        <>
          <h3 className={styles.historyTitle}>Propostas aguardando aprovação</h3>
          <div className={styles.cardGrid}>
            {aguardandoAprovacao.map((row) => (
              <article key={row.id} className={styles.proposalCard}>
                <header className={styles.proposalCardHeader}>
                  <span className={styles.proposalCardTitle}>
                    {row.client_name || "Sem cliente"}
                  </span>
                  <span className={styles.proposalCardSubtitle}>
                    {row.event_type || "Evento não informado"} · {row.proposal_code}
                  </span>
                </header>

                <div className={styles.proposalCardBody}>
                  <span className={styles.proposalCardValue}>
                    {currency.format(Number(row.total_value ?? 0))}
                  </span>
                  <span className={styles.proposalCardRow}>
                    <span>Enviada por</span>
                    <strong>{row.created_by_name || "—"}</strong>
                  </span>
                  <span className={styles.proposalCardRow}>
                    <span>Situação</span>
                    <strong>{VENUE_STATUS_LABEL.SENT_FOR_APPROVAL}</strong>
                  </span>
                  {row.discount_status === "PENDING" && (
                    <span className={styles.badgePending}>
                      Tem desconto pendente de decisão
                    </span>
                  )}

                  {propostaEmAnalise === row.id && (
                    <div className={styles.reviewBox}>
                      <textarea
                        className={styles.textarea}
                        value={motivoDevolucao}
                        onChange={(e) => setMotivoDevolucao(e.target.value)}
                        placeholder="Motivo da devolução (obrigatório para devolver)…"
                      />
                      <div className={styles.footer}>
                        <Button
                          variant="outline"
                          size="sm"
                          isLoading={updateStatusMutation.isPending}
                          onClick={() => void decidirProposta(row, "PENDING")}
                        >
                          Devolver
                        </Button>
                        <Button
                          size="sm"
                          isLoading={updateStatusMutation.isPending}
                          onClick={() => void decidirProposta(row, "APPROVED")}
                        >
                          Aprovar proposta
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <footer className={styles.proposalCardFooter}>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Abrir a proposta"
                    onClick={() => navigate(`/venue-proposals/${row.id}`)}
                  >
                    <ExternalLink size={17} />
                  </Button>
                  {podeAprovar && propostaEmAnalise !== row.id && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setPropostaEmAnalise(row.id);
                        setMotivoDevolucao("");
                      }}
                    >
                      Analisar
                    </Button>
                  )}
                </footer>
              </article>
            ))}
          </div>

          <h3 className={styles.historyTitle}>Descontos pendentes</h3>
        </>
      )}

      {pendentes.length === 0 && (
        <div className={styles.empty}>
          <Building2 size={26} style={{ opacity: 0.5 }} />
          <p>Nenhum desconto de locação pendente.</p>
        </div>
      )}

      <div className={styles.cardGrid}>
      {pendentes.map((row) => (
        <article key={row.id} className={styles.proposalCard}>
          <header className={styles.proposalCardHeader}>
            <span className={styles.proposalCardTitle}>
              {row.client_name || "Sem cliente"}
            </span>
            <span className={styles.proposalCardSubtitle}>
              {row.event_type || "Evento não informado"} · {row.proposal_code}
            </span>
          </header>

          <div className={styles.proposalCardBody}>
            <span className={styles.proposalCardRow}>
              <span>Valor cheio</span>
              <strong>{currency.format(Number(row.subtotal ?? 0))}</strong>
            </span>
            <span className={styles.proposalCardRow}>
              <span>Desconto pedido</span>
              <strong style={{ color: "var(--color-primary)" }}>
                {descontoPedido(row)}
              </strong>
            </span>
            <span className={styles.proposalCardRow}>
              <span>Pedido por</span>
              <strong>{row.created_by_name || "—"}</strong>
            </span>
            <p className={styles.optionalCondition}>
              Motivo: {row.discount_reason || "não informado"}
            </p>

            {emAnalise === row.id && (
              <div className={styles.reviewBox}>
                <textarea
                  className={styles.textarea}
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  placeholder="Observação da decisão (obrigatória)…"
                />
                <div className={styles.footer}>
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={reviewDiscountMutation.isPending}
                    onClick={() => void decidir(row, "REJECTED")}
                  >
                    Rejeitar
                  </Button>
                  <Button
                    size="sm"
                    isLoading={reviewDiscountMutation.isPending}
                    onClick={() => void decidir(row, "APPROVED")}
                  >
                    Aprovar
                  </Button>
                </div>
              </div>
            )}
          </div>

          <footer className={styles.proposalCardFooter}>
            <Button
              variant="ghost"
              size="sm"
              title="Abrir a proposta"
              onClick={() => navigate(`/venue-proposals/${row.id}`)}
            >
              <ExternalLink size={17} />
            </Button>
            {podeAprovar && emAnalise !== row.id && (
              <Button
                size="sm"
                onClick={() => {
                  setEmAnalise(row.id);
                  setObservation("");
                }}
              >
                Analisar
              </Button>
            )}
          </footer>
        </article>
      ))}
      </div>

      {decididos.length > 0 && (
        <>
          <h3 className={styles.historyTitle}>Decididos</h3>
          <div className={styles.cardGrid}>
            {decididos.map((row) => (
              <article key={row.id} className={styles.proposalCard}>
                <header className={styles.proposalCardHeader}>
                  <span className={styles.proposalCardTitle}>
                    {row.client_name || "Sem cliente"}
                  </span>
                  <span className={styles.proposalCardSubtitle}>
                    {row.event_type || "Evento não informado"} · {row.proposal_code}
                  </span>
                </header>
                <div className={styles.proposalCardBody}>
                  <span>
                    <span
                      className={
                        row.discount_status === "APPROVED"
                          ? styles.badgeApproved
                          : styles.badgeRejected
                      }
                    >
                      {row.discount_status === "APPROVED"
                        ? "Desconto aprovado"
                        : "Desconto rejeitado"}
                    </span>
                  </span>
                  <span className={styles.proposalCardRow}>
                    <span>Desconto</span>
                    <strong>{descontoPedido(row)}</strong>
                  </span>
                  <span className={styles.proposalCardRow}>
                    <span>Decidido por</span>
                    <strong>{row.discount_reviewed_by || "—"}</strong>
                  </span>
                  <span className={styles.proposalCardRow}>
                    <span>Valor final</span>
                    <strong>{currency.format(Number(row.total_value ?? 0))}</strong>
                  </span>
                  {row.discount_observation && (
                    <p className={styles.optionalCondition}>
                      Observação: {row.discount_observation}
                    </p>
                  )}
                </div>
                <footer className={styles.proposalCardFooter}>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Abrir a proposta"
                    onClick={() => navigate(`/venue-proposals/${row.id}`)}
                  >
                    <ExternalLink size={17} />
                  </Button>
                </footer>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
