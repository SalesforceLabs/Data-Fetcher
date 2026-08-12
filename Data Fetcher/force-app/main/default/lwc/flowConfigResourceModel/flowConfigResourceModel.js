/** Shared, UI-independent contracts and transforms for Flow resource pickers. */

export const SCREEN_OUTPUT_TYPES = new Set([
  "apex",
  "boolean",
  "currency",
  "date",
  "datetime",
  "multipicklist",
  "number",
  "picklist",
  "sobject",
  "string",
  "time"
]);

export const CATEGORY_ORDER = [
  "Screen",
  "Choices",
  "Constants",
  "Formulas",
  "Record Variables",
  "Simple Variables",
  "Apex-Defined Variables",
  "Text Templates",
  "Stages",
  "Action Outputs",
  "Apex Action Outputs",
  "Subflows",
  "Element Outputs",
  "Global Constants",
  "Global Variables"
];

export const CATEGORY_ICONS = {
  Screen: "utility:screen",
  Choices: "utility:choice",
  Constants: "utility:toggle",
  Formulas: "utility:number_input",
  "Record Variables": "utility:record_alt",
  "Simple Variables": "utility:variable",
  "Apex-Defined Variables": "utility:apex",
  "Text Templates": "utility:text_template",
  Stages: "utility:stage",
  "Global Constants": "utility:toggle",
  "Global Variables": "utility:world"
};

export const GLOBAL_CONTAINERS = [
  {
    key: "global-api",
    label: "API",
    namespace: "$Api",
    iconName: "utility:world",
    isApiSystemContainer: true,
    supportedTypes: ["String"]
  },
  {
    key: "global-setup",
    label: "Custom Hierarchy Settings",
    namespace: "$Setup",
    iconName: "utility:hierarchy",
    dynamic: true,
    supportedTypes: ["String", "Number", "Boolean", "Date", "DateTime", "Time"]
  },
  {
    key: "global-label",
    label: "Custom Label",
    namespace: "$Label",
    iconName: "utility:world",
    supportedTypes: ["String"],
    dynamic: true
  },
  {
    key: "global-flow",
    label: "Running Flow Interview",
    namespace: "$Flow",
    iconName: "utility:flow"
  },
  {
    key: "global-org",
    label: "Running Org",
    namespace: "$Organization",
    iconName: "utility:company",
    objectType: "Organization"
  },
  {
    key: "global-user",
    label: "Running User",
    namespace: "$User",
    iconName: "utility:user",
    objectType: "User"
  },
  {
    key: "global-profile",
    label: "Running User Profile",
    namespace: "$Profile",
    iconName: "utility:profile",
    objectType: "Profile"
  },
  {
    key: "global-role",
    label: "Running User Role",
    namespace: "$UserRole",
    iconName: "utility:user_role",
    objectType: "UserRole"
  },
  {
    key: "global-system",
    label: "System",
    namespace: "$System",
    iconName: "utility:world",
    isApiSystemContainer: true,
    supportedTypes: ["DateTime"]
  }
];

const INPUT_RESOURCE_COMPATIBILITY = Object.freeze({
  string: ["String", "Number", "Boolean", "Date", "DateTime", "Time"],
  number: ["Number"]
});

export function compatibleResourceTypesForInput(valueType) {
  const normalizedType = String(valueType || "String").toLowerCase();
  return (INPUT_RESOURCE_COMPATIBILITY[normalizedType] || [valueType])
    .filter(Boolean)
    .join(",");
}

export function typeToken(value) {
  if (value && typeof value === "object") {
    return (
      value.name ||
      value.typeName ||
      value.dataType ||
      value.value ||
      value.label ||
      ""
    );
  }
  return value || "";
}

export function normalizeOutputType(value, subtype) {
  const declared = String(typeToken(value));
  const normalizedDeclared = declared.replace(/\[\]$/, "").toLowerCase();
  const normalizedSubtype = String(typeToken(subtype))
    .replace(/\[\]$/, "")
    .toLowerCase();
  const aliases = {
    boolean: "Boolean",
    currency: "Number",
    date: "Date",
    datetime: "DateTime",
    decimal: "Number",
    double: "Number",
    email: "String",
    encryptedstring: "String",
    int: "Number",
    integer: "Number",
    long: "Number",
    multipicklist: "String",
    number: "Number",
    percent: "Number",
    phone: "String",
    picklist: "String",
    string: "String",
    text: "String",
    time: "Time",
    url: "String"
  };
  if (aliases[normalizedDeclared] || aliases[normalizedSubtype]) {
    return aliases[normalizedDeclared] || aliases[normalizedSubtype];
  }
  if (["sobject", "record"].includes(normalizedDeclared)) {
    return "SObject";
  }
  if (
    ["apex", "apexdefined"].includes(normalizedDeclared) ||
    normalizedDeclared.startsWith("apex://")
  ) {
    return "Apex";
  }
  return declared || "String";
}

function friendlyResourceType(value) {
  const normalized = normalizeOutputType(value);
  const labels = {
    Apex: "Apex-defined",
    SObject: "Record",
    String: "Text"
  };
  return labels[normalized] || normalized;
}

function naturalList(values) {
  if (values.length < 2) {
    return values[0] || "compatible";
  }
  if (values.length === 2) {
    return `${values[0]} or ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, or ${values[values.length - 1]}`;
}

/**
 * Applies the same type and cardinality contract used to filter picker results
 * to a committed or restored Flow reference. Incomplete descriptors are not
 * rejected until Salesforce metadata resolves their actual type.
 */
export function buildResourceCompatibilityError(
  resource,
  {
    acceptedTypes = "",
    collection = "any",
    inputLabel = "This input",
    resourceLabel,
    selectionKind = "resource",
    allowLiteral = false
  } = {}
) {
  if (!resource) {
    return "";
  }
  const rawType = resource.dataType || resource.valueDataType || resource.type;
  if (!rawType || String(rawType).toLowerCase() === "field reference") {
    return "";
  }
  const actualType = normalizeOutputType(rawType, resource.subtype);
  const expectedTypes = [
    ...new Set(
      String(acceptedTypes)
        .split(",")
        .map((type) => normalizeOutputType(type.trim()))
        .filter(Boolean)
    )
  ];
  const typeMismatch =
    expectedTypes.length > 0 &&
    !expectedTypes.some(
      (type) => type.toLowerCase() === actualType.toLowerCase()
    );
  const isCollection =
    resource.isCollection === true || resource.isCollection === "true";
  const collectionMismatch =
    (collection === "only" && !isCollection) ||
    (collection === "exclude" && isCollection);
  if (!typeMismatch && !collectionMismatch) {
    return "";
  }

  const resolvedResourceLabel =
    resourceLabel ||
    resource.displayLabels?.join(" > ") ||
    resource.label ||
    resource.name ||
    resource.reference ||
    "This resource";
  const actualDescription = `${friendlyResourceType(actualType)}${
    isCollection ? " collection" : ""
  }`;
  const expectedDescription = naturalList(
    expectedTypes.map(friendlyResourceType)
  );
  let requirement;
  if (collection === "only") {
    requirement = expectedTypes.length
      ? `a collection of ${expectedDescription} values`
      : "a collection";
  } else if (collection === "exclude") {
    requirement = expectedTypes.length
      ? `a single ${expectedDescription} value`
      : "a single value";
  } else {
    requirement = expectedTypes.length
      ? expectedDescription
      : "a compatible value";
  }
  let nextStep;
  if (expectedTypes.length === 1 && expectedTypes[0] === "Number") {
    nextStep = `Select a Number ${selectionKind}${
      allowLiteral ? " or enter a numeric value" : ""
    }.`;
  } else {
    nextStep = `Select a compatible ${selectionKind}.`;
  }
  return `“${resolvedResourceLabel}” has type ${actualDescription}. ${inputLabel} requires ${requirement}. ${nextStep}`;
}

export function asBrowseNode(item) {
  return {
    kind: "list",
    label: item.label,
    path: item.path,
    items: item.items || []
  };
}

export function searchNestedItems(items, query, ancestors = []) {
  const matches = [];
  (items || []).forEach((item) => {
    const searchText = [item.label, item.name, item.reference, item.meta]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (searchText.includes(query)) {
      matches.push({
        ...item,
        searchLabel: item.label,
        browseAncestors: ancestors
      });
    }
    if (item.isListContainer) {
      searchNestedItems(item.items, query, [
        ...ancestors,
        asBrowseNode(item)
      ]).forEach((match) => {
        matches.push({
          ...match,
          searchLabel: `${item.label} > ${match.searchLabel || match.label}`
        });
      });
    }
  });
  return matches;
}

/**
 * Builds a stable lowercase search document once when Flow metadata changes.
 * Picker queries can then avoid repeatedly serializing large metadata trees.
 */
export function buildResourceSearchText(value) {
  const tokens = [];
  const visit = (item) => {
    if (item === null || item === undefined) {
      return;
    }
    if (["string", "number", "boolean"].includes(typeof item)) {
      tokens.push(String(item));
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (typeof item === "object") {
      Object.values(item).forEach(visit);
    }
  };
  visit(value);
  return tokens.join(" ").toLowerCase();
}

export function normalizeAutomaticOutputMap(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return value && !Array.isArray(value) ? value : {};
}

export function automaticOutputEntry(field, outputMap) {
  const fieldName = String(field?.name || "");
  const componentApiName = fieldName.split(".").pop();
  const matchingKey = Object.keys(outputMap || {}).find((key) => {
    const normalizedKey = key.toLowerCase();
    return (
      normalizedKey === fieldName.toLowerCase() ||
      normalizedKey === componentApiName.toLowerCase() ||
      normalizedKey.endsWith(`.${componentApiName.toLowerCase()}`)
    );
  });
  return {
    found: Boolean(matchingKey),
    outputs:
      matchingKey && Array.isArray(outputMap[matchingKey])
        ? outputMap[matchingKey]
        : []
  };
}

export function groupResourceOptions({
  topLevelResources,
  automaticContainers,
  screenContainers,
  globalContainers
}) {
  const groups = new Map();
  [...topLevelResources, ...automaticContainers].forEach((resource) => {
    const category = resource.category || resource.source || "Resources";
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category).push(resource);
  });
  if (screenContainers.length) {
    groups.set("Screen", screenContainers);
  }
  if (globalContainers.length) {
    groups.set("Global Variables", globalContainers);
  }
  return [...groups.entries()].sort(([left], [right]) => {
    const leftIndex = CATEGORY_ORDER.indexOf(left);
    const rightIndex = CATEGORY_ORDER.indexOf(right);
    return (
      (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex) ||
      left.localeCompare(right)
    );
  });
}

export function buildRecordBrowseStack(rootResource, path, descriptor = {}) {
  if (descriptor?.browseAncestors?.length) {
    return descriptor.browseAncestors.map((node) => ({ ...node }));
  }
  const segments = String(path || "")
    .split(".")
    .filter(Boolean);
  const stack = [
    {
      kind: "record",
      label: rootResource.label,
      objectType: rootResource.objectType,
      path: segments[0]
    }
  ];
  let currentPath = segments[0];
  segments.slice(1, -1).forEach((segment, index) => {
    const objectType = descriptor.objectTypes?.[index];
    if (objectType) {
      currentPath = `${currentPath}.${segment}`;
      stack.push({
        kind: "record",
        label: descriptor.labels?.[index] || segment,
        objectType,
        path: currentPath
      });
    }
  });
  return stack;
}

export function findNestedResource(items, reference, parentLabels = []) {
  for (const item of items || []) {
    const labels = [...parentLabels, item.label || item.name];
    if (item.reference === reference) {
      return { resource: item, labels };
    }
    const nested = findNestedResource(item.items, reference, labels);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function uniqueNamedOutputs(outputs) {
  const seenNames = new Set();
  return (outputs || []).filter((output) => {
    const name = output?.name || output?.apiName;
    if (!name || seenNames.has(name)) {
      return false;
    }
    seenNames.add(name);
    return true;
  });
}

function outputIsCollection(output, typeText) {
  return (
    output.isCollection === true ||
    output.isCollection === "true" ||
    output.collection === true ||
    output.collection === "true" ||
    Number(output.maxOccurs) > 1 ||
    String(output.maxOccurs).toLowerCase() === "unbounded" ||
    typeText.includes("[]") ||
    String(typeToken(output.subtype)).includes("[]")
  );
}

function outputDataType(output, typeText, genericTypeName) {
  const normalizedType = genericTypeName.toLowerCase();
  return normalizedType === "sobject" ||
    normalizedType === "record" ||
    output.objectType ||
    output.objectApiName ||
    output.sobjectType ||
    /^\{.+\}$/.test(typeText)
    ? "SObject"
    : normalizeOutputType(
        output.dataType || output.valueDataType || output.type || "String",
        output.subtype
      );
}

/**
 * Builds the normalized, recursively browseable output tree used for screen
 * components, subflows, actions, and Apex-defined values.
 */
export function buildOutputItems({
  path,
  outputs,
  field = {},
  screen = {},
  automaticOutputMap = {},
  allowRecordFields,
  resolveObjectType,
  isCompatible,
  iconForResource
}) {
  return uniqueNamedOutputs(outputs)
    .map((output, index) => {
      const name = output.name || output.apiName;
      const declaredType =
        output.dataType || output.valueDataType || output.type || "String";
      const typeText = String(typeToken(declaredType));
      const genericTypeName = typeText
        .replace(/^\{/, "")
        .replace(/\}$/, "")
        .replace(/\[\]$/, "");
      const dataType = outputDataType(output, typeText, genericTypeName);
      const objectType =
        dataType === "SObject"
          ? resolveObjectType(field, output, genericTypeName, screen)
          : null;
      const isCollection = outputIsCollection(output, typeText);
      const outputPath = `${path}.${name}`;
      const childItems = buildOutputItems({
        path: outputPath,
        outputs: automaticOutputMap[outputPath] || [],
        field,
        screen,
        automaticOutputMap,
        allowRecordFields,
        resolveObjectType,
        isCompatible,
        iconForResource
      });
      const option = {
        key: `automatic-output-${outputPath}-${index}`,
        label: output.label || name,
        name,
        path: outputPath,
        reference: `{!${outputPath}}`,
        dataType,
        objectType,
        apexClass:
          typeToken(output.apexClass || output.apexClassName) ||
          (dataType === "Apex" ? typeToken(output.subtype) : null),
        isCollection,
        iconName: iconForResource({ dataType }),
        meta: [dataType, isCollection ? "Collection" : null, objectType]
          .filter(Boolean)
          .join(" · ")
      };
      const canBrowseRecord =
        allowRecordFields &&
        dataType === "SObject" &&
        !isCollection &&
        Boolean(objectType);
      const canBrowseApex =
        allowRecordFields &&
        dataType === "Apex" &&
        !isCollection &&
        Boolean(option.apexClass);
      if (childItems.length && !isCollection) {
        return {
          ...option,
          items: childItems,
          isListContainer: true,
          browseFields: true
        };
      }
      return isCompatible(option) || canBrowseRecord || canBrowseApex
        ? {
            ...option,
            browseFields: canBrowseRecord || canBrowseApex,
            browseApex: canBrowseApex
          }
        : null;
    })
    .filter(Boolean);
}
