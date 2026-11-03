type ShouldSyncHydratedFieldParams = {
  currentValue: unknown;
  dirtyFields: unknown;
  fieldPath: string;
  hasPersistedBudgetId: boolean;
  isFormDirty: boolean;
};

function getNestedFieldState(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

export function shouldSyncHydratedField({
  currentValue,
  dirtyFields,
  fieldPath,
  hasPersistedBudgetId,
  isFormDirty,
}: ShouldSyncHydratedFieldParams) {
  const path = fieldPath.split(".");
  const isFieldDirty = Boolean(getNestedFieldState(dirtyFields, path));

  if (isFieldDirty) return false;

  // Preserve hydrated values when reopening an already saved budget version.
  if (hasPersistedBudgetId && !isFormDirty && currentValue !== undefined) {
    return false;
  }

  return true;
}
