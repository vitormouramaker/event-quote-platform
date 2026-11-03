import { useState } from "react";
import {
  DEFAULT_DISCOUNT_MODE,
  type DiscountMode,
} from "../../domain/discountInput";

export function useSummaryStepGlobalDiscountDraft() {
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  // `requestedDiscount` é percentual no modo PERCENT e reais no modo FIXED.
  const [requestedDiscount, setRequestedDiscount] = useState<number>(0);
  const [requestedDiscountMode, setRequestedDiscountMode] =
    useState<DiscountMode>(DEFAULT_DISCOUNT_MODE);
  const [requestObservation, setRequestObservation] = useState<string>("");
  const [requestedAttachmentName, setRequestedAttachmentName] = useState<string | undefined>(undefined);
  const [requestedAttachmentFile, setRequestedAttachmentFile] = useState<File | null | undefined>(undefined);

  return {
    requestModalOpen,
    requestedDiscount,
    requestedDiscountMode,
    requestObservation,
    requestedAttachmentName,
    requestedAttachmentFile,
    setRequestedDiscount,
    setRequestedDiscountMode,
    setRequestObservation,
    openRequestModal: () => setRequestModalOpen(true),
    closeRequestModal: () => setRequestModalOpen(false),
    resetDraft: () => {
      setRequestedDiscount(0);
      setRequestedDiscountMode(DEFAULT_DISCOUNT_MODE);
      setRequestObservation("");
      setRequestedAttachmentName(undefined);
      setRequestedAttachmentFile(undefined);
    },
    setDraft: (
      value: number,
      observation: string,
      attachment?: File | null,
      mode: DiscountMode = DEFAULT_DISCOUNT_MODE,
    ) => {
      setRequestedDiscount(value);
      setRequestedDiscountMode(mode);
      setRequestObservation(observation);
      setRequestedAttachmentName(attachment?.name);
      setRequestedAttachmentFile(attachment ?? undefined);
    },
  };
}
