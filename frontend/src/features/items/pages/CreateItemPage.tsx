import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useController, useFieldArray, useForm, type Control } from "react-hook-form";
import { ArrowLeft, Plus, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../../components/Button/Button";
import { Input } from "../../../components/Input/Input";
import { LoadingStatePanel } from "../../../components/AsyncState/AsyncState";
import type { ItemEventConfigDto, ItemVariationDto, ItemWriteDto } from "../../../services/api";
import { useItemMutations } from "../mutations/useItemMutations";
import { ItemEventTabs, ABA_PADRAO } from "../components/ItemEventTabs";
import { useItemEventConfigsQuery } from "../queries/useItemEventConfigsQuery";
import { useEventsQuery } from "../../events/queries/useEventsQuery";
import { itemsApi } from "../../../services/api";
import { useItemEventConfigMutations } from "../mutations/useItemEventConfigMutations";
import { useSubItemMutations } from "../mutations/useSubItemMutations";
import { useItemQuery, useItemsQuery } from "../queries/useItemsQuery";
import { useSubItemsQuery } from "../queries/useSubItemsQuery";
import { isDuplicateName } from "../../../utils/normalizeName";
import {
  getItemVariations,
  setItemVariations,
  makeVariationId,
} from "../variationsStorage";
import styles from "../styles/CreateItemPage.module.css";
import { Toggle } from "../../../components/Toggle/Toggle";

type ItemVariation = ItemVariationDto;

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

function CurrencyField({
  name,
  control,
  label,
  error,
}: {
  name: "unit_price";
  control: Control<ItemWriteDto>;
  label: string;
  error?: string;
}) {
  const { field } = useController({
    name,
    control,
    defaultValue: 0,
  });
  const [displayValue, setDisplayValue] = useState(formatCurrencyBR(Number(field.value ?? 0)));

  useEffect(() => {
    setDisplayValue(formatCurrencyBR(Number(field.value ?? 0)));
  }, [field.value]);

  return (
    <Input
      label={label}
      type="text"
      inputMode="numeric"
      placeholder="0,00"
      leftIcon={<span style={{ fontSize: "13px", color: "var(--color-text-muted)", userSelect: "none" }}>R$</span>}
      error={error}
      value={displayValue}
      onChange={(e) => {
        const nextValue = parseCurrencyInput(e.target.value);
        setDisplayValue(formatCurrencyBR(nextValue));
        field.onChange(nextValue);
      }}
      onBlur={() => {
        setDisplayValue(formatCurrencyBR(Number(field.value ?? 0)));
        field.onBlur();
      }}
    />
  );
}

function VariationRow({
  variation,
  onChange,
  onRemove,
}: {
  variation: ItemVariation;
  onChange: (patch: Partial<Omit<ItemVariation, "id">>) => void;
  onRemove: () => void;
}) {
  const [priceDisplay, setPriceDisplay] = useState(formatCurrencyBR(variation.unit_price));

  useEffect(() => {
    setPriceDisplay(formatCurrencyBR(variation.unit_price));
  }, [variation.unit_price]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.6fr 1fr 0.7fr auto",
        gap: "8px",
        alignItems: "end",
      }}
    >
      <Input
        label="Nome da variação"
        placeholder="Ex: DJ, Banda"
        value={variation.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <Input
        label="Valor"
        type="text"
        inputMode="numeric"
        placeholder="0,00"
        leftIcon={
          <span style={{ fontSize: "13px", color: "var(--color-text-muted)", userSelect: "none" }}>
            R$
          </span>
        }
        value={priceDisplay}
        onChange={(e) => {
          const parsed = parseCurrencyInput(e.target.value);
          setPriceDisplay(formatCurrencyBR(parsed));
          onChange({ unit_price: parsed });
        }}
        onBlur={() => setPriceDisplay(formatCurrencyBR(variation.unit_price))}
      />
      <Input
        label="Qtd. padrão"
        type="number"
        min="1"
        step="1"
        value={variation.default_quantity}
        onChange={(e) => onChange({ default_quantity: Number(e.target.value) || 1 })}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remover variação"
        style={{
          background: "transparent",
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          padding: "8px",
          cursor: "pointer",
          color: "var(--color-error)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "40px",
        }}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

export function CreateItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: item, isLoading } = useItemQuery(id);
  const { data: allItems = [] } = useItemsQuery();
  const { data: allSubItems = [] } = useSubItemsQuery();
  const { createMutation, updateMutation } = useItemMutations();
  const { createMutation: createSubItemMutation } = useSubItemMutations();

  const [searchTerm, setSearchTerm] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [hasVariations, setHasVariations] = useState(false);
  const [variations, setVariationsState] = useState<ItemVariation[]>([]);

  // --- Abas por evento ---
  // Mesma ideia das abas de cidade do evento: os MESMOS campos, uma versao por
  // aba. A aba "Padrao" e o proprio item e vale onde o evento nao tiver versao
  // propria. Cada aba guarda seu rascunho ate o Salvar.
  const { data: eventConfigs = [] } = useItemEventConfigsQuery(id);
  const {
    saveMutation: saveEventConfigs,
    addToEventMutation,
    removeFromEventMutation,
  } = useItemEventConfigMutations();
  const { data: todosEventos = [] } = useEventsQuery();
  const [abaAtiva, setAbaAtiva] = useState<string>(ABA_PADRAO);
  const [rascunhos, setRascunhos] = useState<Record<string, ItemWriteDto>>({});
  // Item novo ainda nao pode ser associado no banco: os eventos escolhidos
  // ficam aqui e sao gravados logo apos a criacao.
  const [eventosPendentes, setEventosPendentes] = useState<ItemEventConfigDto[]>([]);
  const [variacoesPorAba, setVariacoesPorAba] = useState<Record<string, ItemVariation[]>>({});

  const {
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ItemWriteDto>({
    mode: "onChange",
    defaultValues: {
      name: "",
      unit_price: 0,
      default_quantity: 1,
      editable: false,
      dynamic_by_students: false,
      has_subitems: false,
      subitems: [],
      has_additional: false,
      additional_quantity: 0,
      has_multiplier: false,
      multiplier_quantity: 0,
      value_visible_to_client: false,
    },
  });

  const hasSubitems = watch("has_subitems");
  const dynamicByStudents = watch("dynamic_by_students");
  const hasAdditional = watch("has_additional");
  const hasMultiplier = watch("has_multiplier");
  const selectedSubitems = watch("subitems") || [];

  const {
    append: appendSubitem,
    remove: removeSubitem,
    replace: replaceSubitems,
  } = useFieldArray({
    control,
    name: "subitems",
  });

  // Em item salvo as abas vem do banco; em item novo, da escolha local.
  const abasEventos = id ? eventConfigs : eventosPendentes;

  /** Os campos do cadastro, no formato do formulario. */
  const valoresDoItem = useCallback(
    (): ItemWriteDto => ({
      name: item?.name ?? "",
      unit_price: Number(item?.unit_price ?? 0),
      default_quantity: Number(item?.default_quantity ?? 1),
      editable: Boolean(item?.editable),
      dynamic_by_students: Boolean(item?.dynamic_by_students),
      value_visible_to_client: Boolean(item?.value_visible_to_client),
      has_subitems: Boolean(item?.has_subitems),
      subitems: Array.isArray(item?.subitems) ? item.subitems : [],
      has_additional: Boolean(item?.has_additional),
      additional_quantity: Number(item?.additional_quantity ?? 0),
      has_multiplier: Boolean(item?.has_multiplier),
      multiplier_quantity: Number(item?.multiplier_quantity ?? 0),
      variations: [],
    }),
    [item],
  );

  // Monta um rascunho por aba. Evento sem versao propria nasce igual ao item —
  // assim o consultor ve de onde partiu e muda so o que precisa.
  useEffect(() => {
    if (!item) return;
    const doItem = valoresDoItem();
    const porAba: Record<string, ItemWriteDto> = { [ABA_PADRAO]: doItem };
    const variacoes: Record<string, ItemVariation[]> = {
      [ABA_PADRAO]: Array.isArray(item.variations) ? item.variations : [],
    };

    eventConfigs.forEach((c) => {
      const temVersao = Boolean(c.config_id);
      porAba[c.event_template_id] = temVersao
        ? {
            ...doItem,
            unit_price: c.unit_price ?? doItem.unit_price,
            default_quantity: c.default_quantity ?? doItem.default_quantity,
            editable: c.quantity_editable ?? doItem.editable,
            dynamic_by_students: c.dynamic_by_students ?? doItem.dynamic_by_students,
            value_visible_to_client:
              c.value_visible_to_client ?? doItem.value_visible_to_client,
            has_subitems: c.has_subitems ?? doItem.has_subitems,
            subitems: c.subitems ?? doItem.subitems,
            has_additional: c.has_additional ?? doItem.has_additional,
            additional_quantity: c.additional_quantity ?? doItem.additional_quantity,
            has_multiplier: c.has_multiplier ?? doItem.has_multiplier,
            multiplier_quantity: c.multiplier_quantity ?? doItem.multiplier_quantity,
          }
        : { ...doItem };
      variacoes[c.event_template_id] = (c.variations ??
        (Array.isArray(item.variations) ? item.variations : [])) as ItemVariation[];
    });

    // Mescla: aba ja aberta pelo usuario mantem o que ele digitou. Sem isto,
    // incluir um evento (que refaz esta consulta) apagaria as edicoes em curso.
    setRascunhos((prev) => ({ ...porAba, ...prev }));
    setVariacoesPorAba((prev) => ({ ...variacoes, ...prev }));
  }, [item, eventConfigs, valoresDoItem]);

  useEffect(() => {
    if (!item) return;

    reset({
      name: item.name,
      unit_price: Number(item.unit_price),
      default_quantity: Number(item.default_quantity),
      editable: Boolean(item.editable),
      dynamic_by_students: Boolean(item.dynamic_by_students),
      has_subitems: Boolean(item.has_subitems),
      subitems: Array.isArray(item.subitems) ? item.subitems : [],
      has_additional: Boolean(item.has_additional),
      additional_quantity: Number(item.additional_quantity ?? 0),
      has_multiplier: Boolean(item.has_multiplier),
      multiplier_quantity: Number(item.multiplier_quantity ?? 0),
      value_visible_to_client: Boolean(item.value_visible_to_client),
    });

    const resolvedVariations =
      Array.isArray(item.variations) && item.variations.length > 0
        ? item.variations
        : getItemVariations(item.id);
    setHasVariations(resolvedVariations.length > 0);
    setVariationsState(resolvedVariations);
  }, [item, reset]);

  useEffect(() => {
    if (!hasSubitems && selectedSubitems.length > 0) {
      replaceSubitems([]);
    }
  }, [hasSubitems, replaceSubitems, selectedSubitems.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSubItems = useMemo(() => {
    const term = searchTerm.toLowerCase();

    return allSubItems.filter(
      (subitem) =>
        subitem.name.toLowerCase().includes(term) &&
        !selectedSubitems.some(
          (selected) => selected.id === subitem.id || selected.name === subitem.name,
        ),
    );
  }, [allSubItems, searchTerm, selectedSubitems]);

  const handleAddSubItem = (subitem: { id?: string; name: string }) => {
    appendSubitem(subitem);
    setSearchTerm("");
    setIsDropdownOpen(false);
  };

  const handleCreateNewSubItem = async () => {
    if (!searchTerm.trim()) return;

    try {
      const response = await createSubItemMutation.mutateAsync({ name: searchTerm.trim() });
      handleAddSubItem({ id: response.data.id, name: response.data.name });
    } catch {
      // handled by mutation toast
    }
  };

  const subitemsHelp = useMemo(
    () =>
      "Quando marcado, o item principal passa a aceitar uma lista de sub-itens. Use isso para agrupar componentes, como os itens que formam a decoração.",
    [],
  );
  const additionalHelp = useMemo(
    () =>
      "Quando marcado, soma uma quantidade fixa à quantidade do item no orçamento. Exemplo: item dinâmico por formandos com adicional 5 — se há 20 formandos, o cálculo usa 25 unidades.",
    [],
  );
  const multiplierHelp = useMemo(
    () =>
      "Quando marcado, multiplica a quantidade base pelo valor informado. Exemplo: item dinâmico por formandos com multiplicador 10 — se há 20 formandos, o cálculo usa 200 unidades. O valor total também é multiplicado.",
    [],
  );
  const variationsHelp = useMemo(
    () =>
      "Quando marcado, este item passa a ter múltiplas variações (ex: DJ, Banda). Cada variação tem nome, valor e quantidade padrão próprios. No orçamento, o usuário escolherá qual variação aplicar.",
    [],
  );

  const handleAddVariation = () => {
    setVariationsState((prev) => [
      ...prev,
      { id: makeVariationId(), name: "", unit_price: 0, default_quantity: 1 },
    ]);
  };

  const handleRemoveVariation = (variationId: string) => {
    setVariationsState((prev) => prev.filter((v) => v.id !== variationId));
  };

  const handleUpdateVariation = (
    variationId: string,
    patch: Partial<Omit<ItemVariation, "id">>,
  ) => {
    setVariationsState((prev) =>
      prev.map((v) => (v.id === variationId ? { ...v, ...patch } : v)),
    );
  };

  useEffect(() => {
    if (hasVariations && variations.length === 0) {
      handleAddVariation();
    }
    if (!hasVariations && variations.length > 0) {
      setVariationsState([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasVariations]);

  /**
   * Trocar de aba guarda o que esta na tela e carrega a aba escolhida. Sem
   * isto, mexer numa aba e trocar para outra perderia a edicao.
   */
  const trocarAba = (nova: string) => {
    if (nova === abaAtiva) return;
    const atual = getValues();
    setRascunhos((prev) => ({ ...prev, [abaAtiva]: atual }));
    setVariacoesPorAba((prev) => ({ ...prev, [abaAtiva]: variations }));

    const destino = rascunhos[nova] ?? valoresDoItem();
    reset(destino);
    const vars = variacoesPorAba[nova] ?? [];
    setVariationsState(vars);
    setHasVariations(vars.length > 0);
    setAbaAtiva(nova);
  };

  /** Cada aba de evento, no formato que a API espera. */
  const configsDeEvento = (atuais: Record<string, ItemWriteDto>) =>
    abasEventos.map((c) => {
      const v = atuais[c.event_template_id] ?? valoresDoItem();
      return {
        event_template_id: c.event_template_id,
        unit_price: Number(v.unit_price) || 0,
        default_quantity: Number(v.default_quantity) || 1,
        editable: Boolean(v.editable),
        dynamic_by_students: Boolean(v.dynamic_by_students),
        value_visible_to_client: Boolean(v.value_visible_to_client),
        has_subitems: Boolean(v.has_subitems),
        subitems: v.has_subitems ? v.subitems : [],
        has_additional: Boolean(v.has_additional),
        additional_quantity: Number(v.additional_quantity ?? 0),
        has_multiplier: Boolean(v.has_multiplier),
        multiplier_quantity: Number(v.multiplier_quantity ?? 0),
        variations: (variacoesPorAba[c.event_template_id] ?? []).map((x) => ({
          id: x.id,
          name: x.name.trim(),
          unit_price: Number(x.unit_price) || 0,
          default_quantity: Math.max(1, Math.floor(Number(x.default_quantity) || 1)),
        })),
      };
    });

  const onSubmit = (data: ItemWriteDto) => {
    // O que esta na tela pertence a aba aberta; as outras vem do rascunho.
    const rascunhosAtuais = { ...rascunhos, [abaAtiva]: data };
    // O item em si e sempre a aba "Padrao", esteja ela aberta ou nao.
    const doItem = rascunhosAtuais[ABA_PADRAO] ?? data;

    const additionalQtyRaw = Number(doItem.additional_quantity ?? 0);
    const multiplierQtyRaw = Number(doItem.multiplier_quantity ?? 0);
    const payload: ItemWriteDto = {
      ...doItem,
      unit_price: Number(doItem.unit_price),
      default_quantity: Number(doItem.default_quantity),
      has_subitems: Boolean(doItem.has_subitems),
      subitems: doItem.has_subitems ? doItem.subitems : [],
      has_additional: Boolean(doItem.has_additional),
      additional_quantity: doItem.has_additional
        ? Math.max(0, Math.floor(Number.isFinite(additionalQtyRaw) ? additionalQtyRaw : 0))
        : 0,
      has_multiplier: Boolean(doItem.has_multiplier),
      multiplier_quantity: doItem.has_multiplier
        ? Math.max(0, Math.floor(Number.isFinite(multiplierQtyRaw) ? multiplierQtyRaw : 0))
        : 0,
      value_visible_to_client: Boolean(doItem.value_visible_to_client),
      editable: Boolean(doItem.editable),
      dynamic_by_students: Boolean(doItem.dynamic_by_students),
      variations: [],
    };

    if (payload.has_subitems && payload.subitems.length === 0) {
      toast.error("Adicione pelo menos um sub-item.");
      return;
    }

    if (payload.has_additional && (payload.additional_quantity ?? 0) <= 0) {
      toast.error("Informe quantas unidades adicionais devem ser somadas.");
      return;
    }

    if (payload.has_multiplier && (payload.multiplier_quantity ?? 0) <= 0) {
      toast.error("Informe o multiplicador (mínimo 1).");
      return;
    }

    if (hasVariations) {
      if (variations.length === 0) {
        toast.error("Adicione pelo menos uma variação.");
        return;
      }
      const hasInvalid = variations.some(
        (v) => !v.name.trim() || Number(v.unit_price) <= 0 || Number(v.default_quantity) <= 0,
      );
      if (hasInvalid) {
        toast.error("Cada variação precisa de nome, valor maior que 0 e quantidade padrão maior que 0.");
        return;
      }
    }

    const variationsToPersist: ItemVariationDto[] = hasVariations
      ? variations.map((v) => ({
          id: v.id,
          name: v.name.trim(),
          unit_price: Number(v.unit_price) || 0,
          default_quantity: Math.max(1, Math.floor(Number(v.default_quantity) || 1)),
        }))
      : [];

    payload.variations = variationsToPersist;

    if (id) {
      updateMutation.mutate(
        { id, data: payload },
        {
          onSuccess: () => {
            setItemVariations(id, variationsToPersist);
            // Uma tela, um botao: a logica por evento vai junto com o item.
            const configs = configsDeEvento(rascunhosAtuais);
            if (configs.length > 0) {
              saveEventConfigs.mutate(
                { id, configs },
                { onSuccess: () => navigate("/items") },
              );
              return;
            }
            navigate("/items");
          },
        },
      );
      return;
    }

    createMutation.mutate(payload, {
      onSuccess: async (response) => {
        const createdId = response?.data?.id;
        if (createdId) setItemVariations(String(createdId), variationsToPersist);

        // Os eventos escolhidos antes do item existir sao gravados agora, na
        // ordem: primeiro a associacao, depois a versao do item em cada um.
        if (createdId && eventosPendentes.length > 0) {
          const novoId = String(createdId);
          try {
            for (const ev of eventosPendentes) {
              await itemsApi.addToEvent(novoId, ev.event_template_id);
            }
            await itemsApi.saveEventConfigs(novoId, configsDeEvento(rascunhosAtuais));
          } catch {
            toast.error(
              "O item foi criado, mas houve erro ao vinculá-lo aos eventos. Abra o item e tente de novo.",
            );
          }
        }

        navigate("/items");
      },
    });
  };

  if (id && isLoading) return <LoadingStatePanel message="Carregando item..." />;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" onClick={() => navigate("/items")} className={styles.backButton}>
          <ArrowLeft size={16} /> Voltar para lista
        </button>
        <h1 className={styles.title}>{id ? "Editar item base" : "Novo item base"}</h1>
      </header>

      {/* Abas no topo, como as de cidade do evento: os campos abaixo sao
          sempre os mesmos, muda de qual evento sao os valores. */}
      <ItemEventTabs
        eventos={abasEventos}
        abaAtiva={abaAtiva}
        onTrocarAba={trocarAba}
        todosEventos={todosEventos}
        podeEditarEventos
        ocupado={addToEventMutation.isPending || removeFromEventMutation.isPending}
        onIncluirEmEvento={(eventTemplateId) => {
          // A aba nova nasce com o que esta na tela agora — e dali o usuario
          // ajusta so o que muda naquele evento.
          const atual = getValues();
          setRascunhos((prev) => ({
            ...prev,
            [abaAtiva]: atual,
            [eventTemplateId]: { ...atual },
          }));
          setVariacoesPorAba((prev) => ({
            ...prev,
            [abaAtiva]: variations,
            [eventTemplateId]: variations,
          }));

          if (id) {
            addToEventMutation.mutate(
              { id, eventTemplateId },
              // Abre direto a aba nova: o consultor acabou de pedir por ela.
              { onSuccess: () => setAbaAtiva(eventTemplateId) },
            );
            return;
          }

          // Item ainda nao existe: guarda a escolha e grava apos criar.
          const ev = todosEventos.find(
            (e) => String(e.db_id ?? e.id) === eventTemplateId,
          );
          if (!ev) return;
          setEventosPendentes((prev) => [
            ...prev,
            {
              event_template_id: eventTemplateId,
              event_name: ev.name,
              event_city: ev.city,
              config_id: null,
            },
          ]);
          setAbaAtiva(eventTemplateId);
        }}
        onRetirarDoEvento={(eventTemplateId) => {
          if (id) {
            removeFromEventMutation.mutate(
              { id, eventTemplateId },
              { onSuccess: () => setAbaAtiva(ABA_PADRAO) },
            );
            return;
          }
          setEventosPendentes((prev) =>
            prev.filter((e) => e.event_template_id !== eventTemplateId),
          );
          setAbaAtiva(ABA_PADRAO);
        }}
      />

      <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
        <Input
          label="Nome do item"
          placeholder="Ex: Cadeira Tiffany"
          error={errors.name?.message}
          {...register("name", {
            required: "Nome é obrigatório",
            validate: (value) =>
              !isDuplicateName(value ?? "", allItems, id) ||
              "Já existe um item com esse nome.",
          })}
        />

        <div className={styles.twoColumns}>
          <CurrencyField
            name="unit_price"
            control={control}
            label="Valor unitário"
            error={errors.unit_price?.message}
          />
          <Input
            label="Quantidade padrão"
            type="number"
            placeholder={dynamicByStudents ? "Automático" : "1"}
            error={errors.default_quantity?.message}
            readOnly={Boolean(dynamicByStudents)}
            {...register("default_quantity", {
              required: "Quantidade padrão é obrigatória",
              min: 1,
            })}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px 32px",
          }}
        >
          <Toggle
            label="Permite edição no orçamento"
            hint="Quando marcado, este item pode ter quantidade e valor alterados durante a criação do orçamento. Se desmarcado, os dois campos ficam travados."
            {...register("editable")}
          />
          <Toggle
            label="Dinâmico conforme formandos"
            hint="Quando marcado, a quantidade do item no orçamento começa igual ao número de formandos informado no passo 1. Se desmarcado, vale a quantidade padrão cadastrada aqui."
            {...register("dynamic_by_students")}
          />
          <Toggle
            label="Valor aparece para cliente"
            hint="Quando ativo, o valor deste item aparece na impressão do orçamento na visão do cliente. Por padrão, na visão do cliente os valores dos itens ficam ocultos (só aparecem os valores gerais)."
            {...register("value_visible_to_client")}
          />
          <Toggle label="Possui sub-itens" hint={subitemsHelp} {...register("has_subitems")} />
          <Toggle label="Possui adicional?" hint={additionalHelp} {...register("has_additional")} />
          <Toggle label="Possui multiplicador?" hint={multiplierHelp} {...register("has_multiplier")} />
          <Toggle
            label="Possui variação?"
            hint={variationsHelp}
            checked={hasVariations}
            onChange={(e) => setHasVariations(e.target.checked)}
          />
        </div>

        {hasAdditional && (
          <Input
            label="Quantidade adicional"
            type="number"
            min="1"
            step="1"
            placeholder="Ex: 5"
            error={errors.additional_quantity?.message}
            {...register("additional_quantity", {
              valueAsNumber: true,
              min: { value: 1, message: "Informe pelo menos 1" },
            })}
          />
        )}

        {hasMultiplier && (
          <Input
            label="Quantidade multiplicadora"
            type="number"
            min="1"
            step="1"
            placeholder="Ex: 10"
            error={errors.multiplier_quantity?.message}
            {...register("multiplier_quantity", {
              valueAsNumber: true,
              min: { value: 1, message: "Informe pelo menos 1" },
            })}
          />
        )}

        {hasVariations && (
          <div className={styles.subitemsSection}>
            <h2 className={styles.subitemsTitle}>Variações</h2>
            <p className={styles.helperText}>
              Cada variação substitui o valor e a quantidade padrão do item quando selecionada no orçamento.
            </p>

            <div style={{ display: "grid", gap: "12px" }}>
              {variations.map((variation) => (
                <VariationRow
                  key={variation.id}
                  variation={variation}
                  onChange={(patch) => handleUpdateVariation(variation.id, patch)}
                  onRemove={() => handleRemoveVariation(variation.id)}
                />
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Plus size={16} />}
              onClick={handleAddVariation}
              style={{ marginTop: "8px", alignSelf: "flex-start" }}
            >
              Adicionar variação
            </Button>
          </div>
        )}

        {hasSubitems && (
          <div className={styles.subitemsSection}>
            <h2 className={styles.subitemsTitle}>Sub-itens vinculados</h2>

            <div ref={dropdownRef} className={styles.dropdownWrapper}>
              <Input
                placeholder="Buscar ou criar sub-item..."
                leftIcon={<Search size={18} />}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => setIsDropdownOpen(true)}
              />

              {isDropdownOpen && (searchTerm || filteredSubItems.length > 0) && (
                <div className={styles.dropdown}>
                  {filteredSubItems.map((subitem) => (
                    <button
                      key={subitem.id}
                      type="button"
                      onClick={() => handleAddSubItem(subitem)}
                      className={styles.dropdownItem}
                    >
                      <Plus size={14} color="var(--color-text-secondary)" />
                      {subitem.name}
                    </button>
                  ))}

                  {searchTerm &&
                    !filteredSubItems.some(
                      (subitem) => subitem.name.toLowerCase() === searchTerm.toLowerCase(),
                    ) && (
                      <button
                        type="button"
                        onClick={handleCreateNewSubItem}
                        className={`${styles.dropdownItem} ${styles.dropdownItemCreate}`}
                      >
                        <Plus size={16} />
                        Criar "{searchTerm}"
                      </button>
                    )}
                </div>
              )}
            </div>

            <div className={styles.chipsRow}>
              {selectedSubitems.map((subitem, index) => (
                <div key={subitem.id || subitem.name} className={styles.chip}>
                  {subitem.name}
                  <button
                    type="button"
                    onClick={() => removeSubitem(index)}
                    className={styles.chipRemove}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {selectedSubitems.length === 0 && (
                <p className={styles.emptyHint}>Nenhum sub-item selecionado.</p>
              )}
            </div>
          </div>
        )}

        <p className={styles.helperText}>
          O valor unitário é o único valor usado no cálculo do orçamento.
        </p>

        <div className={styles.actions}>
          <Button variant="outline" type="button" onClick={() => navigate("/items")}>
            Cancelar
          </Button>
          <Button type="submit" leftIcon={<Save size={18} />} isLoading={isSubmitting}>
            {id ? "Salvar alterações" : "Criar item"}
          </Button>
        </div>
      </form>
    </div>
  );
}
