import { useEffect, useMemo, useRef } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Input } from "../../../../components/Input/Input";
import { Button } from "../../../../components/Button/Button";
import {
  filterBudgetEventsByCity,
  orderSelectedEvents,
  resolveCanonicalEventSlugByTitle,
  type BudgetCatalogEvent,
} from "../../data/budgetCatalog";
import {
  getDerivedItemRules,
  getEventParticipationFieldMap,
  getParticipationField,
  resolveRuleQuantity,
} from "../../data/runtimeBudgetRules";
import { resolveRuntimeCanonicalEventSlug } from "../../migration/canonicalRuntimeConfig";
import { shouldSyncHydratedField } from "./formHydrationGuard";
import { useCitiesQuery } from "../../../cities/queries/useCitiesQuery";
import styles from "./Steps.module.css";

interface ClientStepProps {
  onNext: () => void;
  budgetEvents: BudgetCatalogEvent[];
}

// Grupo mutuamente exclusivo (slugs canônicos): marcar um anula/bloqueia os
// outros dois.
const EXCLUSIVE_GROUP = [
  "itens_descerramento_placa",
  "descerramento_placa",
  "colacao_descerramento",
];

// Eventos com a flag `requires_min_events` só ficam disponíveis quando há pelo
// menos este número de OUTROS eventos selecionados (o próprio não conta).
const MIN_OTHER_EVENTS_REQUIRED = 4;

// O id do evento vindo da API pode ser UUID (não o slug). Resolve o slug
// canônico pelo título — mesma estratégia de sortEventsByCanonicalOrder — com
// fallback pelo alias do próprio id.
const resolveEventCanonicalSlug = (event: BudgetCatalogEvent): string =>
  resolveCanonicalEventSlugByTitle(event.title) ??
  resolveRuntimeCanonicalEventSlug(event.id);

export function ClientStep({ onNext, budgetEvents }: ClientStepProps) {
  const {
    register,
    formState: { errors, dirtyFields, isDirty },
    trigger,
    setValue,
    setError,
    clearErrors,
    getValues,
    control,
  } = useFormContext();

  const studentsQuantity = useWatch({ control, name: "studentsQuantity" });
  const selectedEvents = useWatch({ control, name: "selectedEvents" }) || [];
  const budgetCity = useWatch({ control, name: "budgetCity" });
  const participationFieldMap = useMemo(() => getEventParticipationFieldMap(), []);
  const derivedItemRules = useMemo(() => getDerivedItemRules(), []);
  const { data: cities = [] } = useCitiesQuery();

  const participationValues = useWatch({ control, name: Object.values(participationFieldMap) });
  const eventOrder = useWatch({ control, name: "eventOrder" }) as
    | string[]
    | undefined;
  // "Marque os eventos" reflete a ordem definida no step 2 (eventOrder) para os
  // eventos deste orçamento; os demais seguem a ordem canônica.
  const visibleBudgetEvents = orderSelectedEvents(
    filterBudgetEventsByCity(budgetEvents, budgetCity as string | undefined),
    eventOrder,
  );

  // Ids (reais, como vêm da API) dos eventos visíveis que pertencem ao grupo
  // exclusivo — resolvidos pelo slug canônico do título.
  const exclusiveEventIds = useMemo(() => {
    const ids = new Set<string>();
    visibleBudgetEvents.forEach((event) => {
      if (EXCLUSIVE_GROUP.includes(resolveEventCanonicalSlug(event))) {
        ids.add(event.id);
      }
    });
    return ids;
  }, [visibleBudgetEvents]);

  // Peso de cada evento no limite de eventos mínimos (requires_min_events).
  // "Colação + descerramento no mesmo local" representa 2 eventos, então conta em
  // dobro: colação+descerramento + 2 outros diferentes (=4) habilita o 100 dias.
  const eventMinCountWeightById = useMemo(() => {
    const map = new Map<string, number>();
    budgetEvents.forEach((event) => {
      map.set(
        event.id,
        resolveEventCanonicalSlug(event) === "colacao_descerramento" ? 2 : 1,
      );
    });
    return map;
  }, [budgetEvents]);

  // "Selecionar tudo" respeitando exclusividade: do grupo, mantém só um (o já
  // marcado ou o primeiro visível).
  const selectAllTargetIds = useMemo(() => {
    const visibleIds = visibleBudgetEvents.map(({ id }) => id);
    const keepGroupId =
      (selectedEvents as string[]).find((id) => exclusiveEventIds.has(id)) ??
      visibleIds.find((id) => exclusiveEventIds.has(id));
    return visibleIds.filter(
      (id) => !exclusiveEventIds.has(id) || id === keepGroupId,
    );
  }, [visibleBudgetEvents, selectedEvents, exclusiveEventIds]);

  const syncDerivedItem = (fieldPath: string, nextValue: number) => {
    const currentValue = getValues(fieldPath);
    const canSync = shouldSyncHydratedField({
      currentValue,
      dirtyFields,
      fieldPath,
      hasPersistedBudgetId: Boolean(getValues("id")),
      isFormDirty: isDirty,
    });

    if (!canSync) return;

    setValue(fieldPath, nextValue, { shouldValidate: true });
  };

  const toggleSelectedEvent = (eventId: string, participationField: string) => {
    const currentSelection = new Set(selectedEvents as string[]);

    if (currentSelection.has(eventId)) {
      currentSelection.delete(eventId);
    } else {
      // Exclusividade: ao marcar um do grupo, remove os outros dois.
      if (exclusiveEventIds.has(eventId)) {
        exclusiveEventIds.forEach((id) => {
          if (id !== eventId) currentSelection.delete(id);
        });
      }
      currentSelection.add(eventId);

      const currentParticipation = Number(getValues(participationField)) || 0;
      const generalQty = Number(getValues("studentsQuantity")) || 0;

      if (currentParticipation <= 0 && generalQty > 0) {
        setValue(participationField, generalQty, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    }

    setValue("selectedEvents", Array.from(currentSelection), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleSelectAllEvents = () => {
    const areAllSelected =
      selectAllTargetIds.length > 0 &&
      selectAllTargetIds.every((eventId) => (selectedEvents as string[]).includes(eventId));

    if (areAllSelected) {
      const visibleEventIds = new Set(visibleBudgetEvents.map(({ id }) => id));
      setValue(
        "selectedEvents",
        (selectedEvents as string[]).filter((eventId) => !visibleEventIds.has(eventId)),
        { shouldDirty: true, shouldValidate: true },
      );
      return;
    }

    const generalQty = Number(getValues("studentsQuantity")) || 0;
    selectAllTargetIds.forEach((eventId) => {
      const field = getParticipationField(eventId);
      const currentParticipation = Number(getValues(field)) || 0;
      if (currentParticipation <= 0 && generalQty > 0) {
        setValue(field, generalQty, { shouldDirty: true, shouldValidate: true });
      }
    });

    // Mantém selecionados não-visíveis; do grupo, só o alvo.
    const preserved = (selectedEvents as string[]).filter(
      (id) => !exclusiveEventIds.has(id) || selectAllTargetIds.includes(id),
    );
    setValue(
      "selectedEvents",
      Array.from(new Set([...preserved, ...selectAllTargetIds])),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  // "Qtd. geral de formandos" comanda os eventos selecionados: ao MUDAR o valor
  // geral, todos os eventos ativos recebem a nova quantidade (dinâmico), INCLUSIVE
  // 0. Campo VAZIO não propaga (usuário no meio da edição). Usa o id real do evento
  // (getParticipationField) — cobre canônicos e os criados pela UI (id numérico).
  const hasInitializedGeneralQtyRef = useRef(false);
  const prevGeneralQtyRef = useRef<number | null>(null);
  useEffect(() => {
    const raw = studentsQuantity;
    const isEmpty =
      raw === "" ||
      raw === null ||
      raw === undefined ||
      (typeof raw === "number" && Number.isNaN(raw));
    const qty = Number(raw);
    const currentNumeric = isEmpty || !Number.isFinite(qty) ? null : qty;
    const prev = prevGeneralQtyRef.current;
    prevGeneralQtyRef.current = currentNumeric;

    // Primeira execução (mount/hidratação): registra sem propagar, para não
    // sobrescrever quantidades já salvas ao reabrir um orçamento.
    if (!hasInitializedGeneralQtyRef.current) {
      hasInitializedGeneralQtyRef.current = true;
      return;
    }
    if (currentNumeric === null) return; // campo vazio: aguarda um número
    if (currentNumeric === prev) return; // não foi o campo geral que mudou (ex.: seleção)

    const hasPersistedBudgetId = Boolean(getValues("id"));
    (selectedEvents as string[]).forEach((eventId) => {
      const field = getParticipationField(eventId);
      const currentValue = getValues(field);
      // Preserva quantidades salvas ao reabrir orçamento, antes de qualquer edição.
      if (hasPersistedBudgetId && !isDirty && currentValue !== undefined) return;
      if (Number(currentValue) !== currentNumeric) {
        setValue(field, currentNumeric, { shouldDirty: true, shouldValidate: true });
      }
    });
  }, [studentsQuantity, selectedEvents, getValues, isDirty, setValue]);

  useEffect(() => {
    const visibleEventIds = new Set(visibleBudgetEvents.map((event) => event.id));
    const normalizedSelection = (selectedEvents as string[]).filter((eventId) =>
      visibleEventIds.has(eventId),
    );

    if (normalizedSelection.length === (selectedEvents as string[]).length) return;

    setValue("selectedEvents", normalizedSelection, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [selectedEvents, setValue, visibleBudgetEvents]);

  // Mantém a regra "só disponível com 4+ outros eventos": se um evento marcado
  // com requires_min_events cair abaixo do mínimo de outros eventos, desmarca-o.
  useEffect(() => {
    const selected = selectedEvents as string[];
    if (selected.length === 0) return;
    const eventById = new Map(budgetEvents.map((event) => [event.id, event]));
    const removeSet = new Set(
      selected.filter((eventId) => {
        const event = eventById.get(eventId);
        if (!event?.requires_min_events) return false;
        const others = selected
          .filter((id) => id !== eventId)
          .reduce((sum, id) => sum + (eventMinCountWeightById.get(id) ?? 1), 0);
        return others < MIN_OTHER_EVENTS_REQUIRED;
      }),
    );
    if (removeSet.size === 0) return;
    setValue(
      "selectedEvents",
      selected.filter((id) => !removeSet.has(id)),
      { shouldDirty: true, shouldValidate: true },
    );
  }, [selectedEvents, budgetEvents, eventMinCountWeightById, setValue]);

  useEffect(() => {
    const participationByEvent = Object.entries(participationFieldMap).reduce<Record<string, number>>(
      (acc, [eventId, fieldName]) => {
        acc[eventId] = Number(getValues(fieldName)) || 0;
        return acc;
      },
      {},
    );

    derivedItemRules.forEach((rule) => {
      const baseQty = participationByEvent[rule.eventId] ?? 0;
      const nextQty = resolveRuleQuantity(baseQty, rule.quantity);
      syncDerivedItem(`items.${rule.eventId}.${rule.itemId}`, nextQty);
    });
  }, [participationValues, dirtyFields, derivedItemRules, getValues, isDirty, participationFieldMap, setValue]);

  const handleNext = async () => {
    const isValid = await trigger([
      "instituicao",
      "curso",
      "comissao",
      "telefone",
      "budgetCity",
      "eventStartDate",
      "eventEndDate",
      "selectedEvents",
    ]);

    // "Qtd. geral de formandos" é opcional (só atalho). A participação POR EVENTO
    // é a fonte de verdade dos cálculos: cada evento selecionado precisa de >= 1.
    let participationOk = true;
    const selected = (getValues("selectedEvents") as string[]) || [];
    selected.forEach((eventId) => {
      const field = getParticipationField(eventId);
      const qty = Number(getValues(field)) || 0;
      if (qty < 1) {
        participationOk = false;
        setError(field, {
          type: "manual",
          message: "Informe a qtd. de formandos deste evento",
        });
      } else {
        clearErrors(field);
      }
    });

    if (isValid && participationOk) {
      onNext();
    }
  };

  const areAllSelected =
    selectAllTargetIds.length > 0 &&
    selectAllTargetIds.every((eventId) => (selectedEvents as string[]).includes(eventId));

  return (
    <div className={styles.container}>
      <h2 className={styles.sectionTitle}>Informações Iniciais</h2>

      <div className={styles.initialInfoGrid}>
        <Input
          label="Instituição de Ensino"
          placeholder="Ex: UNIDEMO, UNIEXEMPLO"
          required
          error={errors.instituicao?.message as string}
          wrapperClassName={styles.span7}
          {...register("instituicao", { required: "Campo obrigatório" })}
        />

        <Input
          label="Curso / Turma"
          placeholder="Ex: Medicina 2026"
          required
          error={errors.curso?.message as string}
          wrapperClassName={styles.span5}
          {...register("curso", { required: "Campo obrigatório" })}
        />

        <Input
          label="Comissão de Formatura"
          placeholder="Nome do Representante"
          required
          error={errors.comissao?.message as string}
          wrapperClassName={styles.span6}
          {...register("comissao", { required: "Campo obrigatório" })}
        />

        <Input
          label="Telefone da Comissão"
          placeholder="(00) 00000-0000"
          required
          error={errors.telefone?.message as string}
          wrapperClassName={styles.span3}
          {...register("telefone", { required: "Campo obrigatório" })}
        />

        <Input
          label="Número de Controle"
          placeholder="001/24"
          wrapperClassName={styles.span3}
          {...register("controle")}
        />

        <div
          className={styles.span4}
          style={{ display: "flex", flexDirection: "column", gap: "6px" }}
        >
          <label style={{ fontSize: "14px", fontWeight: 500 }}>
            Cidade/Local do Orçamento
          </label>
          <select
            {...register("budgetCity")}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              backgroundColor: "var(--color-background)",
              color: "var(--color-text-main)",
            }}
          >
            <option value="" disabled>
              Selecione...
            </option>
            {cities.map((city) => (
              <option key={city.id} value={city.name}>
                Cidade/Local {city.name}
              </option>
            ))}
          </select>
          {errors.budgetCity?.message ? (
            <span style={{ fontSize: "12px", color: "var(--color-error)" }}>
              {errors.budgetCity.message as string}
            </span>
          ) : null}
        </div>

        <Input
          label="Data de Início"
          type="date"
          required
          error={errors.eventStartDate?.message as string}
          wrapperClassName={styles.span4}
          {...register("eventStartDate")}
        />

        <Input
          label="Data de Fim"
          type="date"
          required
          error={errors.eventEndDate?.message as string}
          wrapperClassName={styles.span4}
          {...register("eventEndDate")}
        />

        <Input
          label="Qtd. Geral de Formandos (opcional)"
          type="number"
          placeholder="Preenche todos os eventos"
          error={errors.studentsQuantity?.message as string}
          wrapperClassName={styles.span4}
          {...register("studentsQuantity", {
            setValueAs: (v) =>
              v === "" || v === null || v === undefined ? undefined : Number(v),
          })}
        />
      </div>

      <div className={styles.divider} />

      <h3 className={styles.subTitle}>Quantidades por Evento (Participação)</h3>
      <p className={styles.description}>
        Selecione os eventos que farão parte do orçamento. Ao marcar um evento,
        a quantidade de formandos dele abre automaticamente preenchida com a
        quantidade geral, podendo ser ajustada individualmente.
      </p>

      <div className={styles.eventSelectionHeader}>
        <span className={styles.eventSelectionHint}>Marque os eventos desejados</span>
        <Button
          variant="outline"
          onClick={handleSelectAllEvents}
          disabled={visibleBudgetEvents.length === 0}
          style={{ height: "auto", padding: "6px 12px", fontSize: "13px" }}
        >
          {areAllSelected ? "Desmarcar tudo" : "Selecionar tudo"}
        </Button>
      </div>

      <div className={styles.eventSelectionGrid}>
        {visibleBudgetEvents.map((event) => {
          const eventId = event.id;
          const field = getParticipationField(eventId);
          const isSelected = (selectedEvents as string[]).includes(eventId);
          const exclusiveBlocked =
            exclusiveEventIds.has(eventId) &&
            !isSelected &&
            Array.from(exclusiveEventIds).some(
              (id) => id !== eventId && (selectedEvents as string[]).includes(id),
            );
          const otherSelectedCount = (selectedEvents as string[])
            .filter((id) => id !== eventId)
            .reduce((sum, id) => sum + (eventMinCountWeightById.get(id) ?? 1), 0);
          const minEventsBlocked =
            Boolean(event.requires_min_events) &&
            !isSelected &&
            otherSelectedCount < MIN_OTHER_EVENTS_REQUIRED;
          const isBlocked = exclusiveBlocked || minEventsBlocked;
          const currentParticipation = Number(getValues(field)) || Number(studentsQuantity) || 0;

          return (
            <div
              key={eventId}
              className={`${styles.eventSelectionCard} ${isSelected ? styles.eventSelectionCardSelected : ""} ${isBlocked ? styles.eventSelectionCardDisabled : ""}`}
            >
              <button
                type="button"
                className={styles.eventSelectionToggle}
                onClick={() => toggleSelectedEvent(eventId, field)}
                disabled={isBlocked}
                title={
                  exclusiveBlocked
                    ? "Opção indisponível: já há um evento de descerramento selecionado."
                    : minEventsBlocked
                      ? `Selecione ao menos ${MIN_OTHER_EVENTS_REQUIRED} outros eventos para habilitar este evento.`
                      : undefined
                }
              >
                <span
                  className={`${styles.eventSelectionCheckbox} ${isSelected ? styles.eventSelectionCheckboxChecked : ""}`}
                >
                  {isSelected ? "✓" : ""}
                </span>
                <span className={styles.eventSelectionLabel}>
                  {event?.title || eventId}
                </span>
              </button>

              {isSelected ? (
                <div className={styles.eventSelectionInput}>
                  <Input
                    label="Qtd. de formandos do evento"
                    type="number"
                    placeholder="0"
                    defaultValue={currentParticipation}
                    error={errors[field]?.message as string | undefined}
                    {...register(field, {
                      valueAsNumber: true,
                      onChange: (e) => {
                        if (Number(e.target.value) >= 1) clearErrors(field);
                      },
                    })}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {visibleBudgetEvents.length === 0 ? (
        <p className={styles.description}>
          Nenhum evento cadastrado para{" "}
          {budgetCity ? `Cidade/Local ${budgetCity}` : "essa cidade"}.
        </p>
      ) : null}

      {errors.selectedEvents?.message ? (
        <p className={styles.eventSelectionError}>
          {errors.selectedEvents.message as string}
        </p>
      ) : null}

      <div className={styles.actions}>
        <div />
        <Button onClick={handleNext}>Próximo: Itens e Valores</Button>
      </div>
    </div>
  );
}
