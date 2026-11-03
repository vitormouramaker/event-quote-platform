import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm, useController, type Control } from "react-hook-form";
import { ArrowLeft, Save, Check, Info, X, Search, MapPin, Plus, Layers } from "lucide-react";
import { Button } from "../../../components/Button/Button";
import { Input } from "../../../components/Input/Input";
import { ItemConfigTip } from "../components/ItemConfigTip";
import { useEventQuery, useEventsQuery } from "../queries/useEventsQuery";
import { useItemsQuery } from "../../items/queries/useItemsQuery";
import { useCitiesQuery } from "../../cities/queries/useCitiesQuery";
import { useCityMutations } from "../../cities/mutations/useCityMutations";
import { useEventMutations } from "../mutations/useEventMutations";
import { LoadingStatePanel } from "../../../components/AsyncState/AsyncState";
import type { EventTemplateWriteDto } from "../../../services/api";
import { matchesItemSearch } from "../../items/utils/itemNameDedup";
import { isDuplicateName } from "../../../utils/normalizeName";
import { Toggle } from "../../../components/Toggle/Toggle";
import barStyles from "../styles/CreateEventPage.module.css";

type EventFormValues = Omit<EventTemplateWriteDto, "item_ids">;

function formatCurrencyBR(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function parseCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits) / 100;
}

// Campo "Valor do Evento (R$)" com máscara de moeda BR enquanto digita.
// Mantém o valor numérico no formulário e exibe formatado (1.500,00).
function EventValueField({ control }: { control: Control<EventFormValues> }) {
  const { field } = useController({ name: "value", control, defaultValue: undefined });
  const hasValue = field.value !== undefined && field.value !== null;
  const [displayValue, setDisplayValue] = useState(
    hasValue ? formatCurrencyBR(Number(field.value)) : "",
  );

  useEffect(() => {
    const next = field.value;
    setDisplayValue(next === undefined || next === null ? "" : formatCurrencyBR(Number(next)));
  }, [field.value]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      placeholder="0,00"
      leftIcon={<span style={{ fontSize: "13px", color: "var(--color-text-muted)", userSelect: "none" }}>R$</span>}
      value={displayValue}
      onChange={(e) => {
        const next = parseCurrencyInput(e.target.value);
        setDisplayValue(formatCurrencyBR(next));
        field.onChange(next);
      }}
      onBlur={() => {
        const next = field.value;
        setDisplayValue(next === undefined || next === null ? "" : formatCurrencyBR(Number(next)));
        field.onBlur();
      }}
    />
  );
}

export function CreateEventPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: event, isLoading: loadingEvent } = useEventQuery(id);
  const { data: items = [], isLoading: loadingItems } = useItemsQuery();
  const { data: allEvents = [] } = useEventsQuery();
  const { data: cities = [] } = useCitiesQuery();
  const {
    createMutation,
    updateMutation,
    cloneMutation,
    applyToFamilyMutation,
    deleteMutation,
  } = useEventMutations();
  const { createMutation: createCityMutation } = useCityMutations();
  // Família multi-cidade: irmãos = mesmo group_id, uma aba por cidade.
  // Ordem = ordem de criação (aba nova sempre entra à direita).
  const familyEvents = useMemo(() => {
    if (!event?.group_id) return event ? [event] : [];
    const stamp = (e: typeof event) =>
      new Date(e.created_at).getTime() || Number(e.db_id ?? 0);
    return allEvents
      .filter((e) => e.group_id === event.group_id)
      .sort((a, b) => stamp(a) - stamp(b) || Number(a.db_id ?? 0) - Number(b.db_id ?? 0));
  }, [allEvents, event]);
  const [newCityOpen, setNewCityOpen] = useState(false);
  const [newCity, setNewCity] = useState("");
  const [newCityName, setNewCityName] = useState("");
  const [deleteTabOpen, setDeleteTabOpen] = useState(false);
  const [deleteTabConfirmText, setDeleteTabConfirmText] = useState("");

  // Remove a versão do evento nesta cidade (a aba). Se for a última, o evento
  // deixa de existir — nesse caso exige digitar EXCLUIR.
  const isLastTab = familyEvents.length <= 1;
  const canConfirmDeleteTab = !isLastTab || deleteTabConfirmText === "EXCLUIR";

  const confirmDeleteTab = () => {
    if (!event || !canConfirmDeleteTab) return;
    const target = String(event.db_id ?? id);
    deleteMutation.mutate(target, {
      onSuccess: () => {
        setDeleteTabOpen(false);
        setDeleteTabConfirmText("");
        const next = familyEvents.find((s) => String(s.db_id ?? s.id) !== target);
        navigate(next ? `/events/${String(next.db_id ?? next.id)}` : "/events", {
          replace: true,
        });
      },
    });
  };

  // Cadastra a cidade e já a deixa selecionada no dropdown acima.
  const handleCreateCity = () => {
    const name = newCityName.trim();
    if (!name) return;
    createCityMutation.mutate(
      { name },
      {
        onSuccess: (res) => {
          setNewCity(res?.data?.name ?? name);
          setNewCityName("");
        },
      },
    );
  };

  const handleApplyToFamily = () => {
    if (!event) return;
    const others = familyEvents.filter((s) => s.city !== event.city).map((s) => s.city);
    if (others.length === 0) return;
    if (
      !confirm(
        `Aplicar a configuração de ${event.city} (nome, tipo, valor, lógicas, itens e regras) às cidades: ${others.join(", ")}?\n\nIsso SOBRESCREVE a configuração dessas cidades.`,
      )
    )
      return;
    applyToFamilyMutation.mutate(String(event.db_id ?? id));
  };

  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [viewingSubitemsId, setViewingSubitemsId] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [priceFilter, setPriceFilter] = useState<"todos" | "pago" | "sem_valor">("todos");

  const { register, handleSubmit, reset, watch, control, formState: { errors, isSubmitting } } = useForm<EventFormValues>({
    mode: "onChange",
    defaultValues: {
      name: "",
      city: "Capital",
      type: "Pago",
      value: undefined,
      has_administration: false,
      unit_price_editable: false,
      requires_min_events: false,
      closes_summary_block: false,
      summary_block_label: "",
    }
  });

  const eventType = watch("type");
  const closesSummaryBlock = watch("closes_summary_block");

  useEffect(() => {
    if (event) {
      reset({
        name: event.name,
        city: event.city,
        type: event.type,
        value: event.value ?? undefined,
        has_administration: event.has_administration ?? false,
        unit_price_editable: event.unit_price_editable ?? false,
        requires_min_events: event.requires_min_events ?? false,
        closes_summary_block: event.closes_summary_block ?? false,
        summary_block_label: event.summary_block_label ?? "",
      });
      const incoming = (event.items ?? []).map((i) => String(i.db_id || i.id));
      setSelectedItemIds(Array.from(new Set(incoming)));
    }
  }, [event, reset]);

  const toggleItem = (itemId: string) => {
    const normalizedItemId = String(itemId);
    setSelectedItemIds(prev => 
      prev.includes(normalizedItemId) 
        ? prev.filter(id => id !== normalizedItemId) 
        : [...prev, normalizedItemId]
    );
  };

  const onSubmit = (data: Omit<EventTemplateWriteDto, "item_ids">) => {
    const payload: EventTemplateWriteDto = {
      ...data,
      // Mantém o evento na mesma família ao editar.
      group_id: event?.group_id ?? undefined,
      item_ids: selectedItemIds,
    };

    // Salvar mantém o usuário na tela do evento (edição: fica; criação: abre
    // o evento recém-criado).
    if (id) {
      updateMutation.mutate({ id, data: payload });
    } else {
      createMutation.mutate(payload, {
        onSuccess: (res) => {
          const created = res?.data;
          const nextId = created?.db_id ?? created?.id;
          navigate(nextId ? `/events/${nextId}` : "/events", { replace: true });
        },
      });
    }
  };

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch = matchesItemSearch(item.name, itemSearch);
      const price = Number(item.unit_price) || 0;
      const matchFilter =
        priceFilter === "todos" ? true :
        priceFilter === "pago" ? price > 0 :
        price === 0;
      return matchSearch && matchFilter;
    });
  }, [items, itemSearch, priceFilter]);

  // Só mostra o loading em tela cheia quando ainda não há nada para exibir.
  // Trocar de aba mantém a tela montada (sem "piscada").
  if ((id && loadingEvent && !event) || (loadingItems && items.length === 0))
    return <LoadingStatePanel message="Carregando..." />;

  const itemToView = items.find(i => String(i.id) === viewingSubitemsId);

  return (
    <div className={barStyles.page}>
      <header style={{ marginBottom: "2rem" }}>
        <button 
          onClick={() => navigate("/events")}
          style={{ display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", marginBottom: "1rem" }}
        >
          <ArrowLeft size={16} /> Voltar para lista
        </button>
        <h1 className={barStyles.title}>{id ? "Editar Evento" : "Novo Evento"}</h1>

        {/* Abas por cidade (família multi-cidade). Cada aba = a config daquela
            cidade; "Nova cidade" clona a aba atual (itens, configs, regras). */}
        {id && event && (
          <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div className={barStyles.tabsBar}>
              <div className={barStyles.tabsScroller}>
              {familyEvents.map((sib) => {
                const sibKey = String(sib.db_id ?? sib.id);
                const active = sibKey === String(event.db_id ?? event.id);
                return (
                  <button
                    key={sibKey}
                    type="button"
                    onClick={() => !active && navigate(`/events/${sibKey}`)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      padding: "8px 14px", borderRadius: "999px", cursor: active ? "default" : "pointer",
                      border: `1px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
                      background: active ? "var(--color-primary)" : "var(--color-surface)",
                      color: active ? "#fff" : "var(--color-text-main)",
                      fontWeight: 600, fontSize: "13px",
                    }}
                  >
                    <MapPin size={14} /> {sib.city}
                    {active && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`Excluir versão de ${sib.city}`}
                        title={`Excluir a versão de ${sib.city}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTabConfirmText("");
                          setDeleteTabOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteTabConfirmText("");
                            setDeleteTabOpen(true);
                          }
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          marginLeft: "2px",
                          padding: "2px",
                          borderRadius: "999px",
                          cursor: "pointer",
                          opacity: 0.85,
                        }}
                      >
                        <X size={13} />
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setNewCityOpen((v) => !v)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "8px 14px", borderRadius: "999px", cursor: "pointer",
                  border: "1px dashed var(--color-border)", background: "transparent",
                  color: "var(--color-text-secondary)", fontWeight: 600, fontSize: "13px",
                }}
              >
                <Plus size={14} /> Nova cidade
              </button>
              </div>
              {familyEvents.length > 1 && (
                <button
                  type="button"
                  className={barStyles.applyBtn}
                  onClick={handleApplyToFamily}
                  disabled={applyToFamilyMutation.isPending}
                  title="Sobrescreve as outras cidades com a configuração desta aba"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    padding: "8px 14px", borderRadius: "999px", cursor: "pointer",
                    border: "1px solid var(--color-primary)", background: "transparent",
                    color: "var(--color-primary)", fontWeight: 600, fontSize: "13px",
                    opacity: applyToFamilyMutation.isPending ? 0.6 : 1,
                  }}
                >
                  <Layers size={14} />
                  {applyToFamilyMutation.isPending
                    ? "Aplicando…"
                    : `Aplicar às outras cidades (${familyEvents.length - 1})`}
                </button>
              )}
            </div>

            {newCityOpen && (
              <div className={barStyles.newCityCard}>
                <div className={barStyles.newCityCardHeader}>
                  <div>
                    <span className={barStyles.newCityTitle}>Adicionar cidade a este evento</span>
                    <p className={barStyles.newCityHint}>
                      Copia itens, configurações e regras de <strong>{event.city}</strong>. Depois
                      ajuste o que difere.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={barStyles.newCityClose}
                    onClick={() => setNewCityOpen(false)}
                    aria-label="Fechar"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className={barStyles.newCityBody}>
                <div className={barStyles.newCityFields}>
                  <label className={barStyles.field}>
                    <span className={barStyles.fieldLabel}>Cidade</span>
                    <select
                      className={barStyles.control}
                      value={newCity}
                      onChange={(e) => setNewCity(e.target.value)}
                    >
                      <option value="">Escolha a cidade…</option>
                      {cities
                        .filter((c) => !familyEvents.some((s) => s.city === c.name))
                        .map((c) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    disabled={!newCity}
                    isLoading={cloneMutation.isPending}
                    onClick={() =>
                      cloneMutation.mutate(
                        { id: String(event.db_id ?? id), data: { city: newCity } },
                        {
                          onSuccess: (res) => {
                            setNewCityOpen(false);
                            setNewCity("");
                            const created = res?.data;
                            const nextId = created?.db_id ?? created?.id;
                            navigate(nextId ? `/events/${nextId}` : "/events");
                          },
                        },
                      )
                    }
                  >
                    Criar copiando de {event.city}
                  </Button>
                </div>

                <div className={barStyles.newCityDivider}>ou</div>

                {/* Criar cidade sem sair da tela: já seleciona no dropdown ao criar. */}
                <div className={barStyles.newCityFields}>
                  <label className={barStyles.field}>
                    <span className={barStyles.fieldLabel}>Cadastrar cidade nova</span>
                    <input
                      className={barStyles.control}
                      value={newCityName}
                      onChange={(e) => setNewCityName(e.target.value)}
                      placeholder="Ex: Litoral"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCreateCity();
                        }
                      }}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    leftIcon={<Plus size={16} />}
                    disabled={!newCityName.trim()}
                    isLoading={createCityMutation.isPending}
                    onClick={handleCreateCity}
                  >
                    Criar cidade
                  </Button>
                </div>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: "grid", gap: "2rem" }}>
        {/* Info Básica */}
        <section className={barStyles.section} style={{ display: "grid", gap: "1.5rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: "600", marginBottom: "0.5rem" }}>Informações Básicas</h2>
          
          <Input
            label="Nome do Evento"
            placeholder="Ex: Baile de Gala"
            error={errors.name?.message}
            {...register("name", {
              required: "Nome é obrigatório",
              // Nome único POR CIDADE: irmãos da família (outras cidades) podem
              // (e devem) ter o mesmo nome.
              validate: (value) =>
                !isDuplicateName(
                  value ?? "",
                  allEvents.filter((e) => e.city === watch("city")),
                  id,
                ) || "Já existe um evento com esse nome nesta cidade.",
            })}
          />

          <div className={barStyles.twoCols}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "14px", fontWeight: "500" }}>Cidade/Local</label>
              <select 
                {...register("city")}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: "8px", backgroundColor: "var(--color-background)", color: "var(--color-text-main)" }}
              >
                {cities.map((city) => (
                  <option key={city.id} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "14px", fontWeight: "500" }}>Tipo de Evento</label>
              <select
                {...register("type")}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: "8px", backgroundColor: "var(--color-background)", color: "var(--color-text-main)" }}
              >
                <option value="Pago">Pago</option>
                <option value="Cortesia">Cortesia</option>
              </select>
            </div>
          </div>

          {eventType === "Pago" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "14px", fontWeight: "500" }}>Valor do Evento (R$)</label>
              <EventValueField control={control} />
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px 32px",
              marginTop: "0.5rem",
            }}
          >
            <Toggle
              label="Cobrar Administração (10%)"
              hint="Quando ativo, aplica 10% de administração sobre o total deste evento no orçamento."
              {...register("has_administration")}
            />
            <Toggle
              label="Valor unitário editável"
              hint="Quando ativo, o valor unitário dos itens deste evento pode ser editado durante a criação do orçamento."
              {...register("unit_price_editable")}
            />
            <Toggle
              label="Só disponível com 4+ outros eventos"
              hint="Este evento só poderá ser selecionado no orçamento se houver pelo menos 4 outros eventos diferentes já selecionados (este não conta)."
              {...register("requires_min_events")}
            />
            <Toggle
              label="Fecha um quadro no resumo final"
              hint="Este evento sai do 'Valor total até a colação' e ganha um quadro próprio no resumo final, somando o pacote mais ele. Útil para eventos contratados à parte, como o baile."
              {...register("closes_summary_block")}
            />
          </div>

          {closesSummaryBlock && (
            <div style={{ marginTop: "1rem", maxWidth: "420px" }}>
              <Input
                label="Rótulo do quadro no resumo final"
                placeholder="até o baile"
                {...register("summary_block_label")}
              />
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-text-secondary)",
                }}
              >
                Escreva só o complemento: sai como "Valor por formando até o
                baile". Em branco, usa o nome do evento.
              </span>
            </div>
          )}
        </section>

        {/* Seleção de Itens */}
        <section className={barStyles.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: "600" }}>Itens do Evento</h2>
            <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
              {selectedItemIds.length} selecionados
            </span>
          </div>

          {items.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", border: "2px dashed var(--color-border)", borderRadius: "8px" }}>
              <p style={{ color: "var(--color-text-secondary)", marginBottom: "1rem" }}>Nenhum item cadastrado.</p>
              <Button variant="outline" size="sm" onClick={() => navigate("/items/create")}>Cadastrar Itens</Button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: "12px", marginBottom: "1.25rem", flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ position: "relative", flex: "1 1 220px", minWidth: "180px" }}>
                  <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)", pointerEvents: "none" }} />
                  <input
                    type="text"
                    placeholder="Buscar item..."
                    value={itemSearch}
                    onChange={e => setItemSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px 8px 32px",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      backgroundColor: "var(--color-background)",
                      color: "var(--color-text-main)",
                      fontSize: "14px",
                      outline: "none",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {(["todos", "pago", "sem_valor"] as const).map(f => {
                    const label = f === "todos" ? "Todos" : f === "pago" ? "Com valor" : "Sem valor";
                    const active = priceFilter === f;
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setPriceFilter(f)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "999px",
                          border: `1px solid ${active ? "var(--color-secondary)" : "var(--color-border)"}`,
                          background: active ? "var(--color-secondary)" : "transparent",
                          color: active ? "var(--color-primary)" : "var(--color-text-main)",
                          fontSize: "13px",
                          fontWeight: active ? 700 : 400,
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {filteredItems.length === 0 && (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "14px" }}>
                  Nenhum item encontrado com os filtros aplicados.
                </div>
              )}

            <div className={barStyles.itemsGrid}>
              {filteredItems.map(item => {
                const normalizedItemId = String(item.id);
                const isSelected = selectedItemIds.includes(normalizedItemId);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleItem(normalizedItemId)}
                    title={item.name}
                    style={{
                      padding: "14px",
                      borderRadius: "12px",
                      border: "2px solid",
                      borderColor: isSelected ? "var(--color-secondary)" : "var(--color-border)",
                      backgroundColor: isSelected ? "var(--color-primary)" : "var(--color-surface)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      position: "relative",
                      minHeight: "76px",
                      height: "100%",
                    }}
                  >
                    {/* O "i" fica por cima do card e nao seleciona o item. */}
                    <ItemConfigTip item={item} />

                    <div style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "6px",
                      border: "2px solid",
                      borderColor: isSelected ? "var(--color-secondary)" : "var(--color-border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isSelected ? "var(--color-secondary)" : "transparent",
                      flexShrink: 0,
                      marginTop: "2px",
                    }}>
                      {isSelected && <Check size={14} color="var(--color-primary)" strokeWidth={3} />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: isSelected ? "white" : "var(--color-text-main)",
                        wordBreak: "break-word",
                        overflowWrap: "anywhere",
                        whiteSpace: "normal",
                        lineHeight: 1.3,
                        // Espaco para o "i" no canto, senao nome longo passa por baixo.
                        paddingRight: "18px",
                      }}>
                        {item.name}
                      </div>
                      <div style={{
                        fontSize: "12px",
                        color: isSelected ? "rgba(255, 255, 255, 0.75)" : "var(--color-text-secondary)",
                        fontWeight: 500,
                      }}>
                        R$ {Number(item.unit_price).toFixed(2)}
                      </div>
                    </div>

                    {item.has_subitems && item.subitems && item.subitems.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingSubitemsId(normalizedItemId);
                        }}
                        style={{
                          padding: "6px",
                          borderRadius: "8px",
                          border: "none",
                          backgroundColor: isSelected ? "rgba(255, 255, 255, 0.15)" : "var(--color-background)",
                          color: isSelected ? "white" : "var(--color-secondary)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.2s",
                          flexShrink: 0,
                          alignSelf: "flex-start",
                        }}
                        title="Ver sub-itens"
                      >
                        <Info size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            </>
          )}
        </section>

        {/* Barra flutuante na base: a tela é longa (muitos itens), então Salvar/
            Cancelar ficam sempre à mão sem rolar até o fim. */}
        <div className={barStyles.stickyBarSpacer} />
        <div className={barStyles.stickyBar}>
          {id && event && (
            <span className={barStyles.stickyBarInfo}>
              Editando: <strong>{event.name}</strong> · {event.city}
            </span>
          )}
          <Button variant="outline" type="button" onClick={() => navigate("/events")}>
            Cancelar
          </Button>
          <Button
            type="submit"
            leftIcon={<Save size={18} />}
            isLoading={isSubmitting || updateMutation.isPending || createMutation.isPending}
          >
            {id ? "Salvar Alterações" : "Criar Evento"}
          </Button>
        </div>
      </form>

      {/* Modal de remoção da aba (versão do evento numa cidade) */}
      {deleteTabOpen && event && (
        <div
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)", display: "flex", alignItems: "center",
            justifyContent: "center", zIndex: 120, padding: "1rem",
          }}
          onClick={() => setDeleteTabOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--color-surface)", borderRadius: "14px",
              width: "100%", maxWidth: "460px",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.35)", overflow: "hidden",
            }}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {isLastTab ? "Excluir evento" : `Remover a versão de ${event.city}`}
              </h3>
              <button
                type="button"
                onClick={() => setDeleteTabOpen(false)}
                aria-label="Fechar"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", display: "flex" }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: "16px 20px" }}>
              {isLastTab ? (
                <>
                  <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--color-text-secondary)" }}>
                    <strong style={{ color: "var(--color-text-main)" }}>{event.name}</strong> existe
                    somente em <strong style={{ color: "var(--color-text-main)" }}>{event.city}</strong>.
                    Remover esta cidade exclui o evento por completo, junto com seus itens,
                    configurações e regras.
                  </p>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                    Para confirmar, digite{" "}
                    <strong style={{ color: "var(--color-error, #ef4444)" }}>EXCLUIR</strong> abaixo:
                  </p>
                  <input
                    type="text"
                    value={deleteTabConfirmText}
                    onChange={(e) => setDeleteTabConfirmText(e.target.value)}
                    placeholder="EXCLUIR"
                    autoFocus
                    style={{
                      width: "100%", height: 40, padding: "0 12px",
                      border: `1px solid ${canConfirmDeleteTab ? "var(--color-error, #ef4444)" : "var(--color-border)"}`,
                      borderRadius: "8px", fontSize: 14, color: "var(--color-text-main)",
                      backgroundColor: "var(--color-surface)", outline: "none", boxSizing: "border-box",
                    }}
                  />
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)" }}>
                  A configuração de <strong style={{ color: "var(--color-text-main)" }}>{event.city}</strong>{" "}
                  do evento <strong style={{ color: "var(--color-text-main)" }}>{event.name}</strong> será
                  removida (itens, configurações e regras desta cidade).
                  <br />
                  As demais cidades continuam:{" "}
                  <strong style={{ color: "var(--color-text-main)" }}>
                    {familyEvents.filter((s) => s.city !== event.city).map((s) => s.city).join(", ")}
                  </strong>
                  .
                </p>
              )}
            </div>

            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="outline" type="button" onClick={() => setDeleteTabOpen(false)} disabled={deleteMutation.isPending}>
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={confirmDeleteTab}
                disabled={!canConfirmDeleteTab || deleteMutation.isPending}
                style={{
                  backgroundColor: canConfirmDeleteTab ? "#ef4444" : "var(--color-border)",
                  color: canConfirmDeleteTab ? "#fff" : "var(--color-text-muted)",
                  border: "none",
                  cursor: canConfirmDeleteTab ? "pointer" : "not-allowed",
                }}
              >
                {deleteMutation.isPending
                  ? "Removendo..."
                  : isLastTab
                    ? "Excluir evento"
                    : "Remover cidade"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Sub-itens */}
      {viewingSubitemsId && itemToView && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(15, 23, 42, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "1rem"
        }} onClick={() => setViewingSubitemsId(null)}>
          <div 
            style={{
              backgroundColor: "var(--color-surface)",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "500px",
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden"
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ 
              padding: "1.5rem", 
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start"
            }}>
              <div>
                <h3 style={{ fontSize: "1.125rem", fontWeight: "700", color: "var(--color-text-main)" }}>
                  {itemToView.name}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                  <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
                    Sub-itens inclusos
                  </p>
                  <span style={{ 
                    padding: "2px 8px", 
                    backgroundColor: "var(--color-secondary)", 
                    color: "var(--color-primary)", 
                    borderRadius: "999px", 
                    fontSize: "11px", 
                    fontWeight: "700" 
                  }}>
                    {itemToView.subitems?.length || 0}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setViewingSubitemsId(null)}
                style={{ padding: "4px", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)" }}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: "1.5rem", maxHeight: "60vh", overflowY: "auto" }}>
              <div style={{ display: "grid", gap: "10px" }}>
                {itemToView.subitems?.map((sub, idx) => (
                  <div key={idx} style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "10px",
                    padding: "10px 12px",
                    backgroundColor: "var(--color-background)",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "500",
                    color: "var(--color-text-main)"
                  }}>
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--color-secondary)" }} />
                    {sub.name}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: "1rem 1.5rem", backgroundColor: "var(--color-background)", textAlign: "right" }}>
              <Button size="sm" onClick={() => setViewingSubitemsId(null)}>Fechar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
