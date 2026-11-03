import { useFormContext, useWatch, Controller } from "react-hook-form";
import type { FieldValues } from "react-hook-form";
import { Button } from "../../../../components/Button/Button";
import { Input } from "../../../../components/Input/Input";
import type { ItemVariationDto } from "../../../../services/api";
import type { BudgetItem, EventType } from "../../data/mockData";
import {
  orderSelectedEvents,
  isFixedPositionEvent,
  enforceFixedEventRules,
  type BudgetCatalogEvent,
  type BudgetCatalogItem,
} from "../../data/budgetCatalog";
import styles from "./Steps.module.css";
import itemsStyles from "./ItemsStep.module.css";
import { Plus, Trash2, Tags, Paperclip, ChevronDown, ChevronUp, GripVertical, Lock } from "lucide-react";
import { useState, useMemo, useEffect, type ReactNode } from "react";
import clsx from "clsx";
import { useDiscountRequestsStore } from "../../../../store/DiscountRequestsStore";
import { toast } from "sonner";
import { useAuthStore } from "../../../../store/authStore";
import { formatCurrency, EventTotalSummary, CourtesyTotalRow, BudgetItemGridRow, DescerramentoSummary, AulaSaudadeSummary, MissaSummary, EnsaioSummary, Ensaio50Summary, ColacaoSummary, CerimoniaSummary, Festa50Summary, SummaryDetailRow } from "./ItemsStepSummaries";
import { calculateItemsStepEventTotal } from "../../domain/eventCalculations";
import type { BudgetItemChangeLog } from "../../domain/budgetItemChanges";
import { buildSummaryBlocks } from "../../domain/summaryBlocks";
import {
  BudgetPaymentSummary,
  BudgetTotalsSummary,
} from "../BudgetPaymentSummary";
import { BudgetChangesModal } from "../BudgetChangesModal";
import type { Budget } from "../../../../store/budgetStore";
import {
  getAuditoriumOptionsForCity,
  getDefaultAuditoriumPrice,
  isContractedEventPhotoSessionItem,
  isBudgetFixedValueItem,
  getMusicAttractionLabel,
  getMusicAttractionOptions,
  getResolvedAuditoriumPrice,
  getParticipantDrivenAuditoriumPrice,
  isAuditoriumItemByIdOrName,
  isPlaqueReplicaItem,
  isMusicAttractionItem,
  isStudentPhotoSessionItem,
  isStudentChairsItem,
  resolveCanonicalEventSlug,
} from "../../domain/budgetUiRules";
import {
  getDerivedItemRules,
  getParticipationQuantity,
  resolveRuleQuantity,
} from "../../data/runtimeBudgetRules";
import { deriveAddedItemBehavior } from "./addedItemBehavior";
import { AddItemModal, RHFPriceInput, type AddableBudgetItemUi } from "./ItemsStepUi";
import { CurrencyInput } from "../../../../components/CurrencyInput/CurrencyInput";
import {
  buildAulaSaudadeSummary,
  buildCerimoniaSummary,
  buildColacaoSummary,
  buildDescerramentoSummary,
  buildEnsaioFotograficoSummary,
  buildFestaSummary,
  buildMissaSummary,
  buildSimpleEnsaioSummary,
  createItemsStepItemActiveResolver,
  getCourtesyDisplayTotal,
  getItemsStepAddedItemsTotal,
} from "../../domain/itemsStepSummaryCalculations";
import {
  getAvailableItemVariations,
  getVariationDrivenQuantity,
  getVariationDrivenUnitPrice,
  normalizeVariationComparable,
  shouldSeedVariationDefaults,
} from "../../domain/itemVariations";
import { getAppliedItemDiscountPercentage } from "../../domain/itemDiscountDetails";
import { DiscountInputField } from "../DiscountInputField";
import {
  DEFAULT_DISCOUNT_MODE,
  formatItemDiscount,
  resolveDiscountAmounts,
  resolveItemDiscountInput,
  validateDiscountInput,
  type DiscountMode,
} from "../../domain/discountInput";
import { getItemVariations } from "../../../items/variationsStorage";

function resolveCatalogItemVariations(item: BudgetCatalogItem): ItemVariationDto[] {
  const apiVariations = getAvailableItemVariations(item);
  return apiVariations.length > 0 ? apiVariations : getItemVariations(item.id);
}

function VariationSelector({ eventId, item }: { eventId: string; item: BudgetCatalogItem }) {
  const variations = useMemo(
    () => resolveCatalogItemVariations(item),
    [item.id, item.variations],
  );
  const { control, getValues, setValue } = useFormContext();
  const selectedVariationId = useWatch({
    control,
    name: `items.${eventId}.${item.id}_variation`,
  }) as string | undefined;
  const savedVariationLabel = useWatch({
    control,
    name: `items.${eventId}.${item.id}_variation_label`,
  }) as string | undefined;

  // Variação exibida no dropdown, resolvida de forma robusta: id salvo válido →
  // label salvo (estável entre sessões) → primeira opção. Independe do id de
  // variação, que pode mudar entre localStorage e API.
  const displayVariation =
    variations.find((v) => v.id === selectedVariationId) ??
    (typeof savedVariationLabel === "string" && savedVariationLabel.trim()
      ? variations.find(
          (v) =>
            normalizeVariationComparable(v.name) ===
            normalizeVariationComparable(savedVariationLabel),
        )
      : undefined) ??
    variations[0];

  const syncMusicAttractionType = (variationName: string, shouldDirty: boolean) => {
    if (!isMusicAttractionItem(item.id)) return;

    const matchedOption = getMusicAttractionOptions().find((option) => {
      const normalizedName = normalizeVariationComparable(variationName);
      return (
        normalizedName === normalizeVariationComparable(option.label) ||
        normalizedName === normalizeVariationComparable(option.slug)
      );
    });

    if (!matchedOption) return;
    const currentType = getValues(`items.${eventId}.atracao_musical_type`);
    if (currentType === matchedOption.slug) return;
    setValue(`items.${eventId}.atracao_musical_type`, matchedOption.slug, { shouldDirty });
  };

  const applyVariationSelection = (
    variation: ItemVariationDto,
    shouldDirty: boolean,
  ) => {
    setValue(`items.${eventId}.${item.id}_variation`, variation.id, { shouldDirty });
    setValue(`items.${eventId}.${item.id}_variation_label`, variation.name, { shouldDirty });
    setValue(`items.${eventId}.${item.id}_price`, variation.unit_price, { shouldDirty });
    setValue(`items.${eventId}.${item.id}`, variation.default_quantity, { shouldDirty });
    syncMusicAttractionType(variation.name, shouldDirty);
  };

  useEffect(() => {
    if (variations.length === 0) return;

    const currentValues = (getValues(`items.${eventId}`) ?? {}) as Record<string, unknown>;
    const seed = shouldSeedVariationDefaults(currentValues, item.id);

    // Estado salvo do item. Os ids de variação são gerados e podem MUDAR entre
    // sessões, então um orçamento salvo pode trazer um `_variation` que não
    // existe mais na lista atual. Por isso resolvemos a variação com a seguinte
    // prioridade: id salvo válido → label salvo → primeira opção.
    const savedLabel = currentValues[`${item.id}_variation_label`];
    const savedPrice = currentValues[`${item.id}_price`];
    const hasSavedSelection =
      (typeof savedLabel === "string" && savedLabel.trim().length > 0) ||
      (savedPrice !== undefined && savedPrice !== null && savedPrice !== "");

    const matchedById = variations.find((variation) => variation.id === selectedVariationId);
    const matchedByLabel =
      typeof savedLabel === "string" && savedLabel.trim()
        ? variations.find(
            (variation) =>
              normalizeVariationComparable(variation.name) ===
              normalizeVariationComparable(savedLabel),
          )
        : undefined;
    const resolved = matchedById ?? matchedByLabel ?? variations[0];

    if (!matchedById) {
      if (hasSavedSelection) {
        // Já existe escolha salva (preço/label). NUNCA sobrescreve esses valores
        // — apenas reconcilia o id do dropdown para a variação resolvida, para
        // que ela apareça selecionada sem reverter o preço (ex.: Platina → Cristal).
        setValue(`items.${eventId}.${item.id}_variation`, resolved.id, { shouldDirty: false });
        if (seed.needsVariationLabel) {
          setValue(`items.${eventId}.${item.id}_variation_label`, resolved.name, {
            shouldDirty: false,
          });
        }
        syncMusicAttractionType(resolved.name, false);
      } else {
        // Item realmente novo: semeia os defaults completos da primeira variação.
        applyVariationSelection(resolved, false);
      }
      return;
    }

    // Id salvo é válido: mantém a seleção e apenas completa campos ausentes.
    if (seed.needsVariationLabel) {
      setValue(`items.${eventId}.${item.id}_variation_label`, resolved.name, {
        shouldDirty: false,
      });
    }
    if (seed.needsPrice) {
      setValue(`items.${eventId}.${item.id}_price`, resolved.unit_price, {
        shouldDirty: false,
      });
    }
    if (seed.needsQuantity) {
      setValue(`items.${eventId}.${item.id}`, resolved.default_quantity, {
        shouldDirty: false,
      });
    }
    syncMusicAttractionType(resolved.name, false);
  }, [eventId, getValues, item.id, selectedVariationId, setValue, variations]);

  if (variations.length === 0) return null;

  return (
    <Controller
      name={`items.${eventId}.${item.id}_variation`}
      control={control}
      defaultValue={variations[0].id}
      render={({ field }) => (
        <select
          value={displayVariation?.id ?? field.value ?? variations[0].id}
          onChange={(e) => {
            const selected = variations.find((v) => v.id === e.target.value);
            field.onChange(e.target.value);
            if (selected) {
              applyVariationSelection(selected, true);
            }
          }}
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "4px 6px",
            fontSize: "var(--font-size-sm)",
            color: "var(--color-text-main)",
            width: "auto",
            minWidth: "160px",
            cursor: "pointer",
            marginTop: "4px",
          }}
        >
          {variations.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      )}
    />
  );
}

// Coluna de VALOR do auditório. Reativa (useWatch) ao slug/preço: se o auditório
// selecionado permite edição no orçamento → input BRL editável; senão texto fixo.
function AuditoriumPriceCell({
  eventId,
  itemId,
  defaultPrice,
  className,
  onEdited,
}: {
  eventId: string;
  itemId: string;
  defaultPrice: number;
  className?: string;
  onEdited?: () => void;
}) {
  const { control } = useFormContext();
  const slug = useWatch({ control, name: `items.${eventId}.${itemId}_auditorium_slug` }) as
    | string
    | undefined;
  const price = useWatch({ control, name: `items.${eventId}.${itemId}_price` });
  const budgetCity = useWatch({ control, name: "budgetCity" }) as string | undefined;
  const options = getAuditoriumOptionsForCity(budgetCity);
  const effPrice = Number.isFinite(Number(price)) ? Number(price) : defaultPrice;
  const selectedOption =
    options.find((o) => o.slug === slug) ??
    options.find((o) => o.value === effPrice) ??
    options[0];
  const canEdit = Boolean(selectedOption?.allowBudgetEdit);

  return (
    <Controller
      name={`items.${eventId}.${itemId}_price`}
      control={control}
      defaultValue={defaultPrice}
      render={({ field }) => (
        <CurrencyInput
          value={Number(field.value) || 0}
          onChange={(v) => {
            field.onChange(v);
            onEdited?.();
          }}
          readOnly={!canEdit}
          className={className}
          autoGrow
        />
      )}
    />
  );
}

/**
 * Input de quantidade controlado pelo valor JÁ resolvido pelo chamador
 * (`getItemNumber`), que é a mesma fonte usada para os totais da linha. Ler o
 * campo por conta própria (`useWatch` no path) divergia dos totais em itens
 * cujo id/evento é numérico, mostrando o default enquanto o total usava o valor
 * salvo — era o caso da quantidade alterada pelo anexo contratual.
 */
function BudgetQtyInput({ name, value }: { name: string; value: number }) {
  const { setValue } = useFormContext();

  return (
    <Input
      type="number"
      min="0"
      className={itemsStyles.qtyInput}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        setValue(name, next === "" ? 0 : Number(next), {
          shouldDirty: true,
          shouldValidate: false,
        });
      }}
    />
  );
}

type ItemsStepCustomAddedItem = {
  id?: string;
  name?: string;
  unitPrice?: number;
  quantity?: number;
  isNoFixedValue?: boolean;
  originalId?: string;
  originalEventId?: string;
  quantityEditable?: boolean;
  priceEditable?: boolean;
  displayValue?: string;
  quantityDisplay?: string;
  hasSubitems?: boolean;
  selectedVariationId?: string;
  variations?: ItemVariationDto[];
  subitems?: Array<{
    name: string;
  }>;
};

type ItemsStepCustomItems = Record<
  string,
  {
    added?: ItemsStepCustomAddedItem[];
    removedIds?: string[];
  }
>;

type RepeatedPricedItemConfig = {
  priceDefault: number;
  qtySource: "eventParticipation" | "ensaioFotografico";
  priceReadOnly?: boolean;
};

type ConfiguredItemUiConfig = {
  priceDefault: number;
  qtyDefault: number;
  priceReadOnly?: boolean;
  qtyEditable?: boolean;
  qtyReadOnlyValue?: number | string;
  useAuditoriumSelector?: boolean;
};

type ResolvedItemUi = {
  currentQty: number;
  displayPrice: ReactNode;
  qtyInput: ReactNode;
  displayTotal: ReactNode;
};

const FESTA_ITEM_CONFIGS: Record<string, RepeatedPricedItemConfig> = {
  buffet_festa50: { priceDefault: 80, qtySource: "eventParticipation", priceReadOnly: true },
  openbar_festa50: { priceDefault: 40, qtySource: "eventParticipation", priceReadOnly: true },
  drinks_festa50: { priceDefault: 120, qtySource: "eventParticipation" },
  camisa_festa50: { priceDefault: 40, qtySource: "eventParticipation" },
  buffet_festa365: { priceDefault: 80, qtySource: "eventParticipation", priceReadOnly: true },
  openbar_festa365: { priceDefault: 40, qtySource: "eventParticipation", priceReadOnly: true },
  drinks_festa365: { priceDefault: 120, qtySource: "eventParticipation" },
  camisa_festa365: { priceDefault: 40, qtySource: "eventParticipation" },
};

const ENSAIO_ITEM_CONFIGS: Record<string, RepeatedPricedItemConfig> = {
  beca_formatura_ensaio: { priceDefault: 120, qtySource: "eventParticipation" },
  coffee_break_ensaio: { priceDefault: 80, qtySource: "eventParticipation" },
  coffee_break_ensaio50: { priceDefault: 80, qtySource: "ensaioFotografico" },
  coffee_break_ensaio365: { priceDefault: 80, qtySource: "ensaioFotografico" },
};

const SIMPLE_ENSAIO_EVENT_COFFEE_ITEM: Record<string, "coffee_break_ensaio50" | "coffee_break_ensaio365"> = {
  ensaio_50: "coffee_break_ensaio50",
  ensaio_365: "coffee_break_ensaio365",
};

const getMissaItemConfig = (itemId: string, participationQty: number): ConfiguredItemUiConfig | null =>
  itemId === "livro_missal"
    ? { priceDefault: 12, qtyDefault: participationQty * 10, priceReadOnly: true, qtyEditable: true }
    : itemId === "musica_sacra"
      ? { priceDefault: 1000, qtyDefault: 1, priceReadOnly: true, qtyEditable: false, qtyReadOnlyValue: 1 }
      : itemId === "taxa_igreja"
        ? { priceDefault: 1500, qtyDefault: 1, priceReadOnly: true, qtyEditable: false, qtyReadOnlyValue: 1 }
        : null;

const getDescerramentoItemConfig = (
  itemId: string,
  participationQty: number,
): ConfiguredItemUiConfig | null =>
  itemId === "replica_placa"
    ? { priceDefault: 80, qtyDefault: participationQty, priceReadOnly: true, qtyEditable: true }
    : itemId === "coffee_break"
      ? { priceDefault: 80, qtyDefault: participationQty || 1, priceReadOnly: true, qtyEditable: true }
      : null;

const getAulaSaudadeItemConfig = (
  itemId: string,
  participationQty: number,
): ConfiguredItemUiConfig | null =>
  itemId === "atracao_musical"
    ? { priceDefault: 700, qtyDefault: 1, priceReadOnly: true, qtyEditable: false, qtyReadOnlyValue: 1 }
    : itemId === "servicos_buffet"
      ? { priceDefault: 90, qtyDefault: participationQty + 5, priceReadOnly: true, qtyEditable: true }
      : itemId === "bebidas_open_bar"
        ? { priceDefault: 40, qtyDefault: participationQty + 5, priceReadOnly: true, qtyEditable: true }
        : itemId === "drinks"
          ? { priceDefault: 120, qtyDefault: participationQty, qtyEditable: true }
          : null;

const getColacaoItemConfig = (itemId: string, participationQty: number): ConfiguredItemUiConfig | null =>
  itemId === "recepcionista_apoio_col"
    ? { priceDefault: 350, qtyDefault: 1, priceReadOnly: true, qtyEditable: true }
    : itemId === "placa_formatura_col"
      ? { priceDefault: 2500, qtyDefault: 1, priceReadOnly: true, qtyEditable: false, qtyReadOnlyValue: 1 }
      : itemId === "replica_placa_col"
        ? { priceDefault: 80, qtyDefault: participationQty, priceReadOnly: true, qtyEditable: true }
        : itemId === "becas_formandos_col"
          ? { priceDefault: 120, qtyDefault: participationQty, qtyEditable: true }
          : itemId === "canudos_col"
            ? { priceDefault: 40, qtyDefault: participationQty, priceReadOnly: true, qtyEditable: true }
            : itemId === "locacao_auditorio_col"
              ? { priceDefault: getParticipantDrivenAuditoriumPrice(participationQty), qtyDefault: 1, qtyEditable: false, qtyReadOnlyValue: 1, useAuditoriumSelector: true }
              : itemId === "arquibancada_col"
                ? { priceDefault: 35, qtyDefault: participationQty, priceReadOnly: true, qtyEditable: true }
                : itemId === "painel_led_col"
                  ? { priceDefault: 250, qtyDefault: participationQty, qtyEditable: true }
                  : null;

const getCerimoniaItemConfig = (itemId: string, participationQty: number): ConfiguredItemUiConfig | null =>
  itemId === "becas_formandos_cerimonia"
    ? { priceDefault: 120, qtyDefault: participationQty, qtyEditable: true }
    : itemId === "canudos_cerimonia"
      ? { priceDefault: 60, qtyDefault: participationQty, priceReadOnly: true, qtyEditable: true }
      : itemId === "locacao_auditorio_cerimonia"
        ? { priceDefault: getParticipantDrivenAuditoriumPrice(participationQty), qtyDefault: 1, qtyEditable: false, qtyReadOnlyValue: 1, useAuditoriumSelector: true }
        : itemId === "arquibancada_cerimonia"
          ? { priceDefault: 35, qtyDefault: participationQty, priceReadOnly: true, qtyEditable: true }
          : itemId === "placa_led_cerimonia"
            ? { priceDefault: 250, qtyDefault: participationQty, qtyEditable: true }
            : null;

function useItemsStepFormReaders(formValues: FieldValues) {
  const formRecord = formValues as Record<string, unknown>;

  const getFormNumber = (key: string, fallback = 0): number => {
    const raw = formRecord[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const parsed = Number(raw.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
  };

  const getFormString = (key: string, fallback = ""): string => {
    const raw = formRecord[key];
    return typeof raw === "string" && raw.length > 0 ? raw : fallback;
  };

  const getEventItemMap = (eventId: string): Record<string, unknown> => {
    const itemsRaw = formRecord.items;
    if (!itemsRaw || typeof itemsRaw !== "object") return {};
    const eventItems = (itemsRaw as Record<string, unknown>)[eventId];
    return eventItems && typeof eventItems === "object"
      ? (eventItems as Record<string, unknown>)
      : {};
  };

  const getItemRaw = (eventId: string, itemKey: string): unknown =>
    getEventItemMap(eventId)[itemKey];

  const getItemNumber = (eventId: string, itemKey: string, fallback = 0): number => {
    const raw = getItemRaw(eventId, itemKey);
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const parsed = Number(raw.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
  };

  const hasItemValue = (eventId: string, itemKey: string): boolean =>
    getItemRaw(eventId, itemKey) !== undefined;

  const getBudgetId = (): string => getFormString("id", "temp-budget");
  const getClientName = (): string => getFormString("comissao", "Cliente");
  const getParticipationQty = (eventId?: string): number => {
    const fallback = getFormNumber("studentsQuantity", 1) || 1;
    if (!eventId) return fallback;
    return getParticipationQuantity(formValues as Record<string, unknown>, eventId, fallback) || fallback;
  };

  return {
    getFormNumber,
    getFormString,
    getEventItemMap,
    getItemRaw,
    getItemNumber,
    hasItemValue,
    getBudgetId,
    getClientName,
    getParticipationQty,
  };
}

function isValorEventoItem(name: string): boolean {
  const n = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return n.includes("valor do evento") || n.includes("valor evento") || n === "valor fixo do evento";
}

interface ItemsStepProps {
  onNext: () => void;
  onBack: () => void;
  budgetEvents: BudgetCatalogEvent[];
  baseItems: BudgetCatalogItem[];
}

export function ItemsStep({ onNext, onBack, budgetEvents, baseItems }: ItemsStepProps) {
  const { register, control, setValue, getValues, formState } = useFormContext();
  const selectedEventIds = useWatch({ control, name: "selectedEvents" }) || [];
  const eventOrder = useWatch({ control, name: "eventOrder" }) as
    | string[]
    | undefined;
  const formValues = useWatch({ control }) as FieldValues;
  // Itens alterados pelo anexo contratual (marcados na versão gerada por ele).
  const annexEditMarks = (formValues.annexEdits ?? {}) as Record<
    string,
    Record<string, true>
  >;
  // Antes -> depois gravado quando a versão nasceu (edição normal ou anexo).
  const itemChangeLog = (formValues.itemChanges ?? {}) as BudgetItemChangeLog;
  const [changesFocus, setChangesFocus] = useState<
    { eventId: string; itemId: string } | undefined
  >(undefined);
  const [changesOpen, setChangesOpen] = useState(false);
  // Orçamento "de mentira" só para o modal: ele lê os dados de form_data.
  const changesBudget = {
    instituicao: formValues.instituicao,
    curso: formValues.curso,
    version: formValues.version,
    data: { itemChanges: itemChangeLog },
  } as unknown as Budget;
  // Cidade do orcamento: restringe os auditorios oferecidos no select.
  const budgetCity = useWatch({ control, name: "budgetCity" }) as string | undefined;
  const customItems = (useWatch({ control, name: "customItems" }) || {}) as ItemsStepCustomItems;
  
  // DnD do índice de eventos (reordena só este orçamento). Eventos fixos só se
  // movem com "Habilitar mover qualquer evento" ligado. dragOrder = preview vivo
  // enquanto arrasta (a lista vai se ajustando).
  const [allowAnyEventMove, setAllowAnyEventMove] = useState(false);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);

  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [activeEventIdForAdd, setActiveEventIdForAdd] = useState<string | null>(null);
  const [floatingBarCollapsed, setFloatingBarCollapsed] = useState(false);
  // "Auditório trocado manualmente" é persistido no próprio form como flag
  // `${itemId}_price_manual`. Vive no form (pai) → sobrevive ao desmonte do
  // ItemsStep entre passos E é serializado com o orçamento (save/reload).
  const AUDITORIUM_MANUAL_SUFFIX = "_price_manual";
  const markAuditoriumManual = (eventId: string, itemId: string) => {
    setValue(`items.${eventId}.${itemId}${AUDITORIUM_MANUAL_SUFFIX}`, true, {
      shouldDirty: true,
      shouldValidate: false,
    });
  };
  const isAuditoriumManual = (eventId: string, itemId: string) =>
    Boolean(getItemRaw(eventId, `${itemId}${AUDITORIUM_MANUAL_SUFFIX}`));

  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADM_MASTER" || user?.role === "ADM_GERENTE";
  const { itemRequests, addItemRequest, updateItemRequest, removeItemRequest } = useDiscountRequestsStore();
  const {
    getItemRaw,
    getItemNumber,
    hasItemValue,
    getBudgetId,
    getClientName,
    getParticipationQty,
  } = useItemsStepFormReaders(formValues);
  const derivedRuleByEventItem = useMemo(() => {
    const derivedItemRules = getDerivedItemRules();
    const map = new Map<string, (typeof derivedItemRules)[number]["quantity"]>();
    derivedItemRules.forEach((rule) => {
      map.set(`${rule.eventId}::${rule.itemId}`, rule.quantity);
    });
    return map;
  }, []);

  const getItemAdditionalQty = (item: BudgetCatalogItem) =>
    item.hasAdditional && Number.isFinite(Number(item.additionalQuantity))
      ? Math.max(0, Math.floor(Number(item.additionalQuantity)))
      : 0;

  const getItemMultiplier = (item: BudgetCatalogItem) =>
    item.hasMultiplier && Number.isFinite(Number(item.multiplierQuantity)) && Number(item.multiplierQuantity) > 0
      ? Math.floor(Number(item.multiplierQuantity))
      : 1;

  const applyItemQtyRules = (item: BudgetCatalogItem, baseQty: number) =>
    baseQty * getItemMultiplier(item) + getItemAdditionalQty(item);

  const getDerivedDefaultQty = (eventId: string, item: BudgetCatalogItem, participationQty: number) => {
    const rule = item.quantityRule ?? derivedRuleByEventItem.get(`${eventId}::${item.id}`);
    if (!rule) return null;
    return applyItemQtyRules(item, resolveRuleQuantity(participationQty, rule));
  };

  const selectedEvents = orderSelectedEvents(
    budgetEvents.filter((event) => selectedEventIds.includes(event.id)),
    eventOrder,
  );

  // Ordem exibida no índice: durante o arrasto usa o preview vivo (dragOrder).
  const tocEvents = dragOrder
    ? (dragOrder
        .map((id) => selectedEvents.find((event) => event.id === id))
        .filter(Boolean) as typeof selectedEvents)
    : selectedEvents;

  // Enquanto arrasta, recalcula a ordem prévia movendo o evento sobre o alvo.
  const previewEventReorder = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const base = dragOrder ?? selectedEvents.map((event) => event.id);
    const from = base.indexOf(draggedId);
    const to = base.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    const ids = [...base];
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    let objs = ids
      .map((id) => selectedEvents.find((event) => event.id === id))
      .filter(Boolean) as typeof selectedEvents;
    if (!allowAnyEventMove) objs = enforceFixedEventRules(objs);
    setDragOrder(objs.map((event) => event.id));
  };

  const commitEventReorder = () => {
    if (dragOrder) {
      setValue("eventOrder", dragOrder, { shouldDirty: true });
    }
    setDragOrder(null);
    setDraggingEventId(null);
  };

  // Muda quando um auditório passa a existir/sair ou quando o nº de formandos do
  // evento muda — dispara o efeito de auto-seleção sem re-rodar a cada tecla.
  const auditoriumSyncSignature = useMemo(
    () =>
      selectedEvents
        .flatMap((event) =>
          event.items
            .filter((item) => isAuditoriumItemByIdOrName(item.id, item.name))
            .map((item) => `${event.id}:${item.id}:${getParticipationQty(event.id)}`),
        )
        .join("|"),
    [selectedEvents, getParticipationQty],
  );

  const buildRepeatedPricedItemUi = (
    eventId: string,
    itemId: string,
    config: RepeatedPricedItemConfig,
  ) => {
    const baseQty =
      config.qtySource === "ensaioFotografico"
        ? getParticipationQty("ensaio_fotografico")
        : getParticipationQty(eventId);
    const currentPrice = getItemNumber(eventId, `${itemId}_price`, config.priceDefault);
    const currentQtyVal = getItemNumber(eventId, itemId, baseQty);

    return {
      currentQty: currentQtyVal,
      displayPrice: (
        <RHFPriceInput
          name={`items.${eventId}.${itemId}_price`}
          control={control}
          defaultValue={currentPrice}
          className={itemsStyles.priceInput}
          readOnly={config.priceReadOnly}
        />
      ),
      qtyInput: (
        <BudgetQtyInput
          name={`items.${eventId}.${itemId}`}
          value={currentQtyVal}
        />
      ),
      displayTotal: new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(currentQtyVal * currentPrice),
    };
  };

  const buildConfiguredItemUi = (
    eventId: string,
    itemId: string,
    config: ConfiguredItemUiConfig,
  ): ResolvedItemUi => {
    const currentPrice = getItemNumber(eventId, `${itemId}_price`, config.priceDefault);
    const currentQtyVal = getItemNumber(eventId, itemId, config.qtyDefault);

    return {
      currentQty: currentQtyVal,
      displayPrice: config.useAuditoriumSelector ? (
        // Auditório: picker fica no nome do item. Aqui só o valor — editável (BRL)
        // se o auditório permite, senão texto fixo (BRL). Nunca segundo select.
        <AuditoriumPriceCell
          eventId={eventId}
          itemId={itemId}
          defaultPrice={currentPrice}
          className={itemsStyles.priceInput}
          onEdited={() => markAuditoriumManual(eventId, itemId)}
        />
      ) : (
        <RHFPriceInput
          name={`items.${eventId}.${itemId}_price`}
          control={control}
          defaultValue={currentPrice}
          className={itemsStyles.priceInput}
          readOnly={config.priceReadOnly}
        />
      ),
      qtyInput: config.qtyEditable ? (
        <BudgetQtyInput
          name={`items.${eventId}.${itemId}`}
          value={currentQtyVal}
        />
      ) : (
        <span className={clsx(itemsStyles.qtyInput, itemsStyles.readOnly)}>
          {config.qtyReadOnlyValue !== undefined && !hasItemValue(eventId, itemId)
            ? config.qtyReadOnlyValue
            : currentQtyVal}
        </span>
      ),
      displayTotal: new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(currentQtyVal * currentPrice),
    };
  };

  const buildEditableQtyInput = (eventId: string, itemId: string, defaultValue: number) => (
    <BudgetQtyInput
      name={`items.${eventId}.${itemId}`}
      value={getItemNumber(eventId, itemId, defaultValue)}
    />
  );

  const buildIncludedItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
    defaultQty: number,
    qtyInputOverride?: ReactNode,
  ): ResolvedItemUi => ({
    currentQty: getItemNumber(eventId, item.id, defaultQty),
    displayPrice: item.displayValue,
    qtyInput: qtyInputOverride ?? <span className={itemsStyles.centerText}>{item.fixedQty || "-"}</span>,
    displayTotal: item.displayValue,
  });

  const buildBaseCatalogItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
    genericDefaultQty: number,
  ): ResolvedItemUi => {
    const eventItemValues = (formValues.items?.[eventId] ?? {}) as Record<string, unknown>;
    const baseQtyEditable = item.quantityEditable ?? true;
    const basePriceEditable = item.priceEditable ?? true;
    const variationDefaultQty = getVariationDrivenQuantity(item, eventItemValues, genericDefaultQty || 1);
    const variationDefaultPrice = getVariationDrivenUnitPrice(item, eventItemValues, item.unitPrice || 0);
    const baseQty = getItemNumber(eventId, item.id, variationDefaultQty);
    const currentPrice = getItemNumber(eventId, `${item.id}_price`, variationDefaultPrice);

    return {
      currentQty: baseQty,
      displayPrice: item.displayValue
        ? item.displayValue
        : basePriceEditable
          ? (
              <RHFPriceInput
                name={`items.${eventId}.${item.id}_price`}
                control={control}
                defaultValue={currentPrice}
                className={itemsStyles.priceInput}
              />
            )
          : formatCurrency(currentPrice),
      qtyInput: baseQtyEditable
        ? buildEditableQtyInput(eventId, item.id, variationDefaultQty)
        : <span className={clsx(itemsStyles.qtyInput, itemsStyles.readOnly)}>{baseQty}</span>,
      displayTotal: item.displayValue
        ? item.displayValue
        : formatCurrency(baseQty * currentPrice),
    };
  };

  const buildCultoOrMusicItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
    currentQty: number,
    qtyInputFallback: ReactNode,
  ): ResolvedItemUi => {
    const isMusicAttraction = isMusicAttractionItem(item.id);
    const eventItemValues = (formValues.items?.[eventId] ?? {}) as Record<string, unknown>;
    const currentPrice = hasItemValue(eventId, `${item.id}_price`)
      ? getItemNumber(eventId, `${item.id}_price`, 0)
      : (isMusicAttraction ? getVariationDrivenUnitPrice(item, eventItemValues, 500) : 0);
    const resolvedQty = isMusicAttraction
      ? getItemNumber(
          eventId,
          item.id,
          getVariationDrivenQuantity(item, eventItemValues, item.fixedQty || 1),
        )
      : currentQty;

    return {
      currentQty: resolvedQty,
      displayPrice: (
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <span
            style={{
              position: "absolute",
              left: "10px",
              fontSize: "13px",
              color: "#6b7280",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            R$
          </span>
          <Input
            type="number"
            min={isMusicAttraction ? "500" : "0"}
            className={itemsStyles.priceInput}
            style={{ paddingLeft: "32px" }}
            placeholder="0.00"
            defaultValue={currentPrice}
            {...register(`items.${eventId}.${item.id}_price`, {
              valueAsNumber: true,
              value: currentPrice,
            })}
          />
        </div>
      ),
      qtyInput: isMusicAttraction
        ? (
            <span className={clsx(itemsStyles.qtyInput, itemsStyles.readOnly)}>
              {resolvedQty}
            </span>
          )
        : qtyInputFallback,
      displayTotal: formatCurrency(resolvedQty * currentPrice),
    };
  };

  const buildMusicAttractionItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
  ): ResolvedItemUi => {
    const eventItemValues = (formValues.items?.[eventId] ?? {}) as Record<string, unknown>;
    const currentPrice = getItemNumber(
      eventId,
      `${item.id}_price`,
      getVariationDrivenUnitPrice(item, eventItemValues, 500),
    );
    const currentQty = getItemNumber(
      eventId,
      item.id,
      getVariationDrivenQuantity(item, eventItemValues, item.fixedQty || 1),
    );
    return {
      currentQty,
      displayPrice: (
        <RHFPriceInput
          name={`items.${eventId}.${item.id}_price`}
          control={control}
          defaultValue={currentPrice}
          className={itemsStyles.priceInput}
          readOnly
        />
      ),
      qtyInput: <span className={clsx(itemsStyles.qtyInput, itemsStyles.readOnly)}>{currentQty}</span>,
      displayTotal: formatCurrency(currentPrice * currentQty),
    };
  };

  const buildBudgetFixedValueUi = (
    eventId: string,
    item: BudgetCatalogItem,
  ): ResolvedItemUi => ({
    currentQty: 1,
    displayPrice: formatCurrency(item.unitPrice || 0),
    qtyInput: <span className={clsx(itemsStyles.qtyInput, itemsStyles.readOnly)}>1</span>,
    displayTotal: formatCurrency(getItemNumber(eventId, item.id, item.unitPrice || 0)),
  });

  const buildFestaItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
  ): ResolvedItemUi | null => {
    let resolved: ResolvedItemUi | null = item.displayValue
      ? buildIncludedItemUi(eventId, item, item.fixedQty ?? 0)
      : null;

    const festaConfig = FESTA_ITEM_CONFIGS[item.id];
    if (festaConfig) {
      resolved = buildRepeatedPricedItemUi(eventId, item.id, festaConfig);
    }

    if (isMusicAttractionItem(item.id)) {
      resolved = buildMusicAttractionItemUi(eventId, item);
    }

    if (isBudgetFixedValueItem(item.id)) {
      resolved = buildBudgetFixedValueUi(eventId, item);
    }

    return resolved;
  };

  const buildEnsaioFotograficoItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
  ): ResolvedItemUi | null => {
    let resolved: ResolvedItemUi | null = item.displayValue
      ? buildIncludedItemUi(eventId, item, item.fixedQty ?? 0)
      : null;

    const ensaioConfig = ENSAIO_ITEM_CONFIGS[item.id];
    if (ensaioConfig) {
      resolved = buildRepeatedPricedItemUi(eventId, item.id, ensaioConfig);
    }

    if (isBudgetFixedValueItem(item.id)) {
      resolved = buildBudgetFixedValueUi(eventId, item);
    }

    return resolved;
  };

  const buildSimpleEnsaioItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
    participationQty: number,
  ): ResolvedItemUi | null => {
    let resolved: ResolvedItemUi | null = item.displayValue
      ? buildIncludedItemUi(
          eventId,
          item,
          participationQty,
          isStudentPhotoSessionItem(item.id)
            ? buildEditableQtyInput(eventId, item.id, participationQty)
            : undefined,
        )
      : null;

    const ensaioConfig = ENSAIO_ITEM_CONFIGS[item.id];
    if (ensaioConfig) {
      resolved = buildRepeatedPricedItemUi(eventId, item.id, ensaioConfig);
    }

    if (isBudgetFixedValueItem(item.id)) {
      resolved = buildBudgetFixedValueUi(eventId, item);
    }

    return resolved;
  };

  const buildDescerramentoItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
    participationQty: number,
  ): ResolvedItemUi | null => {
    let resolved: ResolvedItemUi | null = item.displayValue
      ? buildIncludedItemUi(eventId, item, item.fixedQty ?? 0)
      : null;

    const descerramentoConfig = getDescerramentoItemConfig(item.id, participationQty);
    if (descerramentoConfig) {
      resolved = buildConfiguredItemUi(eventId, item.id, descerramentoConfig);
    }

    return resolved;
  };

  const buildAulaSaudadeItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
    participationQty: number,
  ): ResolvedItemUi | null => {
    let resolved: ResolvedItemUi | null = item.displayValue
      ? buildIncludedItemUi(
          eventId,
          item,
          item.fixedQty ?? 1,
          item.id === "mesas_cadeiras"
            ? buildEditableQtyInput(eventId, item.id, participationQty)
            : <span className={itemsStyles.centerText}>{item.fixedQty || (item.displayValue === "-" ? "-" : 1)}</span>,
        )
      : null;

    const aulaSaudadeConfig = getAulaSaudadeItemConfig(item.id, participationQty);
    if (aulaSaudadeConfig) {
      resolved = buildConfiguredItemUi(eventId, item.id, aulaSaudadeConfig);
    }

    return resolved;
  };

  const buildMissaItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
    participationQty: number,
  ): ResolvedItemUi | null => {
    let resolved: ResolvedItemUi | null = item.displayValue
      ? buildIncludedItemUi(
          eventId,
          item,
          item.fixedQty ?? 0,
          item.id === "rosas_padrinhos"
            ? <span className={clsx(itemsStyles.qtyInput, itemsStyles.readOnly)}>{participationQty}</span>
            : item.id === "marcadores_bancos"
              ? <span className={clsx(itemsStyles.qtyInput, itemsStyles.readOnly)}>{participationQty * 2}</span>
              : undefined,
        )
      : null;

    const missaConfig = getMissaItemConfig(item.id, participationQty);
    if (missaConfig) {
      resolved = buildConfiguredItemUi(eventId, item.id, missaConfig);
    }

    return resolved;
  };

  const buildColacaoLikeItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
    participationQty: number,
    configResolver: (itemId: string, qty: number) => ConfiguredItemUiConfig | null,
  ): ResolvedItemUi | null => {
    let resolved: ResolvedItemUi | null = item.displayValue
      ? buildIncludedItemUi(
          eventId,
          item,
          item.fixedQty ?? 0,
          isStudentChairsItem(item.id)
            ? buildEditableQtyInput(eventId, item.id, participationQty)
            : undefined,
        )
      : null;

    const config = configResolver(item.id, participationQty);
    if (config) {
      resolved = buildConfiguredItemUi(eventId, item.id, config);
    }

    return resolved;
  };

  const buildCoberturaItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
    participationQty: number,
  ): ResolvedItemUi | null => {
    if (!isContractedEventPhotoSessionItem(item.id)) return null;

    const currentPrice = getItemNumber(eventId, "sessao_fotografica_solenidades_price", 960);
    const currentQtyVal = getItemNumber(eventId, item.id, participationQty);
    return {
      currentQty: currentQtyVal,
      displayPrice: (
        <RHFPriceInput
          name={`items.${eventId}.sessao_fotografica_solenidades_price`}
          control={control}
          defaultValue={currentPrice}
          className={itemsStyles.priceInput}
        />
      ),
      qtyInput: (
        <BudgetQtyInput
          name={`items.${eventId}.sessao_fotografica_solenidades`}
          value={currentQtyVal}
        />
      ),
      displayTotal: formatCurrency(currentQtyVal * currentPrice),
    };
  };

  const buildEvento100DiasItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
    participationQty: number,
  ): ResolvedItemUi => {
    const currentQtyVal =
      item.id === "open_bar_100dias"
        ? getItemNumber(eventId, item.id, participationQty)
        : getItemNumber(eventId, item.id, item.fixedQty ?? 0);

    return {
      currentQty: currentQtyVal,
      displayPrice: item.displayValue || "-",
      displayTotal: item.displayValue || "-",
      qtyInput:
        item.id === "open_bar_100dias"
          ? buildEditableQtyInput(eventId, item.id, participationQty)
          : <span className={itemsStyles.centerText}>{item.fixedQty || "-"}</span>,
    };
  };

  const buildItensDescerramentoLegacyItemUi = (
    eventId: string,
    item: BudgetCatalogItem,
    participationQty: number,
  ): ResolvedItemUi | null => {
    if (item.id === "placa_formatura") {
      // Quantidade e preço continuam não editáveis aqui, mas precisam refletir
      // o que está salvo (ex.: alteração feita pelo anexo contratual).
      const placaQty = getItemNumber(eventId, item.id, 1);
      const placaPrice = getItemNumber(
        eventId,
        `${item.id}_price`,
        item.unitPrice || 0,
      );
      return {
        currentQty: placaQty,
        displayPrice: formatCurrency(placaPrice),
        qtyInput: (
          <span className={clsx(itemsStyles.qtyInput, itemsStyles.readOnly)}>
            {placaQty}
          </span>
        ),
        displayTotal: formatCurrency(placaQty * placaPrice),
      };
    }

    if (item.id === "administracao") {
      return {
        currentQty: 0,
        displayPrice: "-",
        qtyInput: <span className={itemsStyles.centerText}>-</span>,
        displayTotal: "-",
      };
    }

    if (!isPlaqueReplicaItem(item.id)) {
      return null;
    }

    const replicaPrice = getItemNumber(eventId, "replica_placa_price", 65);
    const replicaQty = getItemNumber(eventId, "replica_placa", participationQty);

    return {
      currentQty: replicaQty,
      displayPrice: (
        <RHFPriceInput
          name={`items.${eventId}.replica_placa_price`}
          control={control}
          defaultValue={replicaPrice}
          className={itemsStyles.priceInput}
          readOnly
        />
      ),
      qtyInput: buildEditableQtyInput(eventId, "replica_placa", participationQty),
      displayTotal: formatCurrency(replicaQty * replicaPrice),
    };
  };

  const renderSimpleEnsaioSummary = (
    eventId: string,
    coffeeItemId: "coffee_break_ensaio50" | "coffee_break_ensaio365",
    total: number,
    participationQty: number,
  ) => {
    const ensaioSummary = buildSimpleEnsaioSummary(
      createSummaryBuildContext(eventId, participationQty),
      coffeeItemId,
    );
    const custoFormando = participationQty > 0 ? total / participationQty : 0;

    return (
      <Ensaio50Summary
        coffeeQty={ensaioSummary.coffeeQty}
        coffeePrice={ensaioSummary.coffeePrice}
        valorOrcamento={ensaioSummary.valorOrcamento}
        subTotal={ensaioSummary.subTotal}
        administracao={ensaioSummary.administracao}
        total={total}
        participationQty={participationQty}
        costPerStudent={custoFormando}
        isCoffeeActive={ensaioSummary.isCoffeeActive}
      />
    );
  };

  const getAddedItemsTotal = (eventId: string) =>
    getItemsStepAddedItemsTotal(customItems, eventId);

  const createIsItemActive = (eventId: string) =>
    createItemsStepItemActiveResolver(customItems, eventId);

  const createSummaryBuildContext = (
    eventId: string,
    participationQty: number,
  ) => ({
    eventId,
    participationQty,
    getItemNumber,
    getItemRaw,
    getParticipationQty,
    getAddedItemsTotal,
    isItemActive: createIsItemActive(eventId),
    defaultAuditoriumPrice: getDefaultAuditoriumPrice(),
    getMusicAttractionLabel,
  });

  const isItemQtyDirty = (eventId: string, itemId: string) => {
    const itemsDirty =
      (formState.dirtyFields as Record<string, unknown> | undefined)?.items as
        | Record<string, unknown>
        | undefined;
    const eventDirty = itemsDirty?.[eventId] as Record<string, unknown> | undefined;
    return Boolean(eventDirty?.[itemId]);
  };
  
  // Discount Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{
        eventId: string; 
        itemId: string; 
        itemName: string; 
        unitPrice: number;
        currentTotalValue: number;
        isEditing?: boolean;
        initialPercent?: number;
        initialMode?: DiscountMode;
        /** Valor em reais já pedido, quando o pedido salvo é de valor fixo. */
        initialAmount?: number;
        initialReason?: string;
        requestId?: string;
  } | null>(null);

  // Remove Item Modal State
  const [itemToRemove, setItemToRemove] = useState<{ eventId: string; itemId: string | number; isAdded: boolean } | null>(null);

  const handleOpenDiscountModal = (
    eventId: string,
    itemId: string,
    itemName: string,
    unitPrice: number,
    currentTotalValue: number,
  ) => {
      const budgetId = getBudgetId();
      const requests = itemRequests[budgetId] || [];
      const existing = requests.find(r => r.eventId === eventId && r.itemId === itemId);

      if (existing) {
          setSelectedItem({ 
              eventId, 
              itemId, 
              itemName, 
              unitPrice,
              currentTotalValue,
              isEditing: true,
              // Reabre na unidade em que foi pedido: um pedido de R$ 500
              // mostrando "6,74%" pareceria outro desconto.
              ...(() => {
                const pedido = resolveItemDiscountInput(existing);
                return pedido.mode === "FIXED"
                  ? { initialMode: pedido.mode, initialAmount: pedido.value }
                  : { initialMode: pedido.mode, initialPercent: pedido.value };
              })(),
              initialReason: existing.reason,
              requestId: existing.id
          });
      } else {
          setSelectedItem({ eventId, itemId, itemName, unitPrice, currentTotalValue, isEditing: false });
      }
      setModalOpen(true);
  };

  const getDiscountRequestsForItem = (eventId: string, itemId: string) => {
    const requests = itemRequests?.[getBudgetId()] || [];
    return {
      pending: requests.find((request) => (
        request.eventId === eventId &&
        request.itemId === itemId &&
        request.status === "PENDING"
      )),
      approved: requests.find((request) => (
        request.eventId === eventId &&
        request.itemId === itemId &&
        request.status === "APPROVED"
      )),
    };
  };

  const renderDiscountAction = (
    eventId: string,
    itemId: string,
    itemName: string,
    unitPrice: number,
    currentTotalValue: number,
    canHaveDiscount: boolean,
  ): ReactNode => {
    const { pending, approved } = getDiscountRequestsForItem(eventId, itemId);

    if (approved) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px" }}>
          <span style={{ color: "#16a34a", fontWeight: "bold", fontSize: "11px", backgroundColor: "#dcfce7", padding: "2px 6px", borderRadius: "4px" }}>
            {formatItemDiscount(approved)} OFF
          </span>
          <button
            type="button"
            onClick={() => handleOpenDiscountModal(eventId, itemId, itemName, unitPrice, currentTotalValue)}
            style={{ fontSize: "11px", color: "#2563eb", textDecoration: "underline", border: "none", background: "none", cursor: "pointer", padding: 0 }}
            title="Editar desconto"
          >
            Editar / Remover
          </button>
        </div>
      );
    }

    if (!canHaveDiscount) {
      return "-";
    }

    if (pending) {
      return (
        <span className="text-yellow-600 font-medium text-xs bg-yellow-100 px-2 py-1 rounded-full">
          {formatItemDiscount(pending)} (Pendente)
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={() => handleOpenDiscountModal(eventId, itemId, itemName, unitPrice, currentTotalValue)}
        className="text-xs text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
        title={isAdmin ? "Aplicar desconto" : "Solicitar desconto"}
      >
        <Tags size={14} /> {isAdmin ? "Aplicar" : "Solicitar"}
      </button>
    );
  };

  const renderDiscountedTotal = (totalValue: number, eventId: string, itemId: string): ReactNode => {
    const { approved } = getDiscountRequestsForItem(eventId, itemId);

    if (!approved) {
      return formatCurrency(totalValue);
    }

    const approvedPercent = getAppliedItemDiscountPercentage(approved, totalValue);
    const finalValue = totalValue - totalValue * (approvedPercent / 100);

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: "1.2" }}>
        <span style={{ fontSize: "11px", textDecoration: "line-through", color: "#9ca3af", marginRight: "4px" }}>
          {formatCurrency(totalValue)}
        </span>
        <span style={{ fontSize: "14px", fontWeight: "bold", color: "#16a34a" }}>
          {formatCurrency(finalValue)}
        </span>
      </div>
    );
  };

  const renderEventSummary = (
    canonicalEventId: string,
    eventId: string,
    participationQty: number,
    displayEventTotal: number,
    costPerStudent: number,
  ): ReactNode => {
    const summaryContext = createSummaryBuildContext(eventId, participationQty);
    const catalogEvent = budgetEvents.find(e => e.id === eventId);
    const eventValue = Number(catalogEvent?.value) || 0;
    const hasAdministration = catalogEvent?.has_administration ?? false;

    switch (canonicalEventId) {
      case "descerramento_placa": {
        const descSummary = buildDescerramentoSummary(summaryContext);
        return (
          <DescerramentoSummary
            replicaQty={descSummary.replicaQty}
            replicaPrice={descSummary.replicaPrice}
            replicaTotal={descSummary.replicaTotal}
            coffeeQty={descSummary.coffeeQty}
            coffeePrice={descSummary.coffeePrice}
            coffeeTotal={descSummary.coffeeTotal}
            valorFixo={descSummary.valorFixo}
            subTotal={descSummary.subTotal}
            administracao={descSummary.administracao}
            total={displayEventTotal}
            participationQty={participationQty}
            costPerStudent={costPerStudent}
            isReplicaActive={descSummary.isReplicaActive}
            isCoffeeActive={descSummary.isCoffeeActive}
          />
        );
      }
      case "aula_saudade": {
        const aulaSummary = buildAulaSaudadeSummary(summaryContext);
        return (
          <AulaSaudadeSummary
            buffetTotal={aulaSummary.buffetTotal}
            drinksQty={aulaSummary.drinksQty}
            drinksPrice={aulaSummary.drinksPrice}
            drinksTotal={aulaSummary.drinksTotal}
            atracaoPrice={aulaSummary.atracaoPrice}
            atracaoLabel={aulaSummary.atracaoLabel}
            valorFixo={aulaSummary.valorFixo}
            subTotal={aulaSummary.subTotal}
            administracao={aulaSummary.administracao}
            total={displayEventTotal}
            participationQty={participationQty}
            costPerStudent={costPerStudent}
            isBuffetActive={aulaSummary.isBuffetActive}
            isDrinksActive={aulaSummary.isDrinksActive}
            isAtracaoActive={aulaSummary.isAtracaoActive}
          />
        );
      }
      case "missa_culto": {
        const missaSummary = buildMissaSummary(summaryContext);
        return (
          <MissaSummary
            missalQty={missaSummary.missalQty}
            missalPrice={missaSummary.missalPrice}
            sacraPrice={missaSummary.sacraPrice}
            taxaPrice={missaSummary.taxaPrice}
            valorFixo={missaSummary.valorFixo}
            subTotal={missaSummary.subTotal}
            administracao={missaSummary.administracao}
            total={displayEventTotal}
            participationQty={participationQty}
            costPerStudent={costPerStudent}
            isMissalActive={missaSummary.isMissalActive}
            isSacraActive={missaSummary.isSacraActive}
            isTaxaActive={missaSummary.isTaxaActive}
          />
        );
      }
      case "colacao_descerramento": {
        const colacaoSummary = buildColacaoSummary(summaryContext);
        return (
          <ColacaoSummary
            itensDescerramento={colacaoSummary.itensDescerramento}
            becasQty={colacaoSummary.becasQty}
            becasPrice={colacaoSummary.becasPrice}
            canudosQty={colacaoSummary.canudosQty}
            canudosPrice={colacaoSummary.canudosPrice}
            auditorio={colacaoSummary.auditorio}
            painelQty={colacaoSummary.painelQty}
            painelPrice={colacaoSummary.painelPrice}
            arquiQty={colacaoSummary.arquiQty}
            arquiPrice={colacaoSummary.arquiPrice}
            valorEvento={colacaoSummary.valorEvento}
            subTotal={colacaoSummary.subTotal}
            administracao={colacaoSummary.administracao}
            total={displayEventTotal}
            participationQty={participationQty}
            costPerStudent={costPerStudent}
            isItensDescerramentoActive={colacaoSummary.isItensDescerramentoActive}
            isBecasActive={colacaoSummary.isBecasActive}
            isCanudosActive={colacaoSummary.isCanudosActive}
            isAuditorioActive={colacaoSummary.isAuditorioActive}
            isPainelActive={colacaoSummary.isPainelActive}
            isArquibancadaActive={colacaoSummary.isArquibancadaActive}
          />
        );
      }
      case "cerimonia_colacao": {
        const cerimoniaSummary = buildCerimoniaSummary(summaryContext);
        return (
          <CerimoniaSummary
            becasQty={cerimoniaSummary.becasQty}
            becasPrice={cerimoniaSummary.becasPrice}
            canudosQty={cerimoniaSummary.canudosQty}
            canudosPrice={cerimoniaSummary.canudosPrice}
            auditorio={cerimoniaSummary.auditorio}
            arquiQty={cerimoniaSummary.arquiQty}
            arquiPrice={cerimoniaSummary.arquiPrice}
            placaQty={cerimoniaSummary.placaQty}
            placaPrice={cerimoniaSummary.placaPrice}
            valorEvento={cerimoniaSummary.valorEvento}
            subTotal={cerimoniaSummary.subTotal}
            administracao={cerimoniaSummary.administracao}
            total={displayEventTotal}
            participationQty={participationQty}
            costPerStudent={costPerStudent}
            isBecasActive={cerimoniaSummary.isBecasActive}
            isCanudosActive={cerimoniaSummary.isCanudosActive}
            isAuditorioActive={cerimoniaSummary.isAuditorioActive}
            isArquibancadaActive={cerimoniaSummary.isArquibancadaActive}
            isPlacaActive={cerimoniaSummary.isPlacaActive}
          />
        );
      }
      case "festa_50":
      case "festa_365": {
        const festaSummary = buildFestaSummary(summaryContext);
        return (
          <Festa50Summary
            buffetQty={festaSummary.buffetQty}
            buffetPrice={festaSummary.buffetPrice}
            openbarQty={festaSummary.openbarQty}
            openbarPrice={festaSummary.openbarPrice}
            atracaoPrice={festaSummary.atracaoPrice}
            atracaoLabel={festaSummary.atracaoLabel}
            drinksQty={festaSummary.drinksQty}
            drinksPrice={festaSummary.drinksPrice}
            camisaQty={festaSummary.camisaQty}
            camisaPrice={festaSummary.camisaPrice}
            valorEvento={festaSummary.valorEvento}
            subTotal={festaSummary.subTotal}
            administracao={festaSummary.administracao}
            total={displayEventTotal}
            participationQty={participationQty}
            costPerStudent={costPerStudent}
            isBuffetActive={festaSummary.isBuffetActive}
            isOpenbarActive={festaSummary.isOpenbarActive}
            isAtracaoActive={festaSummary.isAtracaoActive}
            isDrinksActive={festaSummary.isDrinksActive}
            isCamisaActive={festaSummary.isCamisaActive}
          />
        );
      }
      case "cobertura_fotografica": {
        const cobSubTotal = hasAdministration ? displayEventTotal / 1.1 : displayEventTotal;
        const cobAdmin = hasAdministration ? displayEventTotal - cobSubTotal : 0;
        return (
          <EventTotalSummary
            total={displayEventTotal}
            participationQty={participationQty}
            costPerStudent={costPerStudent}
            subTotal={cobSubTotal}
            administracao={hasAdministration ? cobAdmin : undefined}
          />
        );
      }
      case "ensaio_fotografico": {
        const ensaioSummary = buildEnsaioFotograficoSummary(summaryContext);
        return (
          <EnsaioSummary
            becaQty={ensaioSummary.becaQty}
            becaPrice={ensaioSummary.becaPrice}
            coffeeQty={ensaioSummary.coffeeQty}
            coffeePrice={ensaioSummary.coffeePrice}
            valorFixo={ensaioSummary.valorFixo}
            subTotal={ensaioSummary.subTotal}
            administracao={ensaioSummary.administracao}
            total={displayEventTotal}
            participationQty={participationQty}
            costPerStudent={costPerStudent}
            isBecaActive={ensaioSummary.isBecaActive}
            isCoffeeActive={ensaioSummary.isCoffeeActive}
          />
        );
      }
      case "ensaio_50":
        return renderSimpleEnsaioSummary(
          eventId,
          SIMPLE_ENSAIO_EVENT_COFFEE_ITEM.ensaio_50,
          displayEventTotal,
          participationQty,
        );
      case "ensaio_365":
        return renderSimpleEnsaioSummary(
          eventId,
          SIMPLE_ENSAIO_EVENT_COFFEE_ITEM.ensaio_365,
          displayEventTotal,
          participationQty,
        );
      case "culto_cortesia":
      case "evento_100_dias":
        return <CourtesyTotalRow total={displayEventTotal} />;
      default: {
        const evSubTotal = hasAdministration ? displayEventTotal / 1.1 : displayEventTotal;
        const evAdmin = hasAdministration ? displayEventTotal - evSubTotal : 0;
        const chargeableRows: { label: string; value: number }[] = [];

        catalogEvent?.items.forEach((item) => {
          if (item.isHeader) return;
          if (item.id.startsWith("administracao")) return;
          if (isValorEventoItem(item.name)) return;
          if (customItems[eventId]?.removedIds?.includes(item.id)) return;

          const eventItemValues = (formValues.items?.[eventId] ?? {}) as Record<string, unknown>;
          const derived = getDerivedDefaultQty(eventId, item, participationQty);
          const defaultQty =
            derived ??
            (item.dynamicByStudents
              ? applyItemQtyRules(item, participationQty)
              : applyItemQtyRules(item, getVariationDrivenQuantity(item, eventItemValues, item.defaultQuantity ?? item.fixedQty ?? 1)));
          const currentQty = getItemNumber(eventId, item.id, defaultQty);
          const price = getItemNumber(
            eventId,
            `${item.id}_price`,
            getVariationDrivenUnitPrice(item, eventItemValues, item.unitPrice ?? 0),
          );
          const variationLabel = eventItemValues[`${item.id}_variation_label`];
          let total = currentQty * price;
          if (total <= 0) return;

          const approved = getDiscountRequestsForItem(eventId, item.id).approved;
          if (approved) {
            total = total - total * (getAppliedItemDiscountPercentage(approved, total) / 100);
          }

          chargeableRows.push({
            label:
              typeof variationLabel === "string" && variationLabel.trim()
                ? `${item.name} (${variationLabel.trim()}) (${currentQty} un x ${formatCurrency(price)})`
                : `${item.name} (${currentQty} un x ${formatCurrency(price)})`,
            value: total,
          });
        });

        customItems[eventId]?.added?.forEach((addedItem, idx) => {
          if (addedItem.isNoFixedValue) return;
          const qty = addedItem.quantity ?? 0;
          const price = addedItem.unitPrice ?? 0;
          const selectedVariationLabel = addedItem.variations?.find(
            (variation) => variation.id === addedItem.selectedVariationId,
          )?.name;
          let total = qty * price;
          if (total <= 0) return;

          const itemId = addedItem.id || `added_${idx}`;
          const approved = getDiscountRequestsForItem(eventId, itemId).approved;
          if (approved) {
            total = total - total * (getAppliedItemDiscountPercentage(approved, total) / 100);
          }

          chargeableRows.push({
            label:
              selectedVariationLabel
                ? `${addedItem.name ?? "Item adicionado"} (${selectedVariationLabel}) (${qty} un x ${formatCurrency(price)})`
                : `${addedItem.name ?? "Item adicionado"} (${qty} un x ${formatCurrency(price)})`,
            value: total,
          });
        });

        return (
          <>
            {chargeableRows.map((row, idx) => (
              <SummaryDetailRow
                key={`chargeable_${eventId}_${idx}`}
                label={row.label}
                value={row.value}
              />
            ))}
            <EventTotalSummary
              total={displayEventTotal}
              participationQty={participationQty}
              costPerStudent={costPerStudent}
              valorEvento={eventValue > 0 ? eventValue : undefined}
              subTotal={evSubTotal}
              administracao={hasAdministration ? evAdmin : undefined}
            />
          </>
        );
      }
    }
  };

  // Seletor de auditório (Cristal/Platina) estilizado, renderizado abaixo do nome do
  // item. Padrão dirigido por formandos (< 25 → Cristal, >= 25 → Platina), trocável.
  const renderAuditoriumSelect = (eventId: string, item: BudgetCatalogItem) => {
    const priceField = `${item.id}_price`;
    const slugField = `${item.id}_auditorium_slug`;
    // So os auditorios da cidade do orcamento aparecem no select.
    const options = getAuditoriumOptionsForCity(budgetCity);
    const fallbackPrice = getParticipantDrivenAuditoriumPrice(getParticipationQty(eventId));
    const currentPrice = getItemNumber(eventId, priceField, fallbackPrice);
    // Qual auditório está selecionado: slug salvo (estável mesmo se o valor for
    // editado) → casa pelo valor atual → primeira opção.
    const savedSlug = getValues(`items.${eventId}.${slugField}`) as string | undefined;
    const selectedOption =
      options.find((o) => o.slug === savedSlug) ??
      options.find((o) => o.value === currentPrice) ??
      options[0];

    // Só o picker do auditório. O valor (fixo ou editável BRL) fica na coluna de preço.
    return (
      <Controller
        name={`items.${eventId}.${priceField}`}
        control={control}
        defaultValue={currentPrice}
        render={({ field }) => (
          <div className={itemsStyles.auditoriumSelectWrap}>
            <select
              className={itemsStyles.auditoriumSelect}
              value={selectedOption?.slug ?? ""}
              onChange={(e) => {
                const opt = options.find((o) => o.slug === e.target.value);
                if (!opt) return;
                setValue(`items.${eventId}.${slugField}`, opt.slug, { shouldDirty: true });
                field.onChange(Number(opt.value));
                markAuditoriumManual(eventId, item.id);
              }}
            >
              {options.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className={itemsStyles.auditoriumSelectIcon} />
          </div>
        )}
      />
    );
  };

  const renderCatalogDisplayName = (
    eventId: string,
    item: BudgetCatalogItem,
  ): ReactNode => {
    const itemVariations = resolveCatalogItemVariations(item);

    // Item de auditório (detecta por id OU nome): nome + seletor Cristal/Platina
    // estilizado logo abaixo. Suprime o VariationSelector para não duplicar.
    if (isAuditoriumItemByIdOrName(item.id, item.name)) {
      return (
        <span className={itemsStyles.auditoriumNameCell}>
          <span>{item.name}</span>
          {renderAuditoriumSelect(eventId, item)}
        </span>
      );
    }

    if (itemVariations.length > 0) {
      return (
        <span style={{ display: "inline-flex", flexDirection: "column", gap: "2px" }}>
          <span>{item.name}</span>
          <VariationSelector eventId={eventId} item={item} />
        </span>
      );
    }

    if (isMusicAttractionItem(item.id)) {
      return (
        <Controller
          name={`items.${eventId}.atracao_musical_type`}
          control={control}
          defaultValue="dj"
          render={({ field }) => (
            <select
              {...field}
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "4px 6px",
                fontSize: "var(--font-size-sm)",
                color: "var(--color-text-main)",
                width: "auto",
                minWidth: "180px",
                cursor: "pointer",
              }}
            >
              {getMusicAttractionOptions().map((option) => (
                <option key={option.slug} value={option.slug}>
                  {getMusicAttractionLabel(option.slug)}
                </option>
              ))}
            </select>
          )}
        />
      );
    }

    return item.name;
  };

  const getCatalogItemTotalValueForDiscount = (
    eventId: string,
    item: BudgetCatalogItem,
    currentQty: number,
  ) => {
    if (isAuditoriumItemByIdOrName(item.id, item.name)) {
      return getResolvedAuditoriumPrice(item.id, formValues.items?.[eventId] ?? {});
    }

    const eventItemValues = (formValues.items?.[eventId] ?? {}) as Record<string, unknown>;
    const defaultPrice = isMusicAttractionItem(item.id)
      ? getVariationDrivenUnitPrice(item, eventItemValues, 500)
      : getVariationDrivenUnitPrice(item, eventItemValues, item.unitPrice ?? 0);
    const price = getItemNumber(eventId, `${item.id}_price`, defaultPrice);
    return price * currentQty;
  };

  const isStructuredIncludedCatalogItem = (
    item: BudgetCatalogItem,
    itemTotalValueForDiscount: number,
  ) => hasRenderableSubitems(item.hasSubitems, item.subitems) && itemTotalValueForDiscount <= 0;

  const handleRemoveDiscount = () => {
      if (!selectedItem) return;
      const budgetId = getBudgetId();
      removeItemRequest(budgetId, selectedItem.eventId, selectedItem.itemId);
      toast.success("Desconto removido com sucesso!");
      setModalOpen(false);
      setSelectedItem(null);
  };

  const handleSubmitDiscount = (
      valor: number,
      reason: string,
      attachment: File | null | undefined,
      modo: DiscountMode,
  ) => {
      if(!selectedItem) return;
      
      const budgetId = getBudgetId();
      const isApproved = isAdmin;
      // O percentual equivalente vai junto: e com ele que o motor de calculo e
      // os relatorios antigos trabalham. Em valor fixo quem manda e o valor.
      const { percent, amount } = resolveDiscountAmounts(selectedItem.currentTotalValue, {
          mode: modo,
          value: valor,
      });

      if (selectedItem.isEditing) {
          updateItemRequest(budgetId, selectedItem.eventId, selectedItem.itemId, {
              requestedPercentage: percent,
              discountMode: modo,
              requestedAmount: modo === "FIXED" ? amount : undefined,
              // Uma edicao substitui o pedido: o valor aprovado antes nao pode
              // continuar valendo por cima do novo.
              newDiscountPercent: undefined,
              newDiscountAmount: undefined,
              reason: reason,
              status: isApproved ? "APPROVED" : "PENDING",
              approvedBy: isApproved ? (user?.name || "Admin") : undefined,
              approvedAt: isApproved ? new Date().toISOString() : undefined,
              observation: isApproved ? "Desconto atualizado pelo gestor." : undefined
          });
          toast.success("Desconto atualizado com sucesso!");
      } else {
          addItemRequest(budgetId, {
              budgetId,
              clientName: getClientName(),
              eventId: selectedItem.eventId,
              itemId: selectedItem.itemId,
              itemName: selectedItem.itemName,
              originalUnitPrice: selectedItem.currentTotalValue,
              requestedPercentage: percent,
              discountMode: modo,
              requestedAmount: modo === "FIXED" ? amount : undefined,
              requestedBy: user?.name || "Vendedor",
              reason: reason,
              status: isApproved ? "APPROVED" : "PENDING",
              approvedBy: isApproved ? (user?.name || "Admin") : undefined,
              approvedAt: isApproved ? new Date().toISOString() : undefined,
              observation: isApproved ? "Desconto aplicado diretamente pelo gestor." : undefined,
              attachmentName: attachment?.name,
          }, attachment ?? undefined);

          if (isApproved) {
            toast.success("Desconto aplicado com sucesso!");
          } else {
            toast.success("Solicitação de desconto enviada com sucesso!");
          }
      }
      setModalOpen(false);
      setSelectedItem(null);
  };

  // Flatten all available items for search
  const allAvailableItems = useMemo<AddableBudgetItemUi[]>(() => {
    const eventItems = budgetEvents.flatMap((event) =>
      event.items
        .filter((item) => !item.isHeader && !item.id.startsWith("administracao") && !isValorEventoItem(item.name))
        .map((item) => ({
          ...item,
          sourceEventId: event.source === "mock" ? event.id : undefined,
          sourceEventTitle: event.title,
        })),
    );

    const registeredBaseItems = baseItems.map((item) => ({
      ...item,
      sourceEventTitle: "Itens Base",
    }));

    return [...registeredBaseItems, ...eventItems];
  }, [baseItems, budgetEvents]);

  useEffect(() => {
    selectedEvents.forEach((event) => {
      const eventParticipationQty = getParticipationQty(event.id);
      event.items.forEach((item) => {
        if (item.isHeader) return;
        const derivedDefaultQty = getDerivedDefaultQty(event.id, item, eventParticipationQty);
        const catalogItem = item as BudgetCatalogItem;
        const isDynamic =
          derivedDefaultQty !== null ||
          Boolean(catalogItem.dynamicByStudents) ||
          Boolean(catalogItem.hasMultiplier) ||
          Boolean(catalogItem.hasAdditional);
        const computedQty =
          derivedDefaultQty ??
          (item.dynamicByStudents
            ? applyItemQtyRules(item, eventParticipationQty)
            : item.defaultQuantity !== undefined
              ? applyItemQtyRules(item, item.defaultQuantity)
              : undefined);
        if (computedQty === undefined) return;
        if (isItemQtyDirty(event.id, item.id)) return;

        if (isDynamic) {
          const currentRaw = getItemRaw(event.id, item.id);
          const currentNum = currentRaw === "" || currentRaw === undefined || currentRaw === null
            ? null
            : Number(currentRaw);
          if (currentNum === computedQty) return;
          setValue(`items.${event.id}.${item.id}`, computedQty, {
            shouldDirty: false,
            shouldValidate: false,
          });
          return;
        }

        const currentValue = getItemRaw(event.id, item.id);
        if (currentValue !== undefined && currentValue !== null && currentValue !== "") return;
        setValue(`items.${event.id}.${item.id}`, computedQty, {
          shouldDirty: false,
          shouldValidate: false,
        });
      });
    });
  }, [formState.dirtyFields, getItemRaw, selectedEvents, setValue, formValues]);

  const handleRemoveItem = (eventId: string, itemId: string) => {

      setItemToRemove({ eventId, itemId, isAdded: false });
  };
    
  const handleRemoveAddedItem = (eventId: string, itemIndex: number) => {
      setItemToRemove({ eventId, itemId: itemIndex, isAdded: true });
  };

  const confirmRemoveItem = () => {
      if (!itemToRemove) return;
      const { eventId, itemId, isAdded } = itemToRemove;

      if (isAdded) {
          const currentAdded = customItems[eventId]?.added || [];
          const newAdded = [...currentAdded];
          newAdded.splice(itemId as number, 1);
          setValue(`customItems.${eventId}.added`, newAdded);
      } else {
          const currentRemoved = customItems[eventId]?.removedIds || [];
          setValue(`customItems.${eventId}`, {
              ...customItems[eventId],
              removedIds: [...currentRemoved, itemId]
          });
      }
      setItemToRemove(null);
  };

  const cancelRemoveItem = () => {
      setItemToRemove(null);
  };

  const handleAddItem = (item: ItemsStepCustomAddedItem) => {
    if (!activeEventIdForAdd) return;
    const currentAdded = customItems[activeEventIdForAdd]?.added || [];
    const sourceItem = allAvailableItems.find(
      (availableItem) =>
        availableItem.id === item.originalId &&
        availableItem.sourceEventId === item.originalEventId,
    );
    const targetParticipationQty = getParticipationQty(activeEventIdForAdd ?? undefined);
    const behavior = deriveAddedItemBehavior({
      sourceItem,
      targetParticipationQty,
      manualQuantity: item.quantity ?? 1,
      manualUnitPrice: item.unitPrice ?? 0,
      manualIsNoFixedValue: item.isNoFixedValue,
    });

    setValue(`customItems.${activeEventIdForAdd}`, {
        ...customItems[activeEventIdForAdd],
        added: [
          ...currentAdded,
          {
            ...item,
            quantity: behavior.quantity,
            unitPrice: behavior.unitPrice,
            isNoFixedValue: behavior.isNoFixedValue,
            quantityEditable: behavior.quantityEditable,
            priceEditable: behavior.priceEditable,
            displayValue: behavior.displayValue,
            quantityDisplay: behavior.quantityDisplay,
            hasSubitems: sourceItem?.hasSubitems ?? item.hasSubitems,
            subitems: sourceItem?.subitems ?? item.subitems ?? [],
          },
        ],
        removedIds: customItems[activeEventIdForAdd]?.removedIds || []
    });
    setAddItemModalOpen(false);
  };

  const getRenderableSubitemsText = (
    hasSubitems?: boolean,
    subitems?: Array<{ name: string }>,
  ) => {
    const validSubitems = (subitems ?? []).filter(
      (subitem) => typeof subitem?.name === "string" && subitem.name.trim().length > 0,
    );

    if (!hasSubitems || validSubitems.length === 0) return undefined;
    return validSubitems.map((subitem) => subitem.name).join(" | ");
  };

  const handleAddedItemVariationChange = (
    eventId: string,
    itemIndex: number,
    nextVariationId: string,
  ) => {
    const updatedAdded = [...(customItems[eventId]?.added || [])];
    const currentItem = updatedAdded[itemIndex];
    if (!currentItem) return;

    const variations = Array.isArray(currentItem.variations) ? currentItem.variations : [];
    const selectedVariation =
      variations.find((variation) => variation.id === nextVariationId) ?? variations[0];
    if (!selectedVariation) return;

    updatedAdded[itemIndex] = {
      ...currentItem,
      selectedVariationId: selectedVariation.id,
      unitPrice: selectedVariation.unit_price,
      quantity: selectedVariation.default_quantity,
    };
    setValue(`customItems.${eventId}.added`, updatedAdded, { shouldDirty: true });
  };

  const renderAddedItemName = (
    eventId: string,
    itemIndex: number,
    addedItem: ItemsStepCustomAddedItem,
  ) => {
    const subitemsText = getRenderableSubitemsText(addedItem.hasSubitems, addedItem.subitems);
    const variations = Array.isArray(addedItem.variations) ? addedItem.variations : [];
    const selectedVariationId = addedItem.selectedVariationId ?? variations[0]?.id;
    const variationSelector = variations.length > 0 ? (
      <select
        value={selectedVariationId}
        onChange={(e) => handleAddedItemVariationChange(eventId, itemIndex, e.target.value)}
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "4px 6px",
          fontSize: "var(--font-size-sm)",
          color: "var(--color-text-main)",
          width: "auto",
          minWidth: "160px",
          cursor: "pointer",
          marginTop: "4px",
        }}
      >
        {variations.map((variation) => (
          <option key={variation.id} value={variation.id}>
            {variation.name}
          </option>
        ))}
      </select>
    ) : null;

    if (!subitemsText) {
      return (
        <span style={{ display: "inline-flex", flexDirection: "column", gap: "2px" }}>
          <span>
            {addedItem.name}
            {addedItem.isNoFixedValue && (
              <span className={itemsStyles.includedBadge}>Cortesia</span>
            )}
          </span>
          {variationSelector}
        </span>
      );
    }

    return (
      <div className={itemsStyles.addedItemGroup}>
        <div className={itemsStyles.addedItemGroupHeader}>
          <span className={itemsStyles.addedItemGroupTitle}>{addedItem.name}</span>
          {addedItem.isNoFixedValue && (
            <span className={itemsStyles.includedBadge}>Cortesia</span>
          )}
        </div>
        {variationSelector}
      </div>
    );
  };

  const renderCatalogItemName = (item: BudgetCatalogItem, displayName: ReactNode) => {
    const subitemsText = getRenderableSubitemsText(item.hasSubitems, item.subitems);

    if (!subitemsText || typeof displayName !== "string") {
      return displayName;
    }

    return (
      <div className={itemsStyles.addedItemGroup}>
        <div className={itemsStyles.addedItemGroupHeader}>
          <span className={itemsStyles.addedItemGroupTitle}>{displayName}</span>
        </div>
      </div>
    );
  };

  const hasRenderableSubitems = (
    hasSubitems?: boolean,
    subitems?: Array<{ name: string }>,
  ) => Boolean(getRenderableSubitemsText(hasSubitems, subitems));


  // Auto-seleção do auditório conforme o nº de formandos (< 25 → Cristal,
  // >= 25 → Platina). Continua acompanhando enquanto o usuário não trocar
  // manualmente; após a troca manual, a escolha é respeitada.
  useEffect(() => {
    const cityOptions = getAuditoriumOptionsForCity(budgetCity);
    selectedEvents.forEach((event) => {
      event.items.forEach((item) => {
        if (!isAuditoriumItemByIdOrName(item.id, item.name)) return;
        const manual = isAuditoriumManual(event.id, item.id);
        const desired = getParticipantDrivenAuditoriumPrice(getParticipationQty(event.id));
        const current = getItemNumber(event.id, `${item.id}_price`, NaN);
        if (!manual && current !== desired) {
          setValue(`items.${event.id}.${item.id}_price`, desired, {
            shouldDirty: false,
            shouldValidate: false,
          });
        }

        // Grava o slug do auditório que o select está mostrando. Sem isso, só a
        // troca manual salvava o slug e a impressão tinha que adivinhar pelo
        // preço — auditórios de cidades diferentes com o mesmo valor saíam
        // trocados (Cristal impresso como "Platina Litoral").
        const slugField = `items.${event.id}.${item.id}_auditorium_slug`;
        const savedSlug = getValues(slugField) as string | undefined;
        if (savedSlug) return;
        const shownPrice = manual ? current : desired;
        const option =
          cityOptions.find((o) => o.value === shownPrice) ?? cityOptions[0];
        if (option) {
          setValue(slugField, option.slug, {
            shouldDirty: false,
            shouldValidate: false,
          });
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditoriumSyncSignature, budgetCity]);
  const calculateEventTotal = (event: EventType) =>
    calculateItemsStepEventTotal(event, formValues, customItems, itemRequests);

  const totalGeneral = selectedEvents.reduce(
    (acc, event) => acc + calculateEventTotal(event),
    0,
  );

  // --- Valor total atÃƒÂ© a colação ---
  const totalPorFormandoGeral = selectedEvents.reduce((acc, event) => {
    const eTotal = calculateEventTotal(event);
    const pQty = getParticipationQty(event.id);
    return acc + (pQty > 0 ? eTotal / pQty : 0);
  }, 0);

  const autoInstallments = (() => {
    const startRaw = formValues?.eventStartDate as string | undefined;
    const endRaw   = formValues?.eventEndDate   as string | undefined;
    if (!startRaw || !endRaw) return 12;
    const s = new Date(startRaw);
    const e = new Date(endRaw);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 12;
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
    return Math.max(1, months);
  })();

  const watchedInstallmentsOverride = useWatch({
    control,
    name: "installmentsOverride",
  }) as number | null | undefined;
  const installmentsOverride = watchedInstallmentsOverride ?? null;
  const effectiveInstallments = installmentsOverride ?? autoInstallments;
  const valorParcela = effectiveInstallments > 0 ? totalPorFormandoGeral / effectiveInstallments : 0;
  // Mesmos quadros da impressão e do passo 3: com um evento marcado como
  // "fecha quadro no resumo final" (ex.: o baile), o total por formando se
  // divide em pacote e pacote + evento.
  const summaryBlocks = buildSummaryBlocks({
    events: selectedEvents.map((event) => {
      const pQty = getParticipationQty(event.id);
      const eTotal = calculateEventTotal(event);
      return {
        eventId: event.id,
        title: event.title,
        total: eTotal,
        valuePerStudent: pQty > 0 ? eTotal / pQty : 0,
        closesSummaryBlock: event.closes_summary_block,
        summaryBlockLabel: event.summary_block_label,
      };
    }),
    installments: effectiveInstallments,
  });

  return (
    <div className={styles.container}>
      <h2 className={styles.sectionTitle}>Definição de Valores</h2>

      <div className={itemsStyles.tocContainer}>
        {/* State 1: Indicators (Bars) */}
        <div className={itemsStyles.tocIndicators}>
          {selectedEvents.map((event) => (
            <div key={event.id} className={itemsStyles.tocBar} />
          ))}
        </div>

        {/* State 2: Modal (List) */}
        <div className={itemsStyles.tocModal}>
          <div className={itemsStyles.tocModalTitle}>Índice</div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: "var(--color-text-secondary)",
              padding: "4px 4px 10px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={allowAnyEventMove}
              onChange={(e) => setAllowAnyEventMove(e.target.checked)}
            />
            Habilitar mover qualquer evento
          </label>
          {tocEvents.map((event) => {
            const fixed = isFixedPositionEvent(event.title);
            const draggable = allowAnyEventMove || !fixed;
            return (
              <div
                key={event.id}
                className={`${itemsStyles.tocLink}${fixed ? ` ${itemsStyles.tocLinkFixed}` : ""}${draggingEventId === event.id ? ` ${itemsStyles.tocLinkDragging}` : ""}`}
                draggable={draggable}
                onDragStart={() => {
                  if (!draggable) return;
                  setDraggingEventId(event.id);
                  setDragOrder(selectedEvents.map((ev) => ev.id));
                }}
                onDragOver={(e) => {
                  if (!draggingEventId) return;
                  e.preventDefault();
                  previewEventReorder(draggingEventId, event.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  commitEventReorder();
                }}
                onDragEnd={commitEventReorder}
                onClick={() => {
                  const element = document.getElementById(event.id);
                  if (element)
                    element.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                title={
                  draggable
                    ? "Arraste para reordenar"
                    : "Evento com posição fixa (ative o toggle para mover)"
                }
              >
                <span className={itemsStyles.tocLinkHandle} aria-hidden>
                  {draggable ? <GripVertical size={14} /> : <Lock size={13} />}
                </span>
                <span className={itemsStyles.tocLinkText}>{event.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={itemsStyles.eventsContainer}>
        {selectedEvents.map((event) => {
          const canonicalEventId = resolveCanonicalEventSlug(event.id);
          const isItensDescerramento = canonicalEventId === "itens_descerramento_placa";
          const isDescerramento = canonicalEventId === "descerramento_placa";
          const isAulaSaudade = canonicalEventId === "aula_saudade";
          const isMissa = canonicalEventId === "missa_culto";
          const isCulto = canonicalEventId === "culto_cortesia";
          const isColacao = canonicalEventId === "colacao_descerramento";
          const isCerimoniaColacao = canonicalEventId === "cerimonia_colacao";
          const isFesta50 = canonicalEventId === "festa_50";
          const isFesta365 = canonicalEventId === "festa_365";
          const isEnsaio = canonicalEventId === "ensaio_fotografico";
          const isEnsaio50 = canonicalEventId === "ensaio_50";
          const isEnsaio365 = canonicalEventId === "ensaio_365";
          const isCobertura = canonicalEventId === "cobertura_fotografica";
          const isEvento100Dias = canonicalEventId === "evento_100_dias";

          const eventTotal = calculateEventTotal(event);
          const courtesyDisplayTotal = getCourtesyDisplayTotal(canonicalEventId, event, getItemNumber);
          const displayEventTotal =
            courtesyDisplayTotal !== null ? courtesyDisplayTotal : eventTotal;

          const participationQty = getParticipationQty(event.id);

          const costPerStudent =
            participationQty > 0 ? displayEventTotal / participationQty : 0; // Use displayEventTotal

          return (
            <div
              key={event.id}
              id={event.id}
              className={itemsStyles.eventBlock}
            >
              <h3 className={itemsStyles.eventTitle}>{event.title}</h3>

              <div className={itemsStyles.table}>
                <div className={itemsStyles.headerRow}>
                  <div className={itemsStyles.colName}>Item</div>
                  <div className={itemsStyles.colPrice}>Valor Unit.</div>
                  <div className={itemsStyles.colQty}>Qtd.</div>
                  <div className={itemsStyles.colDiscount} style={{ textAlign: "center" }}>DESC</div>
                  <div className={itemsStyles.colTotal}>Total</div>
                </div>

                {event.items.map((item: BudgetItem) => {
                  if (item.id.startsWith("administracao") || isValorEventoItem(item.name)) return null;
                  const qtyFieldName = `items.${event.id}.${item.id}`;
                  const eventItemValues = (formValues.items?.[event.id] ?? {}) as Record<string, unknown>;
                  const genericDefaultQty =
                    getDerivedDefaultQty(event.id, item, participationQty) ??
                    (item.dynamicByStudents
                      ? applyItemQtyRules(item, participationQty)
                      : applyItemQtyRules(item, getVariationDrivenQuantity(item, eventItemValues, item.defaultQuantity ?? item.fixedQty ?? 1)));
                  let currentQty = getItemNumber(event.id, item.id, genericDefaultQty);

                  // --- RENDER LOGIC ---
                  let displayPrice: React.ReactNode = new Intl.NumberFormat(
                    "pt-BR",
                    { style: "currency", currency: "BRL" },
                  ).format(getVariationDrivenUnitPrice(item, eventItemValues, item.unitPrice || 0));

                  let displayTotal: React.ReactNode = new Intl.NumberFormat(
                    "pt-BR",
                    { style: "currency", currency: "BRL" },
                  ).format(currentQty * (item.unitPrice || 0));

                  let qtyInput: React.ReactNode = (
                    <BudgetQtyInput name={qtyFieldName} value={currentQty} />
                  );

                  const hasBaseItemRules =
                    item.quantityEditable !== undefined ||
                    item.priceEditable !== undefined ||
                    item.dynamicByStudents !== undefined;

                  if (hasBaseItemRules) {
                    const baseItemUi = buildBaseCatalogItemUi(event.id, item, genericDefaultQty);
                    currentQty = baseItemUi.currentQty;
                    displayPrice = baseItemUi.displayPrice;
                    qtyInput = baseItemUi.qtyInput;
                    displayTotal = baseItemUi.displayTotal;
                  }



                  if (isEvento100Dias) {
                    const evento100DiasItemUi = buildEvento100DiasItemUi(event.id, item, participationQty);
                    displayPrice = evento100DiasItemUi.displayPrice;
                    currentQty = evento100DiasItemUi.currentQty;
                    qtyInput = evento100DiasItemUi.qtyInput;
                    displayTotal = evento100DiasItemUi.displayTotal;
                  }

                  // Allow editing price for Culto Cortesia OR Atração Musical items
                  if (isCulto || isMusicAttractionItem(item.id)) {
                    const cultoOrMusicItemUi = buildCultoOrMusicItemUi(event.id, item, currentQty, qtyInput);
                    currentQty = cultoOrMusicItemUi.currentQty;
                    displayPrice = cultoOrMusicItemUi.displayPrice;
                    qtyInput = cultoOrMusicItemUi.qtyInput;
                    displayTotal = cultoOrMusicItemUi.displayTotal;
                  }

                  if (isItensDescerramento) {
                    const itensDescerramentoItemUi = buildItensDescerramentoLegacyItemUi(
                      event.id,
                      item,
                      participationQty,
                    );
                    if (itensDescerramentoItemUi) {
                      displayPrice = itensDescerramentoItemUi.displayPrice;
                      currentQty = itensDescerramentoItemUi.currentQty;
                      qtyInput = itensDescerramentoItemUi.qtyInput;
                      displayTotal = itensDescerramentoItemUi.displayTotal;
                    }
                  } else if (isDescerramento) {
                    const descerramentoItemUi = buildDescerramentoItemUi(event.id, item, participationQty);
                    if (descerramentoItemUi) {
                      displayPrice = descerramentoItemUi.displayPrice;
                      currentQty = descerramentoItemUi.currentQty;
                      qtyInput = descerramentoItemUi.qtyInput;
                      displayTotal = descerramentoItemUi.displayTotal;
                    }
                  } else if (isAulaSaudade) {
                    const aulaSaudadeItemUi = buildAulaSaudadeItemUi(event.id, item, participationQty);
                    if (aulaSaudadeItemUi) {
                      displayPrice = aulaSaudadeItemUi.displayPrice;
                      currentQty = aulaSaudadeItemUi.currentQty;
                      qtyInput = aulaSaudadeItemUi.qtyInput;
                      displayTotal = aulaSaudadeItemUi.displayTotal;
                    }
                  } else if (isMissa) {
                    const missaItemUi = buildMissaItemUi(event.id, item, participationQty);
                    if (missaItemUi) {
                      displayPrice = missaItemUi.displayPrice;
                      currentQty = missaItemUi.currentQty;
                      qtyInput = missaItemUi.qtyInput;
                      displayTotal = missaItemUi.displayTotal;
                    }
                  } else if (isColacao) {
                    const colacaoItemUi = buildColacaoLikeItemUi(
                      event.id,
                      item,
                      participationQty,
                      getColacaoItemConfig,
                    );
                    if (colacaoItemUi) {
                      displayPrice = colacaoItemUi.displayPrice;
                      currentQty = colacaoItemUi.currentQty;
                      qtyInput = colacaoItemUi.qtyInput;
                      displayTotal = colacaoItemUi.displayTotal;
                    }
                  } else if (isCerimoniaColacao) {
                    const cerimoniaItemUi = buildColacaoLikeItemUi(
                      event.id,
                      item,
                      participationQty,
                      getCerimoniaItemConfig,
                    );
                    if (cerimoniaItemUi) {
                      displayPrice = cerimoniaItemUi.displayPrice;
                      currentQty = cerimoniaItemUi.currentQty;
                      qtyInput = cerimoniaItemUi.qtyInput;
                      displayTotal = cerimoniaItemUi.displayTotal;
                    }
                  } else if (isFesta50) {
                    const festaItemUi = buildFestaItemUi(event.id, item);
                    if (festaItemUi) {
                      displayPrice = festaItemUi.displayPrice;
                      currentQty = festaItemUi.currentQty;
                      qtyInput = festaItemUi.qtyInput;
                      displayTotal = festaItemUi.displayTotal;
                    }
                  } else if (isEnsaio) {
                    const ensaioItemUi = buildEnsaioFotograficoItemUi(event.id, item);
                    if (ensaioItemUi) {
                      displayPrice = ensaioItemUi.displayPrice;
                      currentQty = ensaioItemUi.currentQty;
                      qtyInput = ensaioItemUi.qtyInput;
                      displayTotal = ensaioItemUi.displayTotal;
                    }
                  } else if (isEnsaio50) {
                    const ensaio50ItemUi = buildSimpleEnsaioItemUi(event.id, item, participationQty);
                    if (ensaio50ItemUi) {
                      displayPrice = ensaio50ItemUi.displayPrice;
                      currentQty = ensaio50ItemUi.currentQty;
                      qtyInput = ensaio50ItemUi.qtyInput;
                      displayTotal = ensaio50ItemUi.displayTotal;
                    }
                  } else if (isEnsaio365) {
                    const ensaio365ItemUi = buildSimpleEnsaioItemUi(event.id, item, participationQty);
                    if (ensaio365ItemUi) {
                      displayPrice = ensaio365ItemUi.displayPrice;
                      currentQty = ensaio365ItemUi.currentQty;
                      qtyInput = ensaio365ItemUi.qtyInput;
                      displayTotal = ensaio365ItemUi.displayTotal;
                    }
                  } else if (isFesta365) {
                    const festa365ItemUi = buildFestaItemUi(event.id, item);
                    if (festa365ItemUi) {
                      displayPrice = festa365ItemUi.displayPrice;
                      currentQty = festa365ItemUi.currentQty;
                      qtyInput = festa365ItemUi.qtyInput;
                      displayTotal = festa365ItemUi.displayTotal;
                    }
                  } else if (isCobertura) {
                    const coberturaItemUi = buildCoberturaItemUi(event.id, item, participationQty);
                    if (coberturaItemUi) {
                      displayPrice = coberturaItemUi.displayPrice;
                      currentQty = coberturaItemUi.currentQty;
                      qtyInput = coberturaItemUi.qtyInput;
                      displayTotal = coberturaItemUi.displayTotal;
                    }
                  }

                  // Item "Locação do Auditório": o seletor é renderizado abaixo do
                  // NOME (renderAuditoriumSelect). Aqui a coluna de preço mostra o
                  // valor — editável (BRL) se o auditório permite, senão texto fixo.
                  if (isAuditoriumItemByIdOrName(item.id, item.name)) {
                    const auditoriumPriceField = `${item.id}_price`;
                    const auditoriumPrice = getItemNumber(
                      event.id,
                      auditoriumPriceField,
                      getParticipantDrivenAuditoriumPrice(participationQty),
                    );
                    currentQty = 1;
                    displayPrice = (
                      <AuditoriumPriceCell
                        eventId={event.id}
                        itemId={item.id}
                        defaultPrice={auditoriumPrice}
                        className={itemsStyles.priceInput}
                        onEdited={() => markAuditoriumManual(event.id, item.id)}
                      />
                    );
                    qtyInput = (
                      <span className={clsx(itemsStyles.qtyInput, itemsStyles.readOnly)}>1</span>
                    );
                    displayTotal = formatCurrency(auditoriumPrice);
                  }

                  const isRemoved = customItems[event.id]?.removedIds?.includes(item.id);

                  if (item.isHeader) {
                    return (
                      <div
                        key={item.id}
                        className={itemsStyles.itemSectionHeader}
                      >
                        {item.name}
                      </div>
                    );
                  }
                  
                  // Item cujo valor/quantidade veio de edição no anexo contratual.
                  const editedByAnnex = Boolean(
                    annexEditMarks[event.id]?.[String(item.id)],
                  );
                  const itemChange = itemChangeLog[event.id]?.[String(item.id)];
                  const showChangeTag = editedByAnnex || Boolean(itemChange);
                  const viaAnnex = editedByAnnex || itemChange?.source === "ANNEX";
                  const displayName = (
                    <>
                      {renderCatalogDisplayName(event.id, item)}
                      {showChangeTag ? (
                        <button
                          type="button"
                          title="Ver o que mudou neste item"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setChangesFocus({
                              eventId: event.id,
                              itemId: String(item.id),
                            });
                            setChangesOpen(true);
                          }}
                          style={{
                            marginLeft: "8px",
                            fontSize: "10px",
                            fontWeight: 700,
                            backgroundColor: "#fef3c7",
                            color: "#92400e",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            whiteSpace: "nowrap",
                            border: "1px dashed #92400e",
                            textDecoration: "underline dotted",
                            cursor: "pointer",
                          }}
                        >
                          {viaAnnex ? "via anexo" : "alterado"}
                        </button>
                      ) : null}
                    </>
                  );

                  // --- ITEM DISCOUNT LOGIC ---
                  // Check if item can have discount (has price/cost and is not "Incluso")
                  const canHaveDiscount =
                    (item.unitPrice > 0 || isCulto || isMusicAttractionItem(item.id)) &&
                    !item.displayValue;

                  let displayDiscount: React.ReactNode = "-";
                  // Helper to get raw numeric value for calculation
                  // If it's a fixed value item (like auditorio), unitPrice might be wrong in 'item', so we rely on displayTotal parsing or similar? 
                  // Actually, for Auditorio, we adjusted displayPrice but not necessarily item.unitPrice in the logic above?
                  // Let's rely on the fact that if 'displayTotal' is a formatted string, we might need to recalculate.
                  // Simpler: Use the SAME logic as standardTotal calculation in SummaryStep.
                  
                  const itemTotalValueForDiscount = getCatalogItemTotalValueForDiscount(
                    event.id,
                    item,
                    currentQty,
                  );
                  const isStructuredIncludedItem = isStructuredIncludedCatalogItem(
                    item,
                    itemTotalValueForDiscount,
                  );

                  // Recalculate Total based on Approved Discount
                  displayDiscount = renderDiscountAction(
                    event.id,
                    item.id,
                    item.name,
                    itemTotalValueForDiscount / (currentQty || 1),
                    itemTotalValueForDiscount,
                    canHaveDiscount,
                  );

                  if (getDiscountRequestsForItem(event.id, item.id).approved) {
                    displayTotal = renderDiscountedTotal(itemTotalValueForDiscount, event.id, item.id);
                  }

                  if (isStructuredIncludedItem) {
                    displayPrice = "Incluso";
                    displayTotal = "Incluso";
                  }

                  if (isRemoved) return null; // Logic to hide removed items

                  return (
                    <BudgetItemGridRow
                      key={item.id}
                      rowStyle={{
                        alignItems: item.hasSubitems ? 'start' : 'center',
                      }}
                      name={renderCatalogItemName(item, displayName)}
                      subItemsText={getRenderableSubitemsText(item.hasSubitems, item.subitems)}
                      price={displayPrice}
                      qty={qtyInput}
                      discount={displayDiscount}
                      total={displayTotal}
                      onRemove={() => handleRemoveItem(event.id, item.id)}
                    />
                  );
                })}

                {/* --- ADDED ITEMS RENDER --- */}
                 {customItems[event.id]?.added?.map((addedItem: ItemsStepCustomAddedItem, idx: number) => {
                    const addedItemQuantity = addedItem.quantity ?? 0;
                    const addedItemUnitPrice = addedItem.unitPrice ?? 0;
                    const addedItemName = addedItem.name ?? "Item adicionado";
                    const isStructuredIncludedAddedItem =
                      hasRenderableSubitems(addedItem.hasSubitems, addedItem.subitems) &&
                      addedItemUnitPrice <= 0;
                    const addedItemDisplayValue =
                      addedItem.displayValue ??
                      (addedItem.isNoFixedValue || isStructuredIncludedAddedItem ? "Incluso" : undefined);
                    const isAddedItemQtyEditable = addedItem.quantityEditable ?? !addedItem.isNoFixedValue;
                    const isAddedItemPriceEditable = addedItem.priceEditable ?? !addedItem.isNoFixedValue;
                    const addedItemTotal = addedItem.isNoFixedValue ? 0 : (addedItemQuantity * addedItemUnitPrice);
                    const canHaveDiscountAdded = !addedItem.isNoFixedValue && addedItemUnitPrice > 0;

                    const addedItemId = addedItem.id || `added_${idx}`;
                    const displayDiscountAdded = renderDiscountAction(
                      event.id,
                      addedItemId,
                      addedItemName,
                      addedItemUnitPrice,
                      addedItemTotal,
                      canHaveDiscountAdded,
                    );
                    const addedItemTotalDisplay = getDiscountRequestsForItem(event.id, addedItemId).approved
                      ? renderDiscountedTotal(addedItemTotal, event.id, addedItemId)
                      : formatCurrency(addedItemTotal);

                    return (
                        <BudgetItemGridRow
                          key={addedItem.id || idx}
                          rowStyle={{
                            backgroundColor: '#f0fdf4',
                            alignItems: addedItem.hasSubitems ? 'start' : 'center',
                          }}
                          name={renderAddedItemName(event.id, idx, addedItem)}
                          subItemsText={getRenderableSubitemsText(addedItem.hasSubitems, addedItem.subitems)}
                          price={
                            addedItemDisplayValue ? addedItemDisplayValue : isAddedItemPriceEditable ? (
                              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <span style={{ position: 'absolute', left: '10px', fontSize: '13px', color: '#6b7280', pointerEvents: 'none', userSelect: 'none' }}>R$</span>
                                <Input 
                                  type="text" 
                                  className={itemsStyles.priceInput} 
                                  style={{ paddingLeft: '32px' }}
                                  value={new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(addedItem.unitPrice || 0)}
                                  onChange={(e) => {
                                    let textVal = e.target.value.replace(/[^0-9,-]/g, '');
                                    const numericVal = parseFloat(textVal.replace(',', '.')) || 0;
                                    const updatedAdded = [...(customItems[event.id]?.added || [])];
                                    updatedAdded[idx] = { ...updatedAdded[idx], unitPrice: numericVal };
                                    setValue(`customItems.${event.id}.added`, updatedAdded);
                                  }}
                                />
                              </div>
                            ) : (
                              formatCurrency(addedItemUnitPrice)
                            )
                          }
                          qty={
                            isAddedItemQtyEditable ? (
                              <Input 
                                type="number" min="0" className={itemsStyles.qtyInput}
                                value={addedItem.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  const updatedAdded = [...(customItems[event.id]?.added || [])];
                                  updatedAdded[idx] = { ...updatedAdded[idx], quantity: val };
                                  setValue(`customItems.${event.id}.added`, updatedAdded);
                                }}
                              />
                            ) : (
                              <span className={itemsStyles.centerText}>
                                {addedItem.quantityDisplay ?? addedItem.quantity}
                              </span>
                            )
                          }
                          discount={displayDiscountAdded}
                          total={
                            addedItemDisplayValue ? addedItemDisplayValue : addedItemTotalDisplay
                          }
                          onRemove={() => handleRemoveAddedItem(event.id, idx)}
                        />
                    );
                })}
                
                <div style={{ padding: '10px 15px' }}>
                    <Button 
                        size="sm" 
                        variant="outline" 
                        leftIcon={<Plus size={14} />}
                        onClick={() => {
                            setActiveEventIdForAdd(event.id);
                            setAddItemModalOpen(true);
                        }}
                    >
                        Adicionar Item
                    </Button>
                </div>

                {/* --- SUMMARY SECTION --- */}
                <div className={itemsStyles.summarySection}>
                  {renderEventSummary(
                    canonicalEventId,
                    event.id,
                    participationQty,
                    displayEventTotal as number,
                    costPerStudent,
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ============================================= */}
      {/* Seção: Valor total até a colação             */}
      {/* ============================================= */}
      {selectedEvents.length > 0 && (
        <div style={{ margin: "32px 0 24px", border: "1px solid var(--color-border)", borderRadius: "12px", overflow: "hidden", background: "var(--color-surface)" }}>
          {/* Cabeçalho */}
          <div style={{ background: "var(--color-bg-tertiary)", padding: "14px 20px", borderBottom: "1px solid var(--color-border)", display: "flex", alignItems: "center", gap: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--color-text-main)" }}>
              Resumo Final · Condições de Pagamento
            </h3>
          </div>

          <div style={{ padding: "20px" }}>
            {/* Valores por evento — mesma seção que abre o resumo impresso. */}
            <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
              Valores por evento
            </div>
            <div style={{ marginBottom: "16px" }}>
              {selectedEvents.map((event) => {
                const eTotal = calculateEventTotal(event);
                const pQty = getParticipationQty(event.id);
                const vpf = pQty > 0 ? eTotal / pQty : 0;
                return (
                  <div key={event.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--color-border)", fontSize: "13px" }}>
                    <span style={{ color: "var(--color-text-secondary)" }}>{event.title}</span>
                    <span style={{ fontWeight: 500 }}>{formatCurrency(vpf)} / formando</span>
                  </div>
                );
              })}
            </div>

            {/* Parcelas */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginTop: "16px", padding: "16px", background: "var(--color-bg-tertiary)", borderRadius: "8px" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                  Número de parcelas
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="number"
                    min={1}
                    value={effectiveInstallments}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setValue("installmentsOverride", isNaN(v) || v < 1 ? 1 : v, {
                        shouldDirty: true,
                        shouldValidate: false,
                      });
                    }}
                    style={{ width: "80px", padding: "7px 10px", border: "1px solid var(--color-border)", borderRadius: "6px", fontSize: "15px", fontWeight: 700, textAlign: "center", background: "var(--color-surface)", color: "var(--color-text-main)" }}
                  />
                  {installmentsOverride !== null ? (
                    <button
                      type="button"
                      onClick={() =>
                        setValue("installmentsOverride", null, {
                          shouldDirty: true,
                          shouldValidate: false,
                        })
                      }
                      style={{ fontSize: "12px", color: "var(--color-primary)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                    >
                      Redefinir para automático ({autoInstallments}x)
                    </button>
                  ) : (
                    <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                      calculado automaticamente das datas
                    </span>
                  )}
                </div>
              </div>

            </div>

            {/* Valor cheio do orçamento, acima do resumo de pagamento. */}
            <div style={{ marginTop: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                Valor total do orçamento
              </div>
              <BudgetTotalsSummary blocks={summaryBlocks} />
            </div>

            {/* As MESMAS linhas do resumo da impressão. */}
            <div style={{ marginTop: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "var(--color-text-secondary)", marginBottom: "6px" }}>
                Resumo final · condições de pagamento
              </div>
              <BudgetPaymentSummary
                blocks={summaryBlocks}
                installments={effectiveInstallments}
              />
            </div>
          </div>
        </div>
      )}

      <div className={itemsStyles.spacer} />

      <div
        className={clsx(
          itemsStyles.floatingBar,
          floatingBarCollapsed && itemsStyles.floatingBarCollapsed,
        )}
      >
        <button
          type="button"
          className={itemsStyles.barToggle}
          onClick={() => setFloatingBarCollapsed((prev) => !prev)}
          aria-label={floatingBarCollapsed ? "Expandir resumo" : "Minimizar resumo"}
          title={floatingBarCollapsed ? "Expandir" : "Minimizar"}
        >
          {floatingBarCollapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        <div className={itemsStyles.floatingSummary}>
          <div className={itemsStyles.floatingTotal}>
            <span className={itemsStyles.floatingTotalLabel}>Total Geral</span>
            <span className={itemsStyles.floatingTotalValue}>
              {formatCurrency(totalGeneral)}
            </span>
          </div>
          <div className={itemsStyles.floatingDetails}>
            <div className={itemsStyles.floatingDetailItem}>
              <span className={itemsStyles.floatingDetailLabel}>Total por formando</span>
              <span className={itemsStyles.floatingDetailValue}>
                {formatCurrency(totalPorFormandoGeral)}
              </span>
            </div>
            <div className={itemsStyles.floatingDetailItem}>
              <span className={itemsStyles.floatingDetailLabel}>
                Parcela por formando ({effectiveInstallments}x)
              </span>
              <span className={itemsStyles.floatingDetailValue}>
                {formatCurrency(valorParcela)}
              </span>
            </div>
          </div>
        </div>
        <div className={itemsStyles.floatingBarButtons}>
          <Button variant="ghost" onClick={onBack}>
            Voltar
          </Button>
          <Button onClick={onNext}>Próximo</Button>
        </div>
      </div>

      <AddItemModal
        isOpen={addItemModalOpen}
        onClose={() => setAddItemModalOpen(false)}
        onAdd={handleAddItem}
        availableItems={allAvailableItems}
        targetParticipationQty={activeEventIdForAdd ? getParticipationQty(activeEventIdForAdd) : 1}
      />

      <RemoveItemModal
          isOpen={itemToRemove !== null}
          onClose={cancelRemoveItem}
          onConfirm={confirmRemoveItem}
      />

      <ItemDiscountRequestModal 
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedItem(null); }}
        onSubmit={handleSubmitDiscount}
        onRemove={selectedItem?.isEditing ? handleRemoveDiscount : undefined}
        itemName={selectedItem?.itemName || ""}
        unitPrice={selectedItem?.unitPrice || 0}
        currentTotalValue={selectedItem?.currentTotalValue || 0}
        isAdmin={isAdmin}
        isEditing={selectedItem?.isEditing}
        initialMode={selectedItem?.initialMode}
        initialPercent={selectedItem?.initialPercent}
        initialAmount={selectedItem?.initialAmount}
        initialReason={selectedItem?.initialReason}
      />

      {changesOpen && (
        <BudgetChangesModal
          budget={changesBudget}
          budgetEvents={budgetEvents}
          focus={changesFocus}
          onClose={() => setChangesOpen(false)}
        />
      )}
    </div>
  );
}

// --- SUBCOMPONENTS ---

function ItemDiscountRequestModal({
  isOpen,
  onClose,
  onSubmit,
  onRemove,
  itemName,
  unitPrice,
  currentTotalValue,
  isAdmin,
  isEditing,
  initialPercent = 0,
  initialReason = "",
  initialMode = DEFAULT_DISCOUNT_MODE,
  initialAmount = 0,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** `value` é percentual quando o modo é PERCENT e reais quando é FIXED. */
  onSubmit: (
    value: number,
    reason: string,
    attachment: File | null | undefined,
    mode: DiscountMode,
  ) => void;
  onRemove?: () => void;
  itemName: string;
  unitPrice: number;
  currentTotalValue: number;
  isAdmin?: boolean;
  isEditing?: boolean;
  initialPercent?: number;
  initialReason?: string;
  initialMode?: DiscountMode;
  /** Valor em reais já pedido, quando o pedido salvo é de valor fixo. */
  initialAmount?: number;
}) {
  const [mode, setMode] = useState<DiscountMode>(DEFAULT_DISCOUNT_MODE);
  const [value, setValue] = useState<number>(0);
  const [reason, setReason] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setValue(initialMode === "FIXED" ? initialAmount : initialPercent);
      setReason(initialReason || "");
      setAttachment(null);
    }
  }, [isOpen, initialPercent, initialReason, initialMode, initialAmount]);

  // Trocar de unidade zera o campo: 10 em "%" e 10 em "R$" são pedidos
  // completamente diferentes, e manter o número confundiria.
  const trocarModo = (novo: DiscountMode) => {
    if (novo === mode) return;
    setMode(novo);
    setValue(0);
  };

  if (!isOpen) return null;

  const title = isEditing 
    ? (isAdmin ? "Editar Desconto" : "Editar Solicitação")
    : (isAdmin ? "Aplicar Desconto no Item" : "Solicitar Desconto no Item");

  const buttonLabel = isEditing
    ? "Salvar Alterações"
    : (isAdmin ? "Aplicar Desconto" : "Solicitar Desconto");

  const handleSubmit = () => {
    if (!reason.trim()) {
      toast.error("É obrigatório informar o motivo do desconto.");
      return;
    }
    const erro = validateDiscountInput({ mode, value }, currentTotalValue);
    if (erro) {
      toast.error(erro);
      return;
    }
    onSubmit(value, reason, attachment, mode);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100
    }}>
      <div style={{
        backgroundColor: 'var(--color-surface)',
        padding: '24px',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '450px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '16px' }}>
             <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--color-text-main)', flex: 1 }}>
                {title}
             </h3>
             {isEditing && onRemove && (
                 <button 
                    onClick={() => {
                        if(confirm("Tem certeza que deseja remover este desconto?")) {
                            onRemove();
                        }
                    }}
                    style={{ 
                        color: '#ef4444', cursor: 'pointer', padding: '4px', 
                        border: 'none', background: 'transparent' 
                    }}
                    title="Remover Desconto"
                 >
                     <Trash2 size={18} />
                 </button>
             )}
        </div>
        
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          backgroundColor: 'var(--color-bg-secondary)',
          borderRadius: '8px'
        }}>
           <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Item</p>
           <p style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>{itemName}</p>
           <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '8px', marginBottom: '4px' }}>Valor Unitário Atual</p>
            <p style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>
              {formatCurrency(unitPrice)}
            </p>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginTop: '8px', marginBottom: '4px' }}>Valor Atual do Item</p>
            <p style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>
              {formatCurrency(currentTotalValue)}
            </p>
         </div>

        <DiscountInputField
          mode={mode}
          onModeChange={trocarModo}
          value={value}
          onValueChange={setValue}
          base={currentTotalValue}
          finalLabel="Novo Valor"
        />

        <div style={{ marginBottom: '24px' }}>
           <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px', color: 'var(--color-text-main)' }}>
             Motivo (Obrigatório)
           </label>
           <textarea 
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                minHeight: '80px',
                resize: 'vertical',
                outline: 'none',
                fontFamily: 'inherit'
              }}
              placeholder="Justifique a solicitação..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
           />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '4px', color: 'var(--color-text-main)' }}>
            Anexo (Opcional)
          </label>
          <label style={{
            display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
            padding: '8px 12px', border: '1px dashed var(--color-border)',
            borderRadius: '6px', fontSize: '13px', color: 'var(--color-text-secondary)',
          }}>
            <Paperclip size={14} />
            {attachment ? attachment.name : 'Clique para selecionar um documento'}
            <input type="file" style={{ display: 'none' }} onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
          </label>
          {attachment && (
            <button type="button" onClick={() => setAttachment(null)}
              style={{ marginTop: '4px', fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Remover anexo
            </button>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit}>{buttonLabel}</Button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// MODAL DE CONFIRMAÃƒâ€¡ÃƒÆ’O DE REMOÃƒâ€¡ÃƒÆ’O
// ==========================================
function RemoveItemModal({
    isOpen,
    onClose,
    onConfirm,
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}) {
    const [confirmText, setConfirmText] = useState("");
    const canConfirm = confirmText === "EXCLUIR";

    const handleClose = () => {
        setConfirmText("");
        onClose();
    };

    const handleConfirm = () => {
        if (!canConfirm) return;
        setConfirmText("");
        onConfirm();
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
            <div style={{
                backgroundColor: 'var(--color-surface)', padding: '24px',
                borderRadius: '12px', width: '100%', maxWidth: '420px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--color-text-main)', marginBottom: '8px' }}>
                    Remover Item
                </h3>
                <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
                    Esta ação irá remover o item e deduzir seu valor do total do evento.
                </p>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                    Para confirmar, digite <strong style={{ color: 'var(--color-error)' }}>EXCLUIR</strong> abaixo:
                </p>
                <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="EXCLUIR"
                    autoFocus
                    style={{
                        width: '100%',
                        height: '40px',
                        padding: '0 12px',
                        border: `1px solid ${canConfirm ? 'var(--color-error)' : 'var(--color-border)'}`,
                        borderRadius: 'var(--radius-md)',
                        fontSize: '14px',
                        color: 'var(--color-text-main)',
                        backgroundColor: 'var(--color-surface)',
                        marginBottom: '20px',
                        outline: 'none',
                        boxSizing: 'border-box',
                    }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!canConfirm}
                        style={{
                            backgroundColor: canConfirm ? '#ef4444' : 'var(--color-border)',
                            color: canConfirm ? 'white' : 'var(--color-text-muted)',
                            border: 'none',
                            cursor: canConfirm ? 'pointer' : 'not-allowed',
                        }}
                    >
                        Remover
                    </Button>
                </div>
            </div>
        </div>
    );
}
