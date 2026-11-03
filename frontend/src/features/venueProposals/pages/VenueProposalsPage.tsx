import { useNavigate } from "react-router-dom";
import { Building2, Pencil, Plus, Printer, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "../../../components/Button/Button";
import { useAuthStore } from "../../../store/authStore";
import {
  useVenueProposalsQuery,
  useVenueSettingsQuery,
} from "../queries/useVenueProposalQueries";
import { useVenueProposalMutations } from "../mutations/useVenueProposalMutations";
import { openVenueProposalPrint } from "../print/venueProposalPrint";
import {
  buildVenueProposalTotals,
  mergeSavedVenueProposalForm,
  resolveVenueSettings,
  type VenueProposalForm,
} from "../domain/venueProposal";
import { groupVenueVersions, versionOf } from "../domain/venueVersions";
import {
  resolveVenueStatus,
  venueStatusOptions,
  VENUE_STATUS_LABEL,
  type VenueProposalStatus,
} from "../domain/venueStatus";
import type { VenueProposalRowDto } from "../../../services/api";
import styles from "./VenueProposal.module.css";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatDateBR(value?: string | null) {
  if (!value) return "—";
  const [ano, mes, dia] = value.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : value;
}

/** O período do evento: uma data só quando começa e termina no mesmo dia. */
function formatPeriodo(row: VenueProposalRowDto) {
  const inicio = (row.event_date ?? "").slice(0, 10);
  const fim = (row.event_end_date ?? "").slice(0, 10);
  if (!inicio) return "—";
  if (!fim || fim === inicio) return formatDateBR(inicio);
  return `${formatDateBR(inicio)} a ${formatDateBR(fim)}`;
}

/** A cor do selo conta o estado antes de o texto ser lido. */
function classeDoStatus(status: VenueProposalStatus) {
  if (status === "APPROVED") return styles.badgeApproved;
  if (status === "CANCELLED") return styles.badgeRejected;
  if (status === "SENT_FOR_APPROVAL") return styles.badgeSent;
  return styles.badgePending;
}

const DISCOUNT_LABEL: Record<string, string> = {
  PENDING: "Desconto pendente",
  APPROVED: "Desconto aprovado",
  REJECTED: "Desconto rejeitado",
};

export function VenueProposalsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";

  const { data: proposals = [], isLoading } = useVenueProposalsQuery();
  // A listagem mostra a versão vigente de cada proposta; as anteriores ficam
  // dobradas dentro do card.
  const familias = groupVenueVersions(proposals);
  const { data: settings } = useVenueSettingsQuery();
  const { removeMutation, updateStatusMutation } = useVenueProposalMutations();

  // A proposta salva guarda o formulário inteiro; imprimir não precisa abrir a
  // tela de edição.
  const imprimir = (row: VenueProposalRowDto) => {
    if (!settings) return;
    // A proposta imprime pelos precos com que foi feita.
    const salvo = (row.data ?? {}) as Partial<VenueProposalForm>;
    const tabela = resolveVenueSettings(salvo, settings);
    const form = mergeSavedVenueProposalForm(salvo, tabela);
    openVenueProposalPrint({
      form,
      totals: buildVenueProposalTotals(form, tabela),
      entrances: tabela.entrances,
      proposalCode: row.proposal_code,
      responsavel: row.created_by_name || undefined,
    });
  };

  const abrir = (row: VenueProposalRowDto) => navigate(`/venue-proposals/${row.id}`);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Propostas de Locação</h1>
          <p className={styles.subtitle}>Centro de Eventos Aurora Hall</p>
        </div>
        <div className={styles.headerActions}>
          {isAdmin && (
            <Button
              variant="outline"
              leftIcon={<SlidersHorizontal size={18} />}
              onClick={() => navigate("/venue-proposals/settings")}
            >
              Tabela de preços
            </Button>
          )}
          <Button
            leftIcon={<Plus size={20} />}
            onClick={() => navigate("/venue-proposals/new")}
          >
            Nova proposta
          </Button>
        </div>
      </header>

      {isLoading && <div className={styles.empty}>Carregando propostas…</div>}

      {!isLoading && proposals.length === 0 && (
        <div className={styles.empty}>
          <Building2 size={28} style={{ opacity: 0.5 }} />
          <p>Nenhuma proposta de locação ainda.</p>
        </div>
      )}

      <div className={styles.cardGrid}>
        {familias.map(({ family, latest: row, previous }) => {
          const statusDesconto = row.discount_status ?? "NONE";
          const versao = versionOf(row);
          return (
            <article key={family} className={styles.proposalCard}>
              <header
                className={styles.proposalCardHeader}
                role="button"
                tabIndex={0}
                onClick={() => abrir(row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") abrir(row);
                }}
              >
                <span className={styles.proposalCardTitle}>
                  {row.client_name || "Sem cliente"}
                </span>
                <span className={styles.proposalCardSubtitle}>
                  {row.event_type || "Evento não informado"} · {row.proposal_code}
                  {versao > 1 ? ` · v${versao}` : ""}
                </span>
              </header>

              <div
                className={styles.proposalCardBody}
                role="button"
                tabIndex={0}
                onClick={() => abrir(row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") abrir(row);
                }}
              >
                <span className={styles.proposalCardValue}>
                  {currency.format(Number(row.total_value ?? 0))}
                </span>

                <span>
                  <span className={classeDoStatus(resolveVenueStatus(row.status))}>
                    {VENUE_STATUS_LABEL[resolveVenueStatus(row.status)]}
                  </span>
                </span>

                {/* Mudar o status pelo card, como no orçamento: era aqui que
                    o consultor procurava, e não dentro da proposta. */}
                <div
                  className={styles.statusEditor}
                  role="presentation"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <label
                    className={styles.statusEditorLabel}
                    htmlFor={`venue-status-${row.id}`}
                  >
                    Status da proposta
                  </label>
                  <select
                    id={`venue-status-${row.id}`}
                    className={styles.statusEditorSelect}
                    value={resolveVenueStatus(row.status)}
                    disabled={updateStatusMutation.isPending}
                    onChange={(e) => {
                      const alvo = e.target.value as VenueProposalStatus;
                      if (alvo === resolveVenueStatus(row.status)) return;
                      if (
                        alvo === "CANCELLED" &&
                        !window.confirm(
                          "Cancelar esta proposta? Ela sai dos valores aprovados e da comissão.",
                        )
                      ) {
                        return;
                      }
                      void updateStatusMutation.mutateAsync({ id: row.id, status: alvo });
                    }}
                  >
                    {venueStatusOptions(resolveVenueStatus(row.status), isAdmin).map(
                      (opcao) => (
                        <option key={opcao} value={opcao}>
                          {VENUE_STATUS_LABEL[opcao]}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <span className={styles.proposalCardRow}>
                  <span>Evento</span>
                  <strong>{formatPeriodo(row)}</strong>
                </span>
                <span className={styles.proposalCardRow}>
                  <span>Válida até</span>
                  <strong>{formatDateBR(row.valid_until)}</strong>
                </span>
                {row.created_by_name && (
                  <span className={styles.proposalCardRow}>
                    <span>Consultor</span>
                    <strong>{row.created_by_name}</strong>
                  </span>
                )}

                {previous.length > 0 && (
                  <details
                    className={styles.versionBox}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <summary className={styles.versionSummary}>
                      {previous.length === 1
                        ? "1 versão anterior"
                        : `${previous.length} versões anteriores`}
                    </summary>
                    {previous.map((anterior) => (
                      <button
                        key={anterior.id}
                        type="button"
                        className={styles.versionRow}
                        onClick={() => navigate(`/venue-proposals/${anterior.id}`)}
                      >
                        <span>
                          v{versionOf(anterior)} ·{" "}
                          {VENUE_STATUS_LABEL[resolveVenueStatus(anterior.status)]}
                        </span>
                        <strong>
                          {currency.format(Number(anterior.total_value ?? 0))}
                        </strong>
                      </button>
                    ))}
                  </details>
                )}

                {statusDesconto !== "NONE" && (
                  <span>
                    <span
                      className={
                        statusDesconto === "APPROVED"
                          ? styles.badgeApproved
                          : statusDesconto === "REJECTED"
                            ? styles.badgeRejected
                            : styles.badgePending
                      }
                    >
                      {DISCOUNT_LABEL[statusDesconto] ?? statusDesconto}
                    </span>
                  </span>
                )}
              </div>

              <footer className={styles.proposalCardFooter}>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Editar proposta"
                  onClick={() => abrir(row)}
                >
                  <Pencil size={17} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Imprimir proposta"
                  onClick={() => imprimir(row)}
                >
                  <Printer size={17} />
                </Button>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Excluir proposta"
                    style={{ color: "#ef4444" }}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Excluir a proposta ${row.proposal_code} de ${row.client_name}?`,
                        )
                      ) {
                        void removeMutation.mutateAsync(row.id);
                      }
                    }}
                  >
                    <Trash2 size={17} />
                  </Button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}
