/**
 * Produces the state transition for a generic SObject collection and its
 * dependent field selection. Editors apply the returned plan through Flow's
 * configuration events, keeping this policy consistent across adopters.
 */
export function planCollectionChange({
  newValue,
  objectType,
  currentObjectType,
  dependentValue,
  fallbackObjectType = null
}) {
  if (objectType && objectType !== currentObjectType) {
    return {
      changed: true,
      nextObjectType: objectType,
      clearDependent: true,
      showResetNotice: Boolean(currentObjectType && dependentValue)
    };
  }
  if (!newValue || !objectType) {
    return {
      changed: true,
      nextObjectType: fallbackObjectType,
      clearDependent: true,
      showResetNotice: Boolean(currentObjectType && dependentValue)
    };
  }
  return {
    changed: false,
    nextObjectType: currentObjectType,
    clearDependent: false,
    showResetNotice: false
  };
}
