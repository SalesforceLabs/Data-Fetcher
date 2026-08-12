/**
 * Normalizes the declarative property schema a custom property editor can
 * publish as `static flowProperties`.
 *
 * The schema is deliberately small. It covers the shapes a Flow screen
 * component actually exposes — scalars, record collections, and fields chosen
 * from one of those collections — and stops there. Anything it cannot express
 * belongs in the imperative API on `c/flowConfigEditorBase`, which this layer
 * is built on top of rather than beside.
 */

const SCALAR_TYPES = new Set(["String", "Number"]);

/** Turns `singleRecords` into `Single Records` for a default label. */
function humanize(name) {
  const spaced = String(name)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function normalizeType(type) {
  const token = String(type || "String");
  if (token.toLowerCase() === "field") {
    return "field";
  }
  if (token.toLowerCase() === "sobject") {
    return "SObject";
  }
  return SCALAR_TYPES.has(token) ? token : "String";
}

/**
 * Expands `{ name: definition }` into an ordered list of complete descriptors.
 * Declaration order is preserved because it is also the rendering order.
 */
export function normalizeSchema(properties) {
  if (!properties || typeof properties !== "object") {
    return [];
  }
  return Object.entries(properties)
    .filter(([name, definition]) => name && definition)
    .map(([name, definition]) => {
      const type = normalizeType(definition.type);
      const isField = type === "field";
      return {
        name,
        type,
        label: definition.label || humanize(name),
        helpText: definition.helpText || null,
        required: definition.required === true,
        // A field selection is stored as a String property, so a collection
        // flag only means anything for a resource.
        collection: !isField && definition.collection === true,
        multiple: isField && definition.multiple === true,
        sortable: !isField || definition.sortable !== false,
        allowCustom: isField && definition.allowCustom === true,
        customModeProperty:
          isField && definition.allowCustom
            ? definition.customModeProperty || null
            : null,
        acceptedTypes: definition.acceptedTypes || "",
        placeholder: definition.placeholder || null,
        allowManual: definition.allowManual !== false,
        // Generic SObject mappings are how Flow persists the object type of a
        // collection, so a mirrored input property is optional.
        genericType: definition.genericType || null,
        objectProperty: definition.objectProperty || null,
        dependsOn: isField ? definition.dependsOn || null : null,
        isScalar: SCALAR_TYPES.has(type),
        isResource: type === "SObject",
        isField
      };
    });
}

/**
 * Object API name backing a property, preferring the mirrored input property
 * and falling back to the generic type mapping Flow already persists.
 */
export function objectTypeFor(descriptor, { input, genericType }) {
  if (!descriptor) {
    return null;
  }
  if (descriptor.objectProperty) {
    const mirrored = input(descriptor.objectProperty);
    if (mirrored) {
      return mirrored;
    }
  }
  return descriptor.genericType ? genericType(descriptor.genericType) : null;
}

/** Descriptor a field property draws its object type from. */
export function sourceDescriptor(descriptor, schema) {
  if (!descriptor?.dependsOn) {
    return null;
  }
  return schema.find((entry) => entry.name === descriptor.dependsOn) || null;
}

/**
 * Required-value errors for the current configuration. Editors add their own
 * rules by overriding `validateConfiguration()`.
 */
export function requiredErrors(schema, values) {
  return schema
    .filter((descriptor) => descriptor.required)
    .filter((descriptor) => {
      const value = values?.[descriptor.name];
      return value === null || value === undefined || value === "";
    })
    .map((descriptor) => ({
      key: descriptor.name,
      errorString: `${descriptor.label} is required.`
    }));
}
