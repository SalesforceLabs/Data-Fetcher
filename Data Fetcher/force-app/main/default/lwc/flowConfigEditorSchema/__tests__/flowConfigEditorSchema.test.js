import {
  normalizeSchema,
  objectTypeFor,
  requiredErrors,
  sourceDescriptor
} from "c/flowConfigEditorSchema";

describe("c-flow-config-editor-schema", () => {
  describe("normalizeSchema", () => {
    it("returns an empty list for anything that is not a schema", () => {
      expect(normalizeSchema(null)).toEqual([]);
      expect(normalizeSchema(undefined)).toEqual([]);
      expect(normalizeSchema("records")).toEqual([]);
      expect(normalizeSchema({})).toEqual([]);
    });

    it("preserves declaration order, which is also render order", () => {
      const schema = normalizeSchema({
        heading: { type: "String" },
        records: { type: "SObject" },
        field: { type: "field" }
      });
      expect(schema.map((entry) => entry.name)).toEqual([
        "heading",
        "records",
        "field"
      ]);
    });

    it("derives a readable label from the property name", () => {
      const [single, snake] = normalizeSchema({
        singleRecords: {},
        page_size: {}
      });
      expect(single.label).toBe("Single Records");
      expect(snake.label).toBe("Page size");
    });

    it("keeps an explicit label", () => {
      const [descriptor] = normalizeSchema({
        records: { label: "Record Collection" }
      });
      expect(descriptor.label).toBe("Record Collection");
    });

    it("defaults an unknown or missing type to String", () => {
      const [missing, unknown] = normalizeSchema({
        a: {},
        b: { type: "Blob" }
      });
      expect(missing.type).toBe("String");
      expect(unknown.type).toBe("String");
      expect(missing.isScalar).toBe(true);
    });

    it("classifies resource and field properties", () => {
      const [resource, field] = normalizeSchema({
        records: { type: "SObject", collection: true },
        chosen: { type: "field", dependsOn: "records", multiple: true }
      });

      expect(resource.isResource).toBe(true);
      expect(resource.collection).toBe(true);
      expect(resource.isField).toBe(false);

      expect(field.isField).toBe(true);
      expect(field.multiple).toBe(true);
      expect(field.dependsOn).toBe("records");
    });

    it("normalizes optional field-or-custom mode configuration", () => {
      const [field, strict] = normalizeSchema({
        sortBy: {
          type: "field",
          allowCustom: true,
          customModeProperty: "sortByIsCustom"
        },
        displayField: { type: "field" }
      });

      expect(field.allowCustom).toBe(true);
      expect(field.customModeProperty).toBe("sortByIsCustom");
      expect(strict.allowCustom).toBe(false);
      expect(strict.customModeProperty).toBeNull();
    });

    it("ignores collection on a field and multiple on a resource", () => {
      const [resource, field] = normalizeSchema({
        records: { type: "SObject", multiple: true },
        chosen: { type: "field", collection: true }
      });
      expect(resource.multiple).toBe(false);
      expect(field.collection).toBe(false);
    });

    it("accepts type names case-insensitively", () => {
      const [resource, field] = normalizeSchema({
        records: { type: "sobject" },
        chosen: { type: "FIELD" }
      });
      expect(resource.type).toBe("SObject");
      expect(field.type).toBe("field");
    });

    it("drops entries without a definition", () => {
      expect(normalizeSchema({ records: null, "": {} })).toEqual([]);
    });

    it("allows manual references unless explicitly disabled", () => {
      const [permissive, strict] = normalizeSchema({
        a: {},
        b: { allowManual: false }
      });
      expect(permissive.allowManual).toBe(true);
      expect(strict.allowManual).toBe(false);
    });
  });

  describe("objectTypeFor", () => {
    const readers = (mirrored, mapped) => ({
      input: () => mirrored,
      genericType: () => mapped
    });

    it("prefers the mirrored input property", () => {
      const [descriptor] = normalizeSchema({
        records: { type: "SObject", genericType: "T", objectProperty: "obj" }
      });
      expect(objectTypeFor(descriptor, readers("Account", "Contact"))).toBe(
        "Account"
      );
    });

    it("falls back to the generic type mapping Flow persists", () => {
      const [descriptor] = normalizeSchema({
        records: { type: "SObject", genericType: "T", objectProperty: "obj" }
      });
      expect(objectTypeFor(descriptor, readers(null, "Contact"))).toBe(
        "Contact"
      );
    });

    it("returns null without a mapping or a mirror", () => {
      const [descriptor] = normalizeSchema({ records: { type: "SObject" } });
      expect(objectTypeFor(descriptor, readers(null, null))).toBeNull();
      expect(objectTypeFor(null, readers("Account", "Account"))).toBeNull();
    });
  });

  describe("sourceDescriptor", () => {
    const schema = normalizeSchema({
      records: { type: "SObject" },
      chosen: { type: "field", dependsOn: "records" },
      orphan: { type: "field", dependsOn: "missing" },
      heading: { type: "String" }
    });

    it("resolves the resource a field depends on", () => {
      expect(sourceDescriptor(schema[1], schema).name).toBe("records");
    });

    it("returns null for an unresolved or absent dependency", () => {
      expect(sourceDescriptor(schema[2], schema)).toBeNull();
      expect(sourceDescriptor(schema[3], schema)).toBeNull();
      expect(sourceDescriptor(null, schema)).toBeNull();
    });
  });

  describe("requiredErrors", () => {
    const schema = normalizeSchema({
      records: { type: "SObject", required: true, label: "Record Collection" },
      heading: { type: "String" }
    });

    it("reports a missing required value using its label", () => {
      expect(requiredErrors(schema, {})).toEqual([
        { key: "records", errorString: "Record Collection is required." }
      ]);
    });

    it("treats null, undefined, and empty string as missing", () => {
      expect(requiredErrors(schema, { records: null })).toHaveLength(1);
      expect(requiredErrors(schema, { records: undefined })).toHaveLength(1);
      expect(requiredErrors(schema, { records: "" })).toHaveLength(1);
    });

    it("stays quiet when required values are present", () => {
      expect(requiredErrors(schema, { records: "{!accounts}" })).toEqual([]);
    });

    it("never reports optional properties", () => {
      expect(requiredErrors(schema, { records: "x", heading: null })).toEqual(
        []
      );
    });
  });
});
