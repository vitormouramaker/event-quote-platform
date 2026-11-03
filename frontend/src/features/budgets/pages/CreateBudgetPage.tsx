import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "../../../components/Button/Button";
import { ModalShell } from "../../../components/ModalShell/ModalShell";
import { ClientStep } from "../components/steps/ClientStep";
import { ItemsStep } from "../components/steps/ItemsStep";
import { SummaryStep } from "../components/steps/SummaryStep";
import { BudgetDerivedQuantitySync } from "../components/steps/BudgetDerivedQuantitySync";
import { LoadingStatePanel } from "../../../components/AsyncState/AsyncState";
import { BudgetCitySelectionModal } from "../components/BudgetCitySelectionModal";
import styles from "../styles/CreateBudgetPage.module.css";
import { useBudgetStore } from "../../../store/budgetStore";
import { useAuthStore } from "../../../store/authStore";
import { useDiscountRequestsStore } from "../../../store/DiscountRequestsStore";
import { useEventsQuery } from "../../events/queries/useEventsQuery";
import { useItemsQuery } from "../../items/queries/useItemsQuery";
import { useAuditoriumsQuery } from "../../auditoriums/queries/useAuditoriumsQuery";
import {
  buildBaseItemsCatalog,
  buildBudgetEventsCatalog,
  type BudgetCity,
} from "../data/budgetCatalog";
import {
  getParticipantDrivenAuditoriumPrice,
  isAuditoriumItemByIdOrName,
} from "../domain/budgetUiRules";
import { getParticipationQuantity } from "../data/runtimeBudgetRules";

const budgetSchema = z.object({
  instituicao: z.string().min(2, "Instituição é obrigatória"),
  curso: z.string().min(2, "Curso é obrigatório"),
  comissao: z.string().min(1, "Comissão é obrigatória"),
  telefone: z.string().min(1, "Telefone é obrigatório"),
  controle: z.string().optional(),
  budgetCity: z.string().min(1, "Selecione a cidade/local do orçamento"),
  eventStartDate: z.string().min(1, "Data de início é obrigatória"),
  eventEndDate: z.string().min(1, "Data de fim é obrigatória"),
  // Opcional: serve só como atalho para preencher a participação de todos os
  // eventos. A fonte de verdade dos cálculos é a participação POR EVENTO, validada
  // no ClientStep. Campo vazio vira undefined via setValueAs no register (não usa
  // z.preprocess: ele deixa o input type como unknown e quebra o Resolver no build).
  studentsQuantity: z.number().min(0).optional(),
  status: z.enum(["PENDING", "APPROVED", "CANCELLED"]).optional(),
  observation: z.string().optional(),
  participation_itens_descerramento: z.number().optional(),
  participation_descerramento: z.number().optional(),
  participation_aula_saudade: z.number().optional(),
  participation_missa_culto: z.number().optional(),
  participation_colacao_descerramento: z.number().optional(),
  participation_colacao: z.number().optional(),
  participation_festa_50: z.number().optional(),
  participation_ensaio: z.number().optional(),
  participation_festa_365: z.number().optional(),
  participation_cobertura: z.number().optional(),
  participation_missa: z.number().optional(),
  participation_culto: z.number().optional(),
  participation_evento_100: z.number().optional(),
  selectedEvents: z.array(z.string()).min(1, "Selecione pelo menos um evento"),
  // Ordem personalizada dos eventos deste orçamento (DnD no step 2). Vazio = ordem
  // canônica. Vale só para este orçamento.
  eventOrder: z.array(z.string()).optional(),
  items: z.any().optional(),
  installmentsOverride: z.number().nullable().optional(),
  customItems: z
    .record(
      z.string(),
      z.object({
        added: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            unitPrice: z.number(),
            quantity: z.number(),
            isNoFixedValue: z.boolean().optional(),
            originalId: z.string().optional(),
            originalEventId: z.string().optional(),
            quantityEditable: z.boolean().optional(),
            priceEditable: z.boolean().optional(),
            displayValue: z.string().optional(),
            quantityDisplay: z.string().optional(),
            hasSubitems: z.boolean().optional(),
            selectedVariationId: z.string().optional(),
            variations: z
              .array(
                z.object({
                  id: z.string(),
                  name: z.string(),
                  unit_price: z.number(),
                  default_quantity: z.number(),
                }),
              )
              .optional(),
            subitems: z
              .array(
                z.object({
                  name: z.string(),
                }),
              )
              .optional(),
          }),
        ),
        removedIds: z.array(z.string()),
      }),
    )
    .optional(),
  discountPercent: z.number().optional(),
  schemaVersion: z.number().optional(),
});

export type BudgetFormData = z.infer<typeof budgetSchema>;

type CreateBudgetLocationState = {
  budgetCity?: BudgetCity;
} | null;

function inferBudgetCityFromExistingBudget(
  existingBudgetData: unknown,
  budgetEvents: ReturnType<typeof buildBudgetEventsCatalog>,
): BudgetCity | undefined {
  if (!existingBudgetData || typeof existingBudgetData !== "object") return undefined;

  const budgetCity = (existingBudgetData as { budgetCity?: BudgetCity }).budgetCity;
  if (typeof budgetCity === "string" && budgetCity.trim()) return budgetCity;

  const selectedEvents = (existingBudgetData as { selectedEvents?: unknown }).selectedEvents;
  if (!Array.isArray(selectedEvents)) return undefined;

  const firstMatchedEvent = selectedEvents
    .map((eventId) => budgetEvents.find((event) => event.id === String(eventId)))
    .find(Boolean);

  return firstMatchedEvent?.city;
}

export function CreateBudgetPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const { getBudgetById, fetchBudgetById } = useBudgetStore();
  const clearRelockGuardBudgetDirty = useDiscountRequestsStore(
    (state) => state.clearRelockGuardBudgetDirty,
  );
  const fetchDiscountRequestsByBudget = useDiscountRequestsStore(
    (state) => state.fetchByBudget,
  );
  const { user } = useAuthStore();
  const { data: eventTemplates, isLoading: eventsLoading } = useEventsQuery();
  const { data: baseItems, isLoading: itemsLoading } = useItemsQuery();
  // Carrega auditórios vivos → patchAuditoriumsSelector popula o select do
  // orçamento com auditórios criados pela UI (senão só aparecem os do seed).
  useAuditoriumsQuery();

  const existingBudget = id ? getBudgetById(id) : undefined;
  const isAdmin = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";
  const isBudgetAnalyst = user?.role === "ADM_ANALISTA_ORCAMENTO";
  const budgetEvents = useMemo(() => buildBudgetEventsCatalog(eventTemplates), [eventTemplates]);
  const budgetBaseItems = useMemo(() => buildBaseItemsCatalog(baseItems), [baseItems]);
  const locationState = location.state as CreateBudgetLocationState;
  const initialBudgetCity = locationState?.budgetCity;

  const [step, setStep] = useState(1);
  const [isResolvingBudget, setIsResolvingBudget] = useState(Boolean(id));
  const [hasResolvedBudgetLookup, setHasResolvedBudgetLookup] = useState(!id);
  const [isBudgetCityModalOpen, setIsBudgetCityModalOpen] = useState(
    () => !id && !initialBudgetCity,
  );
  const [isExitConfirmModalOpen, setIsExitConfirmModalOpen] = useState(false);
  const allowNavigationRef = useRef(false);

  const methods = useForm<BudgetFormData>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      budgetCity: initialBudgetCity,
      selectedEvents: [],
      studentsQuantity: 0,
      discountPercent: 0,
      schemaVersion: 2,
    },
  });

  useEffect(() => {
    let active = true;

    if (!id) {
      setIsResolvingBudget(false);
      setHasResolvedBudgetLookup(true);
      return;
    }

    setIsResolvingBudget(true);
    setHasResolvedBudgetLookup(false);

    Promise.all([
      fetchBudgetById(id),
      fetchDiscountRequestsByBudget(id),
    ]).finally(() => {
      if (!active) return;
      setIsResolvingBudget(false);
      setHasResolvedBudgetLookup(true);
    });

    return () => {
      active = false;
    };
  }, [id, fetchBudgetById, fetchDiscountRequestsByBudget]);

  // Hidrata o formulário UMA vez por orçamento. Sem esse guard, qualquer novo
  // reference de `existingBudget` ou `budgetEvents` (ex.: refetch do react-query ao
  // focar a janela) re-disparava o reset e apagava as edições do usuário — inclusive
  // as datas, que "não salvavam". Espera o catálogo carregar para inferir a cidade.
  const hydratedBudgetIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!existingBudget || budgetEvents.length === 0) return;
    if (hydratedBudgetIdRef.current === existingBudget.id) return;
    hydratedBudgetIdRef.current = existingBudget.id;

    clearRelockGuardBudgetDirty(existingBudget.id);
    const resolvedBudgetCity =
      inferBudgetCityFromExistingBudget(existingBudget.data, budgetEvents) ?? "Capital";
    methods.reset({
      ...(existingBudget.data ?? {}),
      budgetCity: resolvedBudgetCity,
      id: existingBudget.id,
      status: existingBudget.status,
    } as never);
  }, [existingBudget, methods, clearRelockGuardBudgetDirty, budgetEvents]);

  // Backfill: orçamentos salvos ANTES do flag `_price_manual` existir não têm o
  // sinal de "manual". Ao reabrir, se o preço salvo do auditório difere do padrão
  // por formandos, gravamos o flag para o auto-preenchimento não sobrescrever a
  // escolha. Roda no load (antes de montar o passo 2). Orçamentos novos já trazem
  // o flag persistido, então caem no early-return `alreadyManual`.
  useEffect(() => {
    if (!existingBudget) return;
    const values = methods.getValues() as Record<string, unknown>;
    const selected = Array.isArray(values.selectedEvents) ? (values.selectedEvents as string[]) : [];
    const itemsMap = (values.items ?? {}) as Record<string, Record<string, unknown>>;
    const fallbackQty = Number(values.studentsQuantity) || 1;
    budgetEvents
      .filter((event) => selected.includes(event.id))
      .forEach((event) => {
        const participation =
          getParticipationQuantity(values, event.id, fallbackQty) || fallbackQty;
        const defaultPrice = getParticipantDrivenAuditoriumPrice(participation);
        event.items.forEach((item) => {
          if (!isAuditoriumItemByIdOrName(item.id, item.name)) return;
          const eventItems = (itemsMap?.[event.id] ?? {}) as Record<string, unknown>;
          if (eventItems[`${item.id}_price_manual`]) return;
          const savedPrice = Number(eventItems[`${item.id}_price`]);
          if (Number.isFinite(savedPrice) && savedPrice > 0 && savedPrice !== defaultPrice) {
            methods.setValue(`items.${event.id}.${item.id}_price_manual`, true, {
              shouldDirty: false,
              shouldValidate: false,
            });
          }
        });
      });
  }, [existingBudget, budgetEvents, methods]);

  useEffect(() => {
    if (id || !initialBudgetCity) return;

    const currentBudgetCity = methods.getValues("budgetCity");
    if (currentBudgetCity === initialBudgetCity) return;

    methods.setValue("budgetCity", initialBudgetCity, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: true,
    });
  }, [id, initialBudgetCity, methods]);

  useEffect(() => {
    if (id) {
      setIsBudgetCityModalOpen(false);
      return;
    }

    if (initialBudgetCity) {
      setIsBudgetCityModalOpen(false);
    }
  }, [id, initialBudgetCity]);

  useEffect(() => {
    if (isBudgetAnalyst) {
      navigate("/budgets", { replace: true });
      return;
    }

    if (!id || !hasResolvedBudgetLookup) return;

    if (!existingBudget) {
      navigate("/budgets", { replace: true });
      return;
    }

    const ownerName = existingBudget.createdByName || existingBudget.createdBy;
    if (!isAdmin && ownerName !== user?.name) {
      navigate("/budgets", { replace: true });
    }
  }, [id, hasResolvedBudgetLookup, existingBudget, isAdmin, isBudgetAnalyst, user?.name, navigate]);

  const nextStep = () => setStep((currentStep) => currentStep + 1);
  const prevStep = () => setStep((currentStep) => currentStep - 1);
  const selectedBudgetCity = methods.watch("budgetCity");
  const selectedEvents = methods.watch("selectedEvents");
  const customItems = methods.watch("customItems");
  const hasUnsavedBudgetProgress = id
    ? methods.formState.isDirty
    : (
      methods.formState.isDirty ||
      Boolean(selectedBudgetCity) ||
      (Array.isArray(selectedEvents) && selectedEvents.length > 0) ||
      Boolean(customItems && Object.keys(customItems).length > 0) ||
      step > 1
    );
  const shouldBlockBudgetExit = hasUnsavedBudgetProgress && !allowNavigationRef.current;

  // Função (não boolean) para o blocker reler o ref no momento da navegação.
  // Ao salvar/criar, allowNavigationRef é marcado antes do navigate, então
  // o modal de saída sem salvar não dispara.
  const blocker = useBlocker(
    useCallback(
      () => hasUnsavedBudgetProgress && !allowNavigationRef.current,
      [hasUnsavedBudgetProgress],
    ),
  );

  const allowBudgetExitForSave = useCallback(() => {
    allowNavigationRef.current = true;
  }, []);

  useEffect(() => {
    if (blocker.state === "blocked") {
      setIsExitConfirmModalOpen(true);
    }
  }, [blocker.state]);

  useEffect(() => {
    if (!shouldBlockBudgetExit) return undefined;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldBlockBudgetExit]);

  const handleStayOnBudgetPage = () => {
    setIsExitConfirmModalOpen(false);
    if (blocker.state === "blocked") {
      blocker.reset();
    }
  };

  // Volta para a lista de onde o usuario veio (aba/pasta de versoes/pagina),
  // nao para a aba de originais.
  const cameFrom = (location.state as { from?: string } | null)?.from;
  const returnToList = cameFrom ?? "/budgets";

  // Breadcrumb do caminho percorrido. So aparece quando o usuario veio da tela
  // de Orcamentos — vindo de Aprovacoes ou de link direto nao ha caminho a
  // mostrar, entao nao renderiza nada.
  const breadcrumb = useMemo(() => {
    if (!cameFrom || !cameFrom.startsWith("/budgets")) return null;

    const query = new URLSearchParams(cameFrom.split("?")[1] ?? "");
    const tab = query.get("tab");
    const folderCode = query.get("code");
    const crumbs: Array<{ label: string; to?: string }> = [];

    if (tab === "versions") {
      crumbs.push({ label: "Orçamentos", to: "/budgets" });
      // O nivel de origem leva a URL completa (mantem a pagina em que estava).
      crumbs.push({
        label: "Versões",
        to: folderCode ? "/budgets?tab=versions" : cameFrom,
      });
      if (folderCode) crumbs.push({ label: folderCode, to: cameFrom });
    } else if (tab === "archived") {
      crumbs.push({ label: "Orçamentos", to: "/budgets" });
      crumbs.push({ label: "Arquivados", to: cameFrom });
    } else {
      crumbs.push({ label: "Orçamentos", to: cameFrom });
    }

    const current = existingBudget?.parentId
      ? `Versão ${existingBudget.version ?? ""}`.trim()
      : existingBudget?.instituicao || "Orçamento";
    crumbs.push({ label: current });

    return crumbs;
  }, [cameFrom, existingBudget]);

  const handleConfirmExitBudget = () => {
    allowNavigationRef.current = true;
    setIsExitConfirmModalOpen(false);

    if (blocker.state === "blocked") {
      blocker.proceed();
      return;
    }

    navigate(returnToList);
  };

  if (id && !hasResolvedBudgetLookup) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Carregando orçamento...</h1>
        </header>
      </div>
    );
  }

  if (eventsLoading || itemsLoading) {
    return <LoadingStatePanel message="Carregando catálogos do orçamento..." />;
  }

  return (
    <FormProvider {...methods}>
      <BudgetDerivedQuantitySync budgetEvents={budgetEvents} />
      <div className={styles.container}>
        {breadcrumb ? (
          <nav className={styles.breadcrumb} aria-label="Caminho percorrido">
            {breadcrumb.map((crumb, index) => {
              const isLast = index === breadcrumb.length - 1;
              return (
                <span key={`${crumb.label}-${index}`} className={styles.breadcrumbItem}>
                  {crumb.to && !isLast ? (
                    <button
                      type="button"
                      className={styles.breadcrumbLink}
                      onClick={() => navigate(crumb.to as string)}
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span className={styles.breadcrumbCurrent} aria-current="page">
                      {crumb.label}
                    </span>
                  )}
                  {!isLast ? (
                    <ChevronRight size={14} className={styles.breadcrumbSep} />
                  ) : null}
                </span>
              );
            })}
          </nav>
        ) : null}

        <header className={styles.header}>
          <h1 className={styles.title}>
            {isResolvingBudget
              ? "Carregando orçamento..."
              : id
                ? "Editar Orçamento"
                : "Novo Orçamento"}
          </h1>
          {!isResolvingBudget && selectedBudgetCity ? (
            <p className={styles.subtitle}>Cidade/Local {selectedBudgetCity}</p>
          ) : null}
        </header>

        <div className={styles.content}>
          <div className={styles.stepper}>
            <div className={`${styles.step} ${step >= 1 ? styles.active : ""}`}>
              1. Dados do Cliente e Eventos
            </div>
            <div className={styles.divider} />
            <div className={`${styles.step} ${step >= 2 ? styles.active : ""}`}>
              2. Itens e Valores
            </div>
            <div className={styles.divider} />
            <div className={`${styles.step} ${step >= 3 ? styles.active : ""}`}>
              3. Finalizar
            </div>
          </div>

          <div className={styles.stepContent}>
            {step === 1 && <ClientStep onNext={nextStep} budgetEvents={budgetEvents} />}
            {step === 2 && (
              <ItemsStep
                onNext={nextStep}
                onBack={prevStep}
                budgetEvents={budgetEvents}
                baseItems={budgetBaseItems}
              />
            )}
            {step === 3 && (
              <SummaryStep
                onBack={prevStep}
                budgetEvents={budgetEvents}
                onBeforeSaveNavigate={allowBudgetExitForSave}
              />
            )}
          </div>
        </div>

        <BudgetCitySelectionModal
          isOpen={isBudgetCityModalOpen}
          onSelect={(city) => {
            setIsBudgetCityModalOpen(false);
            methods.setValue("budgetCity", city, {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true,
            });
          }}
          onCancel={() => {
            allowNavigationRef.current = true;
            navigate(returnToList);
          }}
        />

        {isExitConfirmModalOpen && (
          <ModalShell
            maxWidth="520px"
            onBackdropClick={handleStayOnBudgetPage}
            panelStyle={{ padding: "32px" }}
          >
            <div className={styles.exitModal}>
              <div className={styles.exitModalHeader}>
                <h2 className={styles.exitModalTitle}>Sair sem salvar o orçamento?</h2>
                <p className={styles.exitModalDescription}>
                  {id
                    ? "Existem alterações não salvas neste orçamento. Se sair agora, as edições serão perdidas."
                    : "Você está criando um novo orçamento e existem alterações em andamento. Se sair agora, todo o progresso não salvo será perdido e essa ação é irreversível."}
                </p>
              </div>

              <div className={styles.exitModalActions}>
                <Button variant="outline" onClick={handleStayOnBudgetPage}>
                  Continuar editando
                </Button>
                <Button
                  onClick={handleConfirmExitBudget}
                  style={{ backgroundColor: "var(--color-error)", borderColor: "var(--color-error)" }}
                >
                  Sair sem salvar
                </Button>
              </div>
            </div>
          </ModalShell>
        )}
      </div>
    </FormProvider>
  );
}
