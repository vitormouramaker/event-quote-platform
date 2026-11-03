import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Printer, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/Button/Button";
import { LoadingStatePanel } from "../../../components/AsyncState/AsyncState";
import { useBudgetStore, type Budget } from "../../../store/budgetStore";
import { useEventsQuery } from "../../events/queries/useEventsQuery";
import { buildBudgetEventsCatalog } from "../../budgets/data/budgetCatalog";
import {
  buildBudgetPrintDocument,
  buildCourtesyPrintEvent,
} from "../../budgets/print/budgetPrint";
import { Toggle } from "../../../components/Toggle/Toggle";
import { Search } from "lucide-react";
import { useAnnexesQuery } from "../queries/useAnnexesQuery";
import { useAnnexMutations } from "../mutations/useAnnexMutations";
import {
  buildBudgetVersionFromAnnexEdits,
  type AnnexItemEdit,
} from "../data/annexBudgetWriteBack";
import {
  AnnexSheet,
  annexEditKey,
  type AnnexEditsMap,
  type AnnexRowValues,
} from "../components/AnnexSheet";
import { BudgetChangesModal } from "../../budgets/components/BudgetChangesModal";
import styles from "../styles/AnnexPage.module.css";

/** Minuscula e sem acento, para a busca casar "Jaleco" com "JALECO". */
function normalizeSearchText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function AnnexDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const autoPrint = searchParams.get("print") === "1";

  const { data: annexes = [], isLoading: loadingAnnexes } = useAnnexesQuery();
  const annex = id ? annexes.find((a) => a.id === id) : undefined;

  const { budgets, fetchBudgetById, addBudget, fetchBudgets } = useBudgetStore();
  const { updateMutation } = useAnnexMutations();
  const { data: eventTemplates } = useEventsQuery();
  const budgetEvents = useMemo(
    () => buildBudgetEventsCatalog(eventTemplates),
    [eventTemplates],
  );

  const [budget, setBudget] = useState<Budget | undefined>(undefined);
  const [edits, setEdits] = useState<AnnexEditsMap>({});
  const [signatureNames, setSignatureNames] = useState<string[]>([]);
  // Eventos incluidos como cortesia so neste anexo. Nao tocam no orcamento.
  const [courtesyEventIds, setCourtesyEventIds] = useState<string[]>([]);
  const [courtesySearch, setCourtesySearch] = useState("");
  // Evento recem-marcado: a folha rola ate ele assim que a paginacao refizer as
  // paginas, para o usuario ver que entrou sem precisar salvar e reabrir.
  const [pendingScrollEventId, setPendingScrollEventId] = useState<string | null>(
    null,
  );
  const [loadedId, setLoadedId] = useState<string | null>(null);
  // Mesma lógica da impressão do orçamento: na visão do cliente os valores
  // dos itens só aparecem nos itens marcados como visíveis ao cliente.
  const [view, setView] = useState<"TEAM" | "CLIENT">("TEAM");
  const [saving, setSaving] = useState(false);
  const [changesFocus, setChangesFocus] = useState<
    { eventId: string; itemId: string } | undefined
  >(undefined);
  const [changesOpen, setChangesOpen] = useState(false);

  // Carrega o orçamento completo (form_data) ao qual o anexo está atrelado.
  useEffect(() => {
    if (!annex?.budget_id) return;
    const local = budgets.find((b) => b.id === annex.budget_id);
    if (local?.data) {
      setBudget(local);
      return;
    }
    void fetchBudgetById(annex.budget_id).then((fetched) => setBudget(fetched));
  }, [annex?.budget_id, budgets, fetchBudgetById]);

  // Campos de assinatura do anexo salvo.
  useEffect(() => {
    if (annex && annex.id !== loadedId) {
      setSignatureNames(
        Array.isArray(annex.signature_names) && annex.signature_names.length > 0
          ? annex.signature_names
          : ["", "", ""],
      );
      setCourtesyEventIds(
        Array.isArray(annex.courtesy_event_ids) ? annex.courtesy_event_ids : [],
      );
      setEdits({});
      setLoadedId(annex.id);
    }
  }, [annex, loadedId]);

  // Precisa do catálogo VIVO: sem ele o builder usa o catálogo estático e não
  // reconhece os eventos criados pela UI, devolvendo um anexo sem nenhum evento.
  const baseDoc = useMemo(
    () =>
      budget && budgetEvents.length > 0
        ? buildBudgetPrintDocument(budget, budgetEvents)
        : undefined,
    [budget, budgetEvents],
  );

  // Todos os eventos do catálogo. Os que já vêm do orçamento aparecem marcados
  // como atribuídos e travados — a coluna serve para conferir o que está no
  // anexo, não para inserir de novo o que já está.
  const courtesyCandidates = useMemo(() => {
    if (!baseDoc) return [];
    const inBudget = new Set(baseDoc.events.map((event) => event.eventId));
    return budgetEvents.map((event) => ({
      event,
      assigned: inBudget.has(event.id),
    }));
  }, [baseDoc, budgetEvents]);

  // A lista pode crescer: a busca filtra pelo título, sem acento nem caixa.
  const visibleCourtesyCandidates = useMemo(() => {
    const term = normalizeSearchText(courtesySearch);
    if (!term) return courtesyCandidates;
    return courtesyCandidates.filter((candidate) =>
      normalizeSearchText(candidate.event.title).includes(term),
    );
  }, [courtesyCandidates, courtesySearch]);

  // O documento impresso = eventos do orçamento + eventos cortesia escolhidos.
  const printDoc = useMemo(() => {
    if (!baseDoc) return undefined;
    if (courtesyEventIds.length === 0) return baseDoc;
    // Evento que entrou no orcamento depois de ter sido marcado como cortesia
    // sairia duas vezes na folha.
    const inBudget = new Set(baseDoc.events.map((event) => event.eventId));
    const extras = courtesyEventIds
      .filter((eventId) => !inBudget.has(eventId))
      .map((eventId) => budgetEvents.find((event) => event.id === eventId))
      .filter((event): event is (typeof budgetEvents)[number] => Boolean(event))
      .map((event) => buildCourtesyPrintEvent(event, baseDoc.studentsQuantity));
    return { ...baseDoc, events: [...baseDoc.events, ...extras] };
  }, [baseDoc, budgetEvents, courtesyEventIds]);

  // A âncora do evento só nasce depois que a folha é repaginada, o que leva mais
  // de um commit. Tenta por alguns frames em vez de assumir que já está no DOM.
  useEffect(() => {
    if (!pendingScrollEventId) return;
    let attempts = 0;
    let frame = 0;
    const tryScroll = () => {
      const target = document.getElementById(
        "annex-event-" + pendingScrollEventId,
      );
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        setPendingScrollEventId(null);
        return;
      }
      if (++attempts > 20) {
        setPendingScrollEventId(null);
        return;
      }
      frame = requestAnimationFrame(tryScroll);
    };
    frame = requestAnimationFrame(tryScroll);
    return () => cancelAnimationFrame(frame);
  }, [pendingScrollEventId]);

  // Impressão automática vinda do card da listagem.
  const printedRef = useRef(false);
  useEffect(() => {
    if (!autoPrint || !printDoc || printedRef.current) return;
    printedRef.current = true;
    const timer = setTimeout(() => window.print(), 600);
    return () => clearTimeout(timer);
  }, [autoPrint, printDoc]);

  if (loadingAnnexes || !annex) {
    return <LoadingStatePanel message="Carregando anexo contratual..." />;
  }
  if (!budget || !printDoc) {
    return <LoadingStatePanel message="Carregando orçamento do anexo..." />;
  }

  const hasEdits = Object.keys(edits).length > 0;

  const setEdit = (
    eventId: string,
    itemId: string,
    patch: Partial<AnnexRowValues>,
    fallback: AnnexRowValues,
  ) => {
    const key = annexEditKey(eventId, itemId);
    setEdits((prev) => ({
      ...prev,
      [key]: { ...fallback, ...prev[key], ...patch },
    }));
  };

  const scrollToEvent = (eventId: string) => {
    document
      .getElementById("annex-event-" + eventId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let nextBudgetId = annex.budget_id;

      // Alterações de item viram uma NOVA VERSÃO do orçamento (o aprovado fica
      // intacto) e o anexo passa a apontar para ela.
      if (hasEdits) {
        const itemEdits: AnnexItemEdit[] = Object.entries(edits).map(
          ([key, value]) => {
            const [eventId, itemId] = key.split("|");
            return {
              eventId,
              itemId,
              quantity: value.quantity,
              unitPrice: value.unitPrice,
            };
          },
        );

        const payload = buildBudgetVersionFromAnnexEdits({
          budget,
          edits: itemEdits,
          allBudgets: budgets,
          budgetEvents,
        });

        const createdId = await addBudget(payload);
        if (!createdId) {
          toast.error("Não foi possível gerar a nova versão do orçamento.");
          return;
        }
        nextBudgetId = createdId;
        toast.success(
          "Nova versão do orçamento criada com as alterações do anexo.",
        );
      }

      await new Promise<void>((resolve, reject) => {
        updateMutation.mutate(
          {
            id: annex.id,
            data: {
              budget_id: nextBudgetId,
              budget_code: annex.budget_code ?? null,
              title: annex.title || budget.instituicao,
              signature_date: null,
              signature_names: signatureNames,
              courtesy_event_ids: courtesyEventIds,
            },
          },
          { onSuccess: () => resolve(), onError: (e) => reject(e) },
        );
      });

      setEdits({});
      await fetchBudgets();
      navigate("/annexes");
    } catch {
      // o toast de erro vem da mutation
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.backLink}
        onClick={() => navigate("/annexes")}
      >
        <ArrowLeft size={16} /> Voltar para anexos
      </button>

      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Anexo Contratual</h1>
          <p className={styles.subtitle}>
            {budget.instituicao} - {budget.curso}
            {budget.budgetCode ? " - " + budget.budgetCode : ""}
            {budget.version ? " - v" + budget.version : ""}
          </p>
        </div>
        <div className={styles.viewToggle} role="group" aria-label="Visão do anexo">
          <button
            type="button"
            className={view === "TEAM" ? styles.viewActive : styles.viewOption}
            onClick={() => setView("TEAM")}
          >
            Visão equipe
          </button>
          <button
            type="button"
            className={view === "CLIENT" ? styles.viewActive : styles.viewOption}
            onClick={() => setView("CLIENT")}
          >
            Visão cliente
          </button>
        </div>
      </div>

      {hasEdits && (
        <div className={styles.warning}>
          <TriangleAlert size={16} />
          Há alterações não salvas. Ao salvar, será criada uma nova versão do
          orçamento com esses valores e o anexo passará a apontar para ela.
        </div>
      )}

      <div className={styles.annexLayout}>
      {courtesyCandidates.length > 0 && (
        <aside className={styles.courtesyPanel}>
          <div className={styles.courtesyTitle}>Eventos cortesia</div>
          <p className={styles.courtesyHint}>
            Entram só neste anexo, descritos sem valor. O orçamento atrelado não
            muda.
          </p>
          <div className={styles.courtesySearchWrap}>
            <Search size={14} className={styles.courtesySearchIcon} />
            <input
              className={styles.courtesySearch}
              type="search"
              placeholder="Buscar evento..."
              value={courtesySearch}
              onChange={(e) => setCourtesySearch(e.target.value)}
            />
          </div>
          <div className={styles.courtesyList}>
            {visibleCourtesyCandidates.map(({ event, assigned }) => (
              <Toggle
                key={event.id}
                className={
                  styles.courtesyItem +
                  (assigned ? " " + styles.courtesyAssigned : "")
                }
                label={event.title}
                hint={
                  assigned
                    ? "Já faz parte deste anexo pelo orçamento — não pode ser removido aqui."
                    : undefined
                }
                checked={assigned || courtesyEventIds.includes(event.id)}
                disabled={assigned}
                onChange={(e) => {
                  const adding = e.target.checked;
                  setCourtesyEventIds((prev) =>
                    adding
                      ? [...prev, event.id]
                      : prev.filter((id) => id !== event.id),
                  );
                  if (adding) {
                    setPendingScrollEventId(event.id);
                    toast.success(`${event.title} adicionado como cortesia.`);
                  } else {
                    toast.info(`${event.title} removido do anexo.`);
                  }
                }}
              />
            ))}
            {visibleCourtesyCandidates.length === 0 && (
              <p className={styles.courtesyEmpty}>Nenhum evento encontrado.</p>
            )}
          </div>
        </aside>
      )}

      <div className={styles.sheetWrap}>
        <AnnexSheet
          budget={budget}
          printDoc={printDoc}
          signatureNames={signatureNames}
          view={view}
          courtesyEventIds={courtesyEventIds}
          edits={edits}
          onEditChange={setEdit}
          onOpenChanges={(eventId, itemId) => {
            setChangesFocus({ eventId, itemId });
            setChangesOpen(true);
          }}
        />
      </div>
      </div>

      {/* Espaço para a barra fixa não cobrir o fim da folha. */}
      <div className={styles.actionBarSpacer} />

      {/* Índice dos eventos: barrinhas fixas que abrem a lista no hover. */}
      {printDoc.events.length > 1 && (
        <div className={styles.tocContainer}>
          <div className={styles.tocIndicators}>
            {printDoc.events.map((event) => (
              <div key={event.eventId} className={styles.tocBar} />
            ))}
          </div>
          <div className={styles.tocModal}>
            <div className={styles.tocModalTitle}>Eventos do anexo</div>
            {printDoc.events.map((event) => (
              <button
                key={event.eventId}
                type="button"
                className={styles.tocLink}
                onClick={() => scrollToEvent(event.eventId)}
              >
                {event.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.actionBar}>
        <span className={styles.actionBarInfo}>
          {hasEdits
            ? "Alterações pendentes — salvar cria uma nova versão do orçamento."
            : budget.instituicao + " - " + budget.curso}
        </span>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Plus size={14} />}
          onClick={() => setSignatureNames((prev) => [...prev, ""])}
        >
          Adicionar assinatura
        </Button>
        {signatureNames.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Minus size={14} />}
            onClick={() => setSignatureNames((prev) => prev.slice(0, -1))}
          >
            Remover última
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          leftIcon={<Printer size={16} />}
        >
          Imprimir / PDF
        </Button>
        <Button
          size="sm"
          onClick={() => void handleSave()}
          isLoading={saving}
          leftIcon={<Save size={16} />}
        >
          Salvar anexo
        </Button>
      </div>

      {changesOpen && (
        <BudgetChangesModal
          budget={budget}
          budgetEvents={budgetEvents}
          focus={changesFocus}
          onClose={() => setChangesOpen(false)}
        />
      )}
    </div>
  );
}
