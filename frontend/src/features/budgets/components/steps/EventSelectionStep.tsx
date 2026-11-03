import { useFormContext } from "react-hook-form";
import clsx from "clsx";
import { Check } from "lucide-react";
import { Button } from "../../../../components/Button/Button";
import { EVENT_TYPES } from "../../data/mockData";
import styles from "./Steps.module.css";
import eventStyles from "./EventSelectionStep.module.css";
import { useCallback } from "react";

interface EventSelectionStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function EventSelectionStep({
  onNext,
  onBack,
}: EventSelectionStepProps) {
  const { setValue, watch, trigger } = useFormContext();
  const selectedEvents = watch("selectedEvents") || [];

  const toggleEvent = (eventId: string) => {
    const current = new Set(selectedEvents);
    if (current.has(eventId)) {
      current.delete(eventId);
    } else {
      current.add(eventId);
    }
    setValue("selectedEvents", Array.from(current));
  };

  const handleNext = async () => {
    const isValid = await trigger("selectedEvents");
    if (isValid && selectedEvents.length > 0) {
      onNext();
    } else {
      // Manual error handling if trigger doesn't catch empty array (zod min(1))
      if (selectedEvents.length === 0) {
        alert("Selecione pelo menos um evento.");
      }
    }
  };

  const handleSelectAll = useCallback(() => {
    const allEventIds = EVENT_TYPES.map((event) => event.id);
    const areAllSelected = allEventIds.every((id) => selectedEvents.includes(id));
    
    if (areAllSelected) {
      setValue("selectedEvents", []);
    } else {
      setValue("selectedEvents", allEventIds);
    }
  }, [selectedEvents, setValue]);

  const areAllSelected = EVENT_TYPES.length > 0 && EVENT_TYPES.every((event) => selectedEvents.includes(event.id));

  return (
    <div className={styles.container}>
      <div className="flex flex-row justify-between items-center mb-6">
        <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>
          Selecione os itens para compor o orçamento
        </h2>
        <Button 
          variant="outline" 
          onClick={handleSelectAll}
          style={{ height: 'auto', padding: '6px 12px', fontSize: '13px' }}
        >
          {areAllSelected ? "Desmarcar tudo" : "Selecionar tudo"}
        </Button>
      </div>

      <div className={eventStyles.grid}>
        {EVENT_TYPES.map((event) => {
          const isSelected = selectedEvents.includes(event.id);

          return (
            <div
              key={event.id}
              className={clsx(
                eventStyles.card,
                isSelected && eventStyles.selected,
              )}
              onClick={() => toggleEvent(event.id)}
            >
              <div className={eventStyles.checkbox}>
                {isSelected && <Check size={14} color="white" />}
              </div>
              <span className={eventStyles.label}>{event.title}</span>
            </div>
          );
        })}
      </div>

      <div className={styles.actions}>
        <Button variant="outline" onClick={onBack}>
          Voltar
        </Button>
        <Button onClick={handleNext}>Próximo: Itens e Valores</Button>
      </div>
    </div>
  );
}
