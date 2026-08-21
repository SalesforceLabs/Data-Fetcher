const INTERNAL_SUFFIXES = ["ChangeEvent", "Feed", "History", "Share"];
const CUSTOM_OBJECT_SUFFIXES = ["__c", "__x"];

function usableLabel(label, apiName) {
  const candidate = String(label || "").trim();
  return candidate && !candidate.startsWith("__MISSING LABEL__")
    ? candidate
    : apiName;
}

export function normalizeObjectDescriptor(object = {}) {
  const apiName = object.apiName || "";
  const label = usableLabel(object.label, apiName);
  const labelPlural = usableLabel(object.labelPlural, label);
  return {
    ...object,
    apiName,
    label,
    labelPlural,
    searchText: [label, labelPlural, apiName]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  };
}

export function isNormalObject(object = {}) {
  const apiName = object.apiName || "";
  if (
    !apiName ||
    object.isCustomSetting ||
    apiName.endsWith("__e") ||
    INTERNAL_SUFFIXES.some((suffix) => apiName.endsWith(suffix))
  ) {
    return false;
  }
  if (object.isCustom) {
    return CUSTOM_OBJECT_SUFFIXES.some((suffix) => apiName.endsWith(suffix));
  }
  return Boolean(
    object.isCreateable || object.isUpdateable || object.isSearchable
  );
}

export function filterObjects(objects, options = {}) {
  return filterPreparedObjects(prepareObjects(objects), options);
}

export function filterPreparedObjects(
  objects,
  {
    query = "",
    allowedObjectNames = new Set(),
    queryableOnly = false,
    showAll = false,
    maxResults = 200
  } = {}
) {
  const normalizedQuery = query.trim().toLowerCase();
  return (Array.isArray(objects) ? objects : [])
    .filter((object) => showAll || isNormalObject(object))
    .filter((object) => !queryableOnly || object.isQueryable)
    .filter(
      (object) =>
        !allowedObjectNames.size ||
        allowedObjectNames.has(object.apiName.toLowerCase())
    )
    .filter(
      (object) =>
        !normalizedQuery || object.searchText.includes(normalizedQuery)
    )
    .slice(0, Math.max(1, Number(maxResults) || 200));
}

/** Normalizes and sorts a discovery response once for repeated local searches. */
export function prepareObjects(objects) {
  return (Array.isArray(objects) ? objects : [])
    .map(normalizeObjectDescriptor)
    .sort((left, right) => {
      if (Boolean(left.isCustom) !== Boolean(right.isCustom)) {
        return left.isCustom ? 1 : -1;
      }
      return left.label.localeCompare(right.label);
    });
}
