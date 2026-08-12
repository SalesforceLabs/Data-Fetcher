const DIRECT_RESOURCE_GROUPS = [
  ["variables", "Variable", {}],
  ["constants", "Constant", { category: "Constants" }],
  ["formulas", "Formula", { category: "Formulas" }],
  ["choices", "Choice", { dataType: "String", category: "Choices" }],
  [
    "textTemplates",
    "Text Template",
    { dataType: "String", category: "Text Templates" }
  ],
  ["stages", "Stage", { dataType: "String", category: "Stages" }]
];

const GLOBAL_SCALAR_RESOURCES = [
  {
    name: "$Flow.CurrentDate",
    dataType: "Date",
    label: "Current Date",
    namespace: "$Flow"
  },
  {
    name: "$Flow.CurrentDateTime",
    dataType: "DateTime",
    label: "Current Date/Time",
    namespace: "$Flow"
  },
  {
    name: "$Flow.CurrentRecord",
    dataType: "String",
    label: "Current Record ID",
    namespace: "$Flow"
  },
  {
    name: "$Flow.FaultMessage",
    dataType: "String",
    label: "Fault Message",
    namespace: "$Flow"
  },
  {
    name: "$Flow.InterviewGuid",
    dataType: "String",
    label: "Interview GUID",
    namespace: "$Flow"
  },
  {
    name: "$Flow.InterviewStartTime",
    dataType: "DateTime",
    label: "Interview Start Time",
    namespace: "$Flow"
  },
  {
    name: "$Flow.CurrentStage",
    dataType: "String",
    label: "Current Stage",
    namespace: "$Flow"
  },
  {
    name: "$Client.FormFactor",
    dataType: "String",
    label: "Client Form Factor",
    namespace: "$Client"
  },
  {
    name: "$System.OriginDateTime",
    dataType: "DateTime",
    label: "Origin Date/Time",
    namespace: "$System"
  }
];

function apiGlobalResources(builderContext, apiVersion) {
  const rawVersion =
    apiVersion ||
    builderContext.flowRuntimeApiVersion ||
    builderContext.apiVersion ||
    builderContext.flowApiVersion;
  const numericVersion = Number(rawVersion);
  if (!Number.isFinite(numericVersion) || numericVersion <= 0) {
    return [];
  }
  const resources = [];
  const latestMajorVersion = Math.floor(numericVersion);
  for (
    let majorVersion = 7;
    majorVersion <= latestMajorVersion;
    majorVersion += 1
  ) {
    const suffix = String(majorVersion * 10);
    resources.push(
      {
        name: `$Api.Enterprise_Server_URL_${suffix}`,
        dataType: "String",
        label: `Enterprise Server URL ${suffix}`,
        namespace: "$Api",
        apiVersion: majorVersion
      },
      {
        name: `$Api.Partner_Server_URL_${suffix}`,
        dataType: "String",
        label: `Partner Server URL ${suffix}`,
        namespace: "$Api",
        apiVersion: majorVersion
      }
    );
  }
  return resources;
}

const GLOBAL_CONSTANT_RESOURCES = [
  {
    name: "$GlobalConstant.EmptyString",
    dataType: "String",
    label: "Blank Value (Empty String)"
  },
  { name: "$GlobalConstant.True", dataType: "Boolean", label: "True" },
  { name: "$GlobalConstant.False", dataType: "Boolean", label: "False" }
];

const GLOBAL_RECORD_RESOURCES = [
  {
    name: "$User",
    objectType: "User",
    label: "Running User",
    namespace: "$User"
  },
  {
    name: "$Profile",
    objectType: "Profile",
    label: "Running User Profile",
    namespace: "$Profile"
  },
  {
    name: "$UserRole",
    objectType: "UserRole",
    label: "Running User Role",
    namespace: "$UserRole"
  },
  {
    name: "$Organization",
    objectType: "Organization",
    label: "Running Org",
    namespace: "$Organization"
  }
];

const ELEMENT_OUTPUT_GROUPS = [
  ["actionCalls", "Action"],
  ["apexPluginCalls", "Apex Action"],
  ["subflows", "Subflow"],
  ["screens", "Screen"]
];

const NESTED_OUTPUT_KEYS = [
  "outputParameters",
  "outputs",
  "outputVariables",
  "fields"
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstValue(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return null;
}

function typeToken(value) {
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

function normalizeDataType(value) {
  const token = typeToken(value);
  const normalized = String(token).toLowerCase();
  if (normalized === "record" || normalized === "sobject") {
    return "SObject";
  }
  if (normalized === "apex" || normalized === "apexdefined") {
    return "Apex";
  }
  const knownTypes = {
    boolean: "Boolean",
    currency: "Currency",
    date: "Date",
    datetime: "DateTime",
    number: "Number",
    decimal: "Number",
    integer: "Number",
    long: "Number",
    double: "Number",
    percent: "Number",
    string: "String"
  };
  return knownTypes[normalized] || token || "";
}

function normalizeCollectionFlag(source, fallback = false) {
  const value = firstValue(source, ["isCollection", "collection", "isArray"]);
  return value === null ? fallback : value === true || value === "true";
}

function normalizeResource(raw, source, referenceName, defaults = {}) {
  const name = referenceName || raw?.name || raw?.apiName;
  if (!name) {
    return null;
  }

  const objectType =
    firstValue(raw, ["objectType", "objectApiName", "object"]) ||
    defaults.objectType ||
    null;
  const dataType = normalizeDataType(
    firstValue(raw, ["dataType", "valueDataType", "type"]) || defaults.dataType
  );
  const isCollection = normalizeCollectionFlag(
    raw,
    defaults.isCollection || false
  );
  const label = raw?.label || raw?.name || raw?.apiName || name;
  let category = raw?.category || defaults.category;
  if (!category && source === "Variable") {
    category =
      dataType === "SObject"
        ? "Record Variables"
        : dataType === "Apex"
          ? "Apex-Defined Variables"
          : "Simple Variables";
  }
  category ||= `${source}s`;

  return {
    name,
    reference: toFlowReference(name),
    label,
    source,
    dataType,
    objectType,
    apexClass:
      typeToken(
        firstValue(raw, [
          "apexClass",
          "apexClassName",
          "className",
          "schemaUri"
        ]) || defaults.apexClass
      ) || null,
    isCollection,
    category,
    namespace: raw?.namespace || defaults.namespace || null,
    searchText: [
      label,
      name,
      source,
      dataType,
      objectType,
      isCollection ? "collection" : "single"
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  };
}

function getNestedOutputs(element) {
  const outputs = [];
  NESTED_OUTPUT_KEYS.forEach((key) => {
    asArray(element?.[key]).forEach((output) => outputs.push(output));
  });
  return outputs;
}

function addResource(resources, seen, resource) {
  if (!resource || seen.has(resource.reference)) {
    return;
  }
  seen.add(resource.reference);
  resources.push(resource);
}

/**
 * Converts either "MyVariable" or "{!MyVariable}" to Flow's merge-field form.
 */
export function toFlowReference(value) {
  const inner = fromFlowReference(value);
  return inner ? `{!${inner}}` : null;
}

/**
 * Returns the resource path without Flow's merge-field wrapper.
 */
export function fromFlowReference(value) {
  return String(value || "")
    .trim()
    .replace(/^\{!/, "")
    .replace(/\}$/, "")
    .trim();
}

/**
 * Turns Flow Builder's context into one predictable resource list.
 *
 * The Flow metadata shape differs by resource/element type and API version.
 * This adapter deliberately tolerates absent groups and alternate field names.
 */
export function collectFlowResources(builderContext = {}, apiVersion) {
  const resources = [];
  const seen = new Set();

  DIRECT_RESOURCE_GROUPS.forEach(([key, source, defaults]) => {
    asArray(builderContext[key]).forEach((raw) => {
      addResource(
        resources,
        seen,
        normalizeResource(raw, source, null, defaults)
      );
    });
  });

  [
    ...GLOBAL_SCALAR_RESOURCES,
    ...apiGlobalResources(builderContext, apiVersion)
  ].forEach((raw) => {
    addResource(
      resources,
      seen,
      normalizeResource(raw, "Global Variable", null, {
        category: "Global Variables"
      })
    );
  });
  GLOBAL_CONSTANT_RESOURCES.forEach((raw) => {
    addResource(
      resources,
      seen,
      normalizeResource(raw, "Global Constant", null, {
        category: "Global Constants"
      })
    );
  });
  GLOBAL_RECORD_RESOURCES.forEach((raw) => {
    addResource(
      resources,
      seen,
      normalizeResource(raw, "Global Variable", raw.name, {
        dataType: "SObject",
        objectType: raw.objectType,
        category: "Global Variables",
        namespace: raw.namespace
      })
    );
  });

  const recordObjectType =
    asArray(builderContext.variables).find(
      (variable) => variable.name === "$Record"
    )?.objectType ||
    builderContext.start?.object ||
    builderContext.start?.objectType;
  if (recordObjectType) {
    [
      ["$Record", "Triggering Record"],
      ["$Record__Prior", "Prior Triggering Record"]
    ].forEach(([name, label]) => {
      addResource(
        resources,
        seen,
        normalizeResource({ name, label }, "Global Variable", name, {
          dataType: "SObject",
          objectType: recordObjectType,
          category: "Record Variables"
        })
      );
    });
  }

  // A Get Records element is itself an automatic output resource.
  asArray(builderContext.recordLookups).forEach((lookup) => {
    const isCollection =
      lookup.isCollection === true ||
      lookup.getFirstRecordOnly === false ||
      lookup.getFirstRecordOnly === "false";
    addResource(
      resources,
      seen,
      normalizeResource(lookup, "Get Records", lookup.name || lookup.apiName, {
        dataType: "SObject",
        objectType: lookup.object,
        isCollection,
        category: "Record Variables"
      })
    );
  });

  ELEMENT_OUTPUT_GROUPS.forEach(([key, source]) => {
    asArray(builderContext[key]).forEach((element) => {
      const elementName = element.name || element.apiName;
      if (!elementName) {
        return;
      }
      getNestedOutputs(element).forEach((output) => {
        const outputName = output.name || output.apiName;
        if (!outputName) {
          return;
        }
        addResource(
          resources,
          seen,
          normalizeResource(output, source, `${elementName}.${outputName}`, {
            category: source === "Screen" ? "Screen" : `${source} Outputs`
          })
        );
      });
    });
  });

  return resources.sort((left, right) => {
    const sourceOrder = left.source.localeCompare(right.source);
    return sourceOrder || left.label.localeCompare(right.label);
  });
}

/**
 * Filters normalized resources for a picker.
 */
export function filterFlowResources(resources, options = {}) {
  const dataTypes = String(options.dataTypes || "")
    .split(",")
    .map((item) => normalizeDataType(item.trim()).toLowerCase())
    .filter(Boolean);
  const collection = options.collection || "any";
  const query = String(options.query || "")
    .trim()
    .toLowerCase();

  return asArray(resources).filter((resource) => {
    if (
      dataTypes.length &&
      !dataTypes.includes(String(resource.dataType || "").toLowerCase())
    ) {
      return false;
    }
    if (collection === "only" && !resource.isCollection) {
      return false;
    }
    if (collection === "exclude" && resource.isCollection) {
      return false;
    }
    return !query || resource.searchText.includes(query);
  });
}

export function findFlowResource(builderContext, reference) {
  const normalizedReference = toFlowReference(reference);
  return (
    collectFlowResources(builderContext).find(
      (resource) => resource.reference === normalizedReference
    ) || null
  );
}

/**
 * Returns the Salesforce Flow-style icon for a normalized resource or field.
 * Callers should pass the original UI API type as sourceDataType when the Flow
 * data type has been coerced (for example Address -> String).
 */
export function iconForFlowDataType(
  resource = {},
  fallback = "utility:variable"
) {
  if (resource.isRelationship) {
    return "utility:record_lookup";
  }
  if (resource.isCollection) {
    return String(resource.dataType).toLowerCase() === "sobject"
      ? "utility:record_collection"
      : "utility:collection";
  }
  const sourceType = String(resource.sourceDataType || "").toLowerCase();
  const dataType = String(resource.dataType || "").toLowerCase();
  if (dataType === "sobject") {
    return "utility:record_alt";
  }
  const iconByType = {
    apex: "utility:apex",
    boolean: "utility:toggle",
    currency: "utility:currency",
    date: "utility:event",
    datetime: "utility:date_time",
    decimal: "utility:number_input",
    double: "utility:number_input",
    id: "utility:text",
    integer: "utility:number_input",
    long: "utility:number_input",
    multipicklist: "utility:multi_picklist",
    "multi-select picklist": "utility:multi_picklist",
    number: "utility:number_input",
    percent: "utility:number_input",
    picklist: "utility:picklist_type",
    string: "utility:text",
    textarea: "utility:text",
    time: "utility:clock",
    url: "utility:text"
  };
  return iconByType[sourceType] || iconByType[dataType] || fallback;
}

export function flowDataTypeForField(fieldType) {
  const normalized = String(fieldType || "").toLowerCase();
  if (
    ["currency", "double", "integer", "long", "number", "percent"].includes(
      normalized
    )
  ) {
    return "Number";
  }
  if (normalized === "boolean") {
    return "Boolean";
  }
  if (normalized === "date") {
    return "Date";
  }
  if (normalized === "datetime") {
    return "DateTime";
  }
  return "String";
}

/**
 * Tests a UI API field type against the Flow data types accepted by a picker.
 * Salesforce exposes numeric fields as Currency, Double, Integer, Long, and
 * Percent, while Flow configuration editors accept the common Number type.
 */
export function isFieldTypeAccepted(fieldType, acceptedTypes = "") {
  const accepted = String(acceptedTypes)
    .split(",")
    .map((type) => normalizeDataType(type.trim()).toLowerCase())
    .filter(Boolean);
  return (
    !accepted.length ||
    accepted.includes(flowDataTypeForField(fieldType).toLowerCase())
  );
}

/**
 * Returns one relationship descriptor per possible target object. Reference
 * fields such as WhoId and WhatId are polymorphic and must not silently use
 * the first target returned by UI API.
 */
export function relationshipTargetsForField(field = {}) {
  if (!field.relationshipName || !Array.isArray(field.referenceToInfos)) {
    return [];
  }
  return field.referenceToInfos
    .map((target) => ({
      objectApiName: target.apiName || target.objectApiName,
      objectLabel: target.label || target.apiName || target.objectApiName
    }))
    .filter((target) => target.objectApiName);
}

export function getInputVariable(inputVariables, name) {
  return (
    asArray(inputVariables).find((variable) => variable?.name === name) || null
  );
}

export function getInputValue(
  inputVariables,
  name,
  fallback = null,
  asReference = false
) {
  const variable = getInputVariable(inputVariables, name);
  if (!variable || variable.value === undefined || variable.value === null) {
    return fallback;
  }
  return asReference ||
    String(variable.valueDataType || "").toLowerCase() === "reference"
    ? toFlowReference(variable.value)
    : variable.value;
}

const EVENT_OPTIONS = {
  bubbles: true,
  cancelable: false,
  composed: true
};

export function createInputValueChangedEvent(
  name,
  newValue,
  newValueDataType = "String"
) {
  return new CustomEvent("configuration_editor_input_value_changed", {
    ...EVENT_OPTIONS,
    detail: { name, newValue, newValueDataType }
  });
}

export function createInputValueDeletedEvent(
  name,
  newValueDataType = "String"
) {
  // Flow Builder's custom property editor contract persists both assignments
  // and clears through the input-value-changed event. A null value removes the
  // existing input assignment.
  return createInputValueChangedEvent(name, null, newValueDataType);
}

export function createGenericTypeMappingChangedEvent(typeName, typeValue) {
  return new CustomEvent("configuration_editor_generic_type_mapping_changed", {
    ...EVENT_OPTIONS,
    detail: { typeName, typeValue }
  });
}
