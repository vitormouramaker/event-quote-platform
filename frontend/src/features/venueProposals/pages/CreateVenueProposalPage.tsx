import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Lock,
  Minus,
  Plus,
  Printer,
  Save,
  Send,
} from "lucide-react";
import { Button } from "../../../components/Button/Button";
import { Input } from "../../../components/Input/Input";
import { useAuthStore } from "../../../store/authStore";
import { DiscountInputField } from "../../budgets/components/DiscountInputField";
import {
  formatAppliedDiscount,
  type DiscountMode,
} from "../../budgets/domain/discountInput";
import {
  buildVenueProposalTotals,
  createEmptyVenueProposalForm,
  defaultValidUntil,
  mergeSavedVenueProposalForm,
  resolveVenueSettings,
  validateVenueProposal,
  type VenueOptionalChoice,
  type VenueProposalForm,
  type VenueSettings,
} from "../domain/venueProposal";
import { versionOf } from "../domain/venueVersions";
import {
  canEditVenueProposal,
  resolveVenueStatus,
  venueLockReason,
  VENUE_STATUS_LABEL,
} from "../domain/venueStatus";
import {
  useVenueProposalQuery,
  useVenueSettingsQuery,
} from "../queries/useVenueProposalQueries";
import { useVenueProposalMutations } from "../mutations/useVenueProposalMutations";
import { openVenueProposalPrint } from "../print/venueProposalPrint";
import type { VenueProposalRowDto } from "../../../services/api";
import styles from "./VenueProposal.module.css";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Horários de meia em meia hora: digitar à mão era fonte de erro. */
const HORARIOS = Array.from({ length: 48 }, (_, i) => {
  const hora = String(Math.floor(i / 2)).padStart(2, "0");
  const minuto = i % 2 === 0 ? "00" : "30";
  return `${hora}:${minuto}`;
});

/** O que o banco guardou de volta no formulário da tela. */
function formFromRow(
  row: VenueProposalRowDto,
  settings: VenueSettings,
  validUntilPadrao: string,
): VenueProposalForm {
  const salvo = mergeSavedVenueProposalForm(
    (row.data ?? {}) as Partial<VenueProposalForm>,
    settings,
  );
  return {
    ...salvo,
    clientName: row.client_name ?? "",
    eventType: row.event_type ?? "",
    guests: row.guests === null || row.guests === undefined ? null : Number(row.guests),
    // A coluna DATE volta como timestamp ISO; a tela usa só o dia.
    eventStartDate: (row.event_date ?? "").slice(0, 10) || salvo.eventStartDate,
    eventEndDate:
      (row.event_end_date ?? "").slice(0, 10) ||
      salvo.eventEndDate ||
      (row.event_date ?? "").slice(0, 10),
    setupDays: Number(row.setup_days ?? salvo.setupDays),
    teardownDays: Number(row.teardown_days ?? salvo.teardownDays),
    entranceId: row.entrance_id || salvo.entranceId,
    discountMode: (row.discount_mode === "FIXED" ? "FIXED" : "PERCENT") as DiscountMode,
    discountValue:
      row.discount_mode === "FIXED"
        ? Number(row.discount_amount ?? 0)
        : Number(row.discount_percent ?? 0),
    discountReason: row.discount_reason ?? "",
    // Proposta antiga sem validade gravada cai na validade padrão da tabela.
    validUntil: (row.valid_until ?? "").slice(0, 10) || validUntilPadrao,
    observation: row.observation ?? "",
  };
}

/** Select simples, no visual dos inputs da tela. */
function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <select
        className={styles.select}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Serviço opcional: o cartão inteiro liga e desliga o item.
 *
 * Quando o item é cobrado por diária, o seletor de dias aparece dentro do
 * cartão com o total daquela linha ao lado — é a informação que o consultor
 * procura ao mexer nos dias.
 */
function OptionalCard({
  name,
  condition,
  unitPrice,
  perDay,
  choice,
  onToggle,
  onDaysChange,
  maxDays,
  maxHint,
}: {
  name: string;
  condition: string;
  unitPrice: number;
  perDay: boolean;
  choice: VenueOptionalChoice;
  onToggle: (selected: boolean) => void;
  onDaysChange?: (days: number) => void;
  maxDays?: number;
  /** De onde vem o teto: "dias do evento", "dias de montagem"… */
  maxHint?: string;
}) {
  const marcado = choice.selected;
  const dias = Math.min(Math.max(choice.days || 1, 1), maxDays ?? Math.max(choice.days, 1));
  const totalLinha = perDay ? unitPrice * dias : unitPrice;
  const semDias = perDay && (maxDays ?? 0) <= 0;

  const mudarDias = (valor: number) => {
    if (!onDaysChange) return;
    const teto = maxDays ?? valor;
    onDaysChange(Math.min(Math.max(valor, 1), teto));
  };

  return (
    <div
      className={marcado ? styles.optionalCardActive : styles.optionalCard}
      role="button"
      tabIndex={semDias ? -1 : 0}
      aria-pressed={marcado}
      aria-disabled={semDias}
      onClick={() => !semDias && onToggle(!marcado)}
      onKeyDown={(e) => {
        if (semDias) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(!marcado);
        }
      }}
    >
      <span className={marcado ? styles.checkOn : styles.checkOff} aria-hidden="true">
        {marcado ? <Check size={14} strokeWidth={3} /> : null}
      </span>

      <div className={styles.optionalBody}>
        <span className={styles.optionalName}>{name}</span>
        <span className={styles.optionalCondition}>
          {semDias ? `Sem ${maxHint ?? "dias"} para contratar` : condition}
        </span>
      </div>

      <span className={styles.optionalPrice}>
        {currency.format(unitPrice)}
        {perDay && <span className={styles.optionalPerDay}>por dia</span>}
      </span>

      {marcado && perDay && onDaysChange && (
        // O clique aqui mexe nos dias, não desmarca o serviço.
        <div
          className={styles.daysBox}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="presentation"
        >
          <div className={styles.daysRow}>
            <div className={styles.daysControl}>
              <button
                type="button"
                className={styles.daysStep}
                aria-label={`Menos um dia de ${name}`}
                disabled={dias <= 1}
                onClick={() => mudarDias(dias - 1)}
              >
                <Minus size={15} />
              </button>
              <input
                type="number"
                className={styles.daysInput}
                min="1"
                max={maxDays}
                value={dias}
                aria-label={`Dias de ${name}`}
                onChange={(e) => mudarDias(Number(e.target.value))}
              />
              <button
                type="button"
                className={styles.daysStep}
                aria-label={`Mais um dia de ${name}`}
                disabled={maxDays !== undefined && dias >= maxDays}
                onClick={() => mudarDias(dias + 1)}
              >
                <Plus size={15} />
              </button>
            </div>
            <span className={styles.daysTotal}>{currency.format(totalLinha)}</span>
          </div>
          <span className={styles.daysHint}>
            {dias === 1 ? "1 dia" : `${dias} dias`}
            {maxDays !== undefined && (
              <> de {maxDays} {maxHint ?? "dias"} possíveis</>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

export function CreateVenueProposalPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";

  const { data: settingsAtuais } = useVenueSettingsQuery();
  const { data: proposta } = useVenueProposalQuery(id);

  // Proposta ja emitida continua valendo pela tabela de precos com que foi
  // feita, mesmo que o gestor tenha mudado os valores depois.
  const settings = settingsAtuais
    ? resolveVenueSettings(
        (proposta?.data ?? null) as Partial<VenueProposalForm> | null,
        settingsAtuais,
      )
    : undefined;
  const tabelaCongelada =
    Boolean(proposta) && settings !== settingsAtuais;
  const {
    createMutation,
    updateMutation,
    createVersionMutation,
    updateStatusMutation,
  } = useVenueProposalMutations();

  const [form, setForm] = useState<VenueProposalForm | null>(null);
  // Decidir aqui exige a mesma observação que a Central de Aprovações exige:
  // sem ela o consultor recebe a decisão sem saber o porquê.
  const [decisao, setDecisao] = useState<
    "APPROVED" | "CANCELLED" | "PENDING" | null
  >(null);
  const [decisaoObservacao, setDecisaoObservacao] = useState("");

  // O formulário só nasce quando a tabela de preços chega: é ela que define as
  // entradas e os opcionais disponíveis.
  //
  // E nasce UMA vez por proposta: `settings` e `proposta` trocam de referência
  // a cada refetch, e remontar o formulário nessas horas apagaria o que
  // estivesse sendo digitado.
  const inicializado = useRef<string | null>(null);
  useEffect(() => {
    if (!settings) return;
    const chave = id ?? "nova";
    if (inicializado.current === chave) return;
    // Em edição, espera a proposta chegar para não nascer vazio e sobrescrever.
    if (id && !proposta) return;

    inicializado.current = chave;
    const validade = defaultValidUntil(settings);
    setForm(
      proposta
        ? formFromRow(proposta, settings, validade)
        : { ...createEmptyVenueProposalForm(settings), validUntil: validade },
    );
  }, [settings, proposta, id]);

  const totals = useMemo(
    () => (form && settings ? buildVenueProposalTotals(form, settings) : null),
    [form, settings],
  );

  if (!settings || !form || !totals) {
    return <div className={styles.empty}>Carregando a tabela de preços…</div>;
  }

  const alterar = <K extends keyof VenueProposalForm>(
    campo: K,
    valor: VenueProposalForm[K],
  ) => setForm((atual) => (atual ? { ...atual, [campo]: valor } : atual));

  const statusDesconto = proposta?.discount_status ?? "NONE";
  const emEdicao = Boolean(id);

  const status = resolveVenueStatus(proposta?.status);
  const podeEditar = !emEdicao || canEditVenueProposal(status, isAdmin);
  const motivoTravado = podeEditar ? null : venueLockReason(status);
  const versao = proposta ? versionOf(proposta) : 1;
  // Rascunho se corrige no lugar; documento que já saiu vira versão nova.
  const salvarCriaVersao = emEdicao && status !== "PENDING";

  // O desconto salvo e o que esta na tela sao o mesmo pedido?
  //
  // Importa porque um gestor que abre uma proposta com desconto PENDENTE e so
  // salva nao esta decidindo nada: sem esta comparacao o salvar aprovava o
  // pedido sozinho, sem registrar quem aprovou.
  const descontoSalvo = proposta
    ? {
        mode: proposta.discount_mode === "FIXED" ? "FIXED" : "PERCENT",
        value:
          proposta.discount_mode === "FIXED"
            ? Number(proposta.discount_amount ?? 0)
            : Number(proposta.discount_percent ?? 0),
        reason: proposta.discount_reason ?? "",
      }
    : null;

  const descontoMudou =
    !descontoSalvo ||
    descontoSalvo.mode !== form.discountMode ||
    descontoSalvo.value !== form.discountValue ||
    descontoSalvo.reason !== form.discountReason.trim();

  const proximoStatusDesconto = (() => {
    if (form.discountValue <= 0) return "NONE";
    // Pedido intocado mantem a decisao que ja existe (inclusive PENDING).
    if (!descontoMudou && statusDesconto !== "NONE") return statusDesconto;
    // Desconto novo: gestor aplica na hora, consultor manda para aprovacao.
    return isAdmin ? "APPROVED" : "PENDING";
  })();

  const montarPayload = () => ({
    clientName: form.clientName.trim(),
    eventType: form.eventType.trim(),
    guests: form.guests,
    eventDate: form.eventStartDate,
    eventEndDate: form.eventEndDate || form.eventStartDate,
    // A coluna guarda a faixa pronta; os campos separados ficam no snapshot.
    eventTime:
      form.eventStartTime && form.eventEndTime
        ? `${form.eventStartTime} às ${form.eventEndTime}`
        : form.eventStartTime || "",
    setupDays: form.setupDays,
    teardownDays: form.teardownDays,
    entranceId: form.entranceId,
    // Guarda a tabela de precos usada: e ela que vale para esta proposta de
    // agora em diante.
    data: { ...form, settingsSnapshot: settings },
    subtotal: totals.subtotal,
    discountMode: form.discountMode,
    discountPercent: form.discountMode === "PERCENT" ? form.discountValue : 0,
    discountAmount: form.discountMode === "FIXED" ? form.discountValue : 0,
    discountReason: form.discountReason.trim(),
    discountStatus: proximoStatusDesconto,
    // Enquanto o desconto não é aprovado, o valor cheio é o que vale.
    totalValue:
      proximoStatusDesconto === "PENDING" || proximoStatusDesconto === "REJECTED"
        ? totals.subtotal
        : totals.total,
    validUntil: form.validUntil,
    // Salvar nao mexe no ciclo de vida: quem muda status e a acao propria.
    status: emEdicao ? status : "PENDING",
    observation: form.observation.trim(),
  });

  const salvar = async () => {
    if (!podeEditar) {
      toast.error(motivoTravado ?? "Esta proposta não pode mais ser alterada.");
      return;
    }
    const erro = validateVenueProposal(form, totals);
    if (erro) {
      toast.error(erro);
      return;
    }
    const payload = montarPayload();
    if (salvarCriaVersao && id) {
      // A anterior fica intacta: ja foi enviada ao cliente.
      await createVersionMutation.mutateAsync({ id, data: payload });
    } else if (emEdicao && id) {
      await updateMutation.mutateAsync({ id, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    navigate("/venue-proposals");
  };

  const imprimir = () => {
    const erro = validateVenueProposal(form, totals);
    if (erro) {
      toast.error(erro);
      return;
    }
    const aberto = openVenueProposalPrint({
      form,
      totals,
      entrances: settings.entrances,
      proposalCode: proposta?.proposal_code,
      responsavel: proposta?.created_by_name || user?.name,
    });
    if (!aberto) toast.error("Libere os pop-ups para imprimir a proposta.");
  };

  const abrirDecisao = (alvo: "APPROVED" | "CANCELLED" | "PENDING") => {
    setDecisao(alvo);
    setDecisaoObservacao("");
  };

  const confirmarDecisao = async () => {
    if (!id || !decisao) return;
    if (!decisaoObservacao.trim()) {
      toast.error("É obrigatório informar uma observação da decisão.");
      return;
    }
    try {
      await updateStatusMutation.mutateAsync({
        id,
        status: decisao,
        observation: decisaoObservacao.trim(),
      });
      setDecisao(null);
      setDecisaoObservacao("");
    } catch (erro) {
      console.error("Falha ao decidir a proposta de locação:", erro);
    }
  };

  const TITULO_DECISAO = {
    APPROVED: "Aprovar esta proposta?",
    CANCELLED: "Cancelar esta proposta?",
    PENDING:
      status === "APPROVED"
        ? "Reabrir esta proposta?"
        : "Devolver esta proposta ao consultor?",
  } as const;

  const salvando =
    createMutation.isPending ||
    updateMutation.isPending ||
    createVersionMutation.isPending;
  const descontoLabel = formatAppliedDiscount({
    discountMode: form.discountMode,
    discountPercent: form.discountMode === "PERCENT" ? form.discountValue : 0,
    discountAmount: form.discountMode === "FIXED" ? form.discountValue : 0,
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {emEdicao ? "Proposta de Locação" : "Nova Proposta · Aurora Hall"}
          </h1>
          <p className={styles.subtitle}>
            Centro de Eventos Aurora Hall
            {proposta?.proposal_code ? ` · ${proposta.proposal_code}` : ""}
            {versao > 1 ? ` · versão ${versao}` : ""}
          </p>
        </div>
        <div className={styles.headerActions}>
          {emEdicao && (
            <span
              className={
                status === "APPROVED"
                  ? styles.badgeApproved
                  : status === "CANCELLED"
                    ? styles.badgeRejected
                    : status === "SENT_FOR_APPROVAL"
                      ? styles.badgeSent
                      : styles.badgePending
              }
            >
              {VENUE_STATUS_LABEL[status]}
            </span>
          )}
          <Button
            variant="outline"
            leftIcon={<ArrowLeft size={18} />}
            onClick={() => navigate("/venue-proposals")}
          >
            Voltar
          </Button>
          <Button variant="outline" leftIcon={<Printer size={18} />} onClick={imprimir}>
            Imprimir
          </Button>
        </div>
      </header>

      {decisao && (
        <div className={styles.decisionBox}>
          <strong>{TITULO_DECISAO[decisao]}</strong>
          <span className={styles.hint}>
            {decisao === "APPROVED"
              ? "A proposta entra nos valores aprovados da plataforma e na comissão do consultor."
              : decisao === "CANCELLED"
                ? "A proposta sai dos valores aprovados e da comissão."
                : "O consultor volta a poder editar e vê a observação abaixo."}
          </span>
          <textarea
            className={styles.textarea}
            value={decisaoObservacao}
            onChange={(e) => setDecisaoObservacao(e.target.value)}
            placeholder="Observação da decisão (obrigatória)…"
          />
          <div className={styles.footer}>
            <Button variant="outline" size="sm" onClick={() => setDecisao(null)}>
              Voltar
            </Button>
            <Button
              size="sm"
              isLoading={updateStatusMutation.isPending}
              onClick={() => void confirmarDecisao()}
            >
              Confirmar
            </Button>
          </div>
        </div>
      )}

      {motivoTravado && (
        <div className={styles.lockNotice}>
          <Lock size={16} />
          <span>{motivoTravado}</span>
        </div>
      )}

      {salvarCriaVersao && podeEditar && (
        <div className={styles.lockNotice}>
          <Lock size={16} />
          <span>
            Esta proposta já saiu do rascunho. Salvar cria a{" "}
            <strong>versão {versao + 1}</strong> e mantém a atual como está.
          </span>
        </div>
      )}

      {proposta?.status_observation && (
        <div className={styles.returnNotice}>
          <strong>
            {status === "PENDING"
              ? "Devolvida pelo gestor:"
              : status === "CANCELLED"
                ? "Cancelada pelo gestor:"
                : "Observação do gestor:"}
          </strong>{" "}
          {proposta.status_observation}
        </div>
      )}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Dados do evento</h2>
        <div className={styles.grid}>
          <Input
            label="Cliente"
            value={form.clientName}
            onChange={(e) => alterar("clientName", e.target.value)}
            placeholder="Nome do contratante"
          />
          <Input
            label="Tipo de evento"
            value={form.eventType}
            onChange={(e) => alterar("eventType", e.target.value)}
            placeholder="Show, formatura, congresso…"
          />
          <Input
            label="Número de convidados"
            type="number"
            min="0"
            value={form.guests ?? ""}
            onChange={(e) =>
              alterar("guests", e.target.value === "" ? null : Number(e.target.value))
            }
            placeholder="5000"
          />
          <Input
            label="Início do evento"
            type="date"
            value={form.eventStartDate}
            onChange={(e) => {
              alterar("eventStartDate", e.target.value);
              // Evento de um dia é o caso comum: o fim acompanha o início até
              // que o consultor diga outra coisa.
              if (!form.eventEndDate || form.eventEndDate < e.target.value) {
                alterar("eventEndDate", e.target.value);
              }
            }}
          />
          <Input
            label="Fim do evento"
            type="date"
            min={form.eventStartDate || undefined}
            value={form.eventEndDate}
            onChange={(e) => alterar("eventEndDate", e.target.value)}
          />
          <Input
            label="Proposta válida até"
            type="date"
            value={form.validUntil}
            onChange={(e) => alterar("validUntil", e.target.value)}
          />
          <Select
            label="Horário de início"
            value={form.eventStartTime}
            onChange={(value) => alterar("eventStartTime", value)}
            options={HORARIOS}
            placeholder="Selecione"
          />
          <Select
            label="Horário de término"
            value={form.eventEndTime}
            onChange={(value) => alterar("eventEndTime", value)}
            options={HORARIOS}
            placeholder="Selecione"
          />
          <Input
            label="Dias de montagem"
            type="number"
            min="0"
            value={form.setupDays}
            onChange={(e) => alterar("setupDays", Number(e.target.value))}
          />
          <Input
            label="Dias de desmontagem"
            type="number"
            min="0"
            value={form.teardownDays}
            onChange={(e) => alterar("teardownDays", Number(e.target.value))}
          />
        </div>
        {tabelaCongelada && (
          <p className={styles.hint} style={{ marginBottom: "10px" }}>
            Esta proposta usa a tabela de preços vigente quando foi criada. Alterações
            posteriores na tabela não mudam os valores dela.
          </p>
        )}
        <p className={styles.hint} style={{ marginTop: "10px" }}>
          Evento de <strong>{totals.eventDays} dia(s)</strong>. A locação já inclui{" "}
          {settings.includedSetupDays} dia de montagem e {settings.includedTeardownDays} de
          desmontagem; dias além disso entram automaticamente como diária adicional, a{" "}
          {settings.extraDailyPercent}% da tarifa do espaço escolhido.
        </p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Configuração de locação</h2>
        <div className={styles.entranceGrid}>
          {settings.entrances.map((entrance) => {
            const escolhida = entrance.id === form.entranceId;
            return (
              <button
                key={entrance.id}
                type="button"
                className={escolhida ? styles.entranceActive : styles.entrance}
                aria-pressed={escolhida}
                onClick={() => alterar("entranceId", entrance.id)}
              >
                <span className={styles.entranceName}>{entrance.name}</span>
                <span className={styles.entrancePrice}>
                  {currency.format(entrance.price)}
                </span>
                <span className={styles.entranceDesc}>{entrance.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Serviços opcionais</h2>
        <div className={styles.optionalGrid}>
          {settings.optionals.map((optional) => {
            const escolha = form.optionals[optional.id] ?? { selected: false, days: 1 };
            return (
              <OptionalCard
                key={optional.id}
                name={optional.name}
                condition={optional.condition}
                unitPrice={optional.price}
                perDay={optional.perDay}
                choice={escolha}
                maxDays={optional.perDay ? totals.eventDays : undefined}
                maxHint="dias do evento"
                onToggle={(selected) =>
                  alterar("optionals", {
                    ...form.optionals,
                    [optional.id]: {
                      selected,
                      // Começa cobrindo o evento inteiro, que é o caso comum.
                      days: escolha.days || totals.eventDays,
                    },
                  })
                }
                onDaysChange={
                  optional.perDay
                    ? (days) =>
                        alterar("optionals", {
                          ...form.optionals,
                          [optional.id]: { ...escolha, selected: true, days },
                        })
                    : undefined
                }
              />
            );
          })}

          <OptionalCard
            name="Climatização na montagem"
            condition="Não inclusa nos dias de montagem; cobrada por dia"
            unitPrice={settings.climateControlDailyRate}
            perDay
            choice={form.climateSetup}
            maxDays={form.setupDays}
            maxHint="dias de montagem"
            onToggle={(selected) =>
              alterar("climateSetup", {
                selected,
                days: form.climateSetup.days || form.setupDays,
              })
            }
            onDaysChange={(days) => alterar("climateSetup", { selected: true, days })}
          />

          <OptionalCard
            name="Climatização na desmontagem"
            condition="Não inclusa nos dias de desmontagem; cobrada por dia"
            unitPrice={settings.climateControlDailyRate}
            perDay
            choice={form.climateTeardown}
            maxDays={form.teardownDays}
            maxHint="dias de desmontagem"
            onToggle={(selected) =>
              alterar("climateTeardown", {
                selected,
                days: form.climateTeardown.days || form.teardownDays,
              })
            }
            onDaysChange={(days) => alterar("climateTeardown", { selected: true, days })}
          />
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Desconto comercial</h2>
        {statusDesconto !== "NONE" && (
          <p style={{ marginBottom: "12px" }}>
            <span
              className={
                statusDesconto === "APPROVED"
                  ? styles.badgeApproved
                  : statusDesconto === "REJECTED"
                    ? styles.badgeRejected
                    : styles.badgePending
              }
            >
              {statusDesconto === "APPROVED"
                ? "Desconto aprovado"
                : statusDesconto === "REJECTED"
                  ? "Desconto rejeitado"
                  : "Desconto aguardando aprovação"}
              {proposta?.discount_reviewed_by ? ` · ${proposta.discount_reviewed_by}` : ""}
            </span>
          </p>
        )}

        <DiscountInputField
          mode={form.discountMode}
          onModeChange={(mode) => {
            alterar("discountMode", mode);
            alterar("discountValue", 0);
          }}
          value={form.discountValue}
          onValueChange={(valor) => alterar("discountValue", valor)}
          base={totals.subtotal}
          finalLabel="Valor final"
        />

        <div className={styles.field}>
          <label className={styles.label}>
            Motivo {form.discountValue > 0 ? "(obrigatório)" : "(opcional)"}
          </label>
          <textarea
            className={styles.textarea}
            value={form.discountReason}
            onChange={(e) => alterar("discountReason", e.target.value)}
            placeholder="Justifique o desconto…"
          />
        </div>

        {proximoStatusDesconto === "PENDING" && (
          <p className={styles.hint} style={{ marginTop: "8px" }}>
            {descontoMudou
              ? "O desconto vai para a fila de Aprovações. Até ser aprovado, a proposta vale pelo valor cheio."
              : "Este desconto está aguardando decisão na tela de Aprovações. Salvar aqui não aprova nem rejeita."}
          </p>
        )}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Composição do investimento</h2>
        {totals.lines.length === 0 ? (
          <p className={styles.hint}>Escolha a configuração de locação.</p>
        ) : (
          <>
            {totals.lines.map((line) => (
              <div key={line.id} className={styles.summaryLine}>
                <span>
                  {line.label}
                  {line.quantity > 1 && (
                    <span className={styles.summaryLabel}> · {line.quantity}×</span>
                  )}
                  <br />
                  <span className={styles.summaryLabel}>{line.condition}</span>
                </span>
                <span>{currency.format(line.total)}</span>
              </div>
            ))}

            {totals.discountValue > 0 && (
              <>
                <div className={styles.summaryLine}>
                  <span className={styles.summaryLabel}>Subtotal</span>
                  <span>{currency.format(totals.subtotal)}</span>
                </div>
                <div className={`${styles.summaryLine} ${styles.discountLine}`}>
                  <span>Desconto comercial ({descontoLabel})</span>
                  <span>- {currency.format(totals.discountValue)}</span>
                </div>
              </>
            )}

            <div className={styles.summaryTotal}>
              <span>Valor total da proposta</span>
              <span>{currency.format(totals.total)}</span>
            </div>
          </>
        )}

        <div className={styles.field} style={{ marginTop: "16px" }}>
          <label className={styles.label}>Observações (saem na proposta)</label>
          <textarea
            className={styles.textarea}
            value={form.observation}
            onChange={(e) => alterar("observation", e.target.value)}
            placeholder="Condições combinadas, ressalvas…"
          />
        </div>
      </section>

      {/* Barra fixa: o total e o botão de salvar acompanham a rolagem, para
          não ter que voltar ao fim da página a cada ajuste. */}
      <div className={styles.stickyBar}>
        <div className={styles.stickyInner}>
          <div className={styles.stickyTotals}>
            <span className={styles.stickyItem}>
              <span className={styles.stickyLabel}>Locação</span>
              <strong>{totals.entrance?.name ?? "—"}</strong>
            </span>
            <span className={styles.stickyItem}>
              <span className={styles.stickyLabel}>Subtotal</span>
              <strong>{currency.format(totals.subtotal)}</strong>
            </span>
            {totals.discountValue > 0 && (
              <span className={`${styles.stickyItem} ${styles.discountLine}`}>
                <span className={styles.stickyLabel}>Desconto ({descontoLabel})</span>
                <strong>- {currency.format(totals.discountValue)}</strong>
              </span>
            )}
            <span className={styles.stickyItem}>
              <span className={styles.stickyLabel}>Valor total</span>
              <strong className={styles.stickyTotal}>
                {currency.format(totals.total)}
              </strong>
            </span>
          </div>
          <div className={styles.stickyActions}>
            {emEdicao && status === "PENDING" && (
              <Button
                variant="outline"
                leftIcon={<Send size={18} />}
                isLoading={updateStatusMutation.isPending}
                onClick={() => {
                  if (!id) return;
                  void updateStatusMutation.mutateAsync({
                    id,
                    status: "SENT_FOR_APPROVAL",
                  });
                }}
              >
                Enviar para aprovação
              </Button>
            )}
            {emEdicao && status === "SENT_FOR_APPROVAL" && !isAdmin && (
              <Button
                variant="outline"
                isLoading={updateStatusMutation.isPending}
                onClick={() => {
                  if (!id) return;
                  void updateStatusMutation.mutateAsync({ id, status: "PENDING" });
                }}
              >
                Cancelar envio
              </Button>
            )}

            {/* Gestor decide da propria proposta, sem passar pela fila. */}
            {emEdicao && isAdmin && status !== "APPROVED" && status !== "CANCELLED" && (
              <Button
                variant="outline"
                leftIcon={<Check size={18} />}
                onClick={() => abrirDecisao("APPROVED")}
              >
                Aprovar
              </Button>
            )}
            {emEdicao && isAdmin && status !== "CANCELLED" && (
              <Button
                variant="outline"
                style={{ color: "#b91c1c" }}
                onClick={() => abrirDecisao("CANCELLED")}
              >
                Cancelar proposta
              </Button>
            )}
            {emEdicao && isAdmin && (status === "APPROVED" || status === "SENT_FOR_APPROVAL") && (
              <Button variant="outline" onClick={() => abrirDecisao("PENDING")}>
                {status === "APPROVED" ? "Reabrir" : "Devolver"}
              </Button>
            )}
            <Button
              leftIcon={<Save size={18} />}
              isLoading={salvando}
              disabled={!podeEditar}
              title={motivoTravado ?? undefined}
              onClick={() => void salvar()}
            >
              {salvarCriaVersao
                ? `Salvar como versão ${versao + 1}`
                : emEdicao
                  ? "Salvar alterações"
                  : "Criar proposta"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
