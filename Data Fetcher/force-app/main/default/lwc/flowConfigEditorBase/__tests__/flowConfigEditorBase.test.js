import { createElement, api } from "lwc";
import FlowConfigEditorBase from "c/flowConfigEditorBase";

/**
 * Only `@api` members are reachable on a custom element host, and the base
 * class deliberately keeps its helpers off the public Flow Builder surface.
 * This stand-in consumer exposes them so they can be exercised the same way a
 * real subclass calls them.
 */
class TestEditor extends FlowConfigEditorBase {
  declaredErrors = [];
  recordedChanges = [];

  configurationChanged(source) {
    this.recordedChanges.push(source);
  }

  validateConfiguration() {
    return this.declaredErrors;
  }

  @api
  get changes() {
    return this.recordedChanges;
  }

  @api
  set errors(value) {
    this.declaredErrors = value;
  }
  get errors() {
    return this.declaredErrors;
  }

  @api input(...args) {
    return super.input(...args);
  }
  @api reference(...args) {
    return super.reference(...args);
  }
  @api inputVariable(...args) {
    return super.inputVariable(...args);
  }
  @api inputDataType(...args) {
    return super.inputDataType(...args);
  }
  @api genericType(...args) {
    return super.genericType(...args);
  }
  @api
  get resolvedApiVersion() {
    return this.apiVersion;
  }
  @api setInput(...args) {
    return super.setInput(...args);
  }
  @api clearInput(...args) {
    return super.clearInput(...args);
  }
  @api setGenericType(...args) {
    return super.setGenericType(...args);
  }
  @api applyCollectionChange(...args) {
    return super.applyCollectionChange(...args);
  }
  @api setError(...args) {
    return super.setError(...args);
  }
  @api clearError(...args) {
    return super.clearError(...args);
  }
  @api clearErrors(...args) {
    return super.clearErrors(...args);
  }
  @api
  get errorList() {
    return this.validationErrors;
  }
  @api
  get hasErrors() {
    return this.hasValidationErrors;
  }
}

function buildEditor() {
  const element = createElement("c-test-editor", { is: TestEditor });
  document.body.appendChild(element);
  return element;
}

function captureEvents(element) {
  const events = [];
  [
    "configuration_editor_input_value_changed",
    "configuration_editor_generic_type_mapping_changed"
  ].forEach((name) => {
    element.addEventListener(name, (event) =>
      events.push({ type: name, detail: event.detail })
    );
  });
  return events;
}

describe("c-flow-config-editor-base", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  describe("Flow Builder inputs", () => {
    it("tolerates absent inputs", () => {
      const element = buildEditor();
      element.builderContext = null;
      element.inputVariables = null;
      element.genericTypeMappings = null;
      element.automaticOutputVariables = null;

      expect(element.builderContext).toEqual({ screens: [] });
      expect(element.inputVariables).toEqual([]);
      expect(element.genericTypeMappings).toEqual([]);
      expect(element.automaticOutputVariables).toEqual({});
    });

    it("clones the arrays pickers iterate so a republish cannot mutate them", () => {
      const element = buildEditor();
      const screens = [{ name: "Screen1" }];
      const outputs = { Screen1: [{ name: "value" }] };
      element.builderContext = { screens };
      element.automaticOutputVariables = outputs;

      screens.push({ name: "Screen2" });
      outputs.Screen1.push({ name: "other" });

      expect(element.builderContext.screens).toHaveLength(1);
      expect(element.automaticOutputVariables.Screen1).toHaveLength(1);
    });

    it("reports which input Flow Builder republished", () => {
      const element = buildEditor();
      element.builderContext = {};
      element.inputVariables = [];
      element.genericTypeMappings = [];
      element.automaticOutputVariables = {};

      expect(element.changes).toEqual([
        "builderContext",
        "inputVariables",
        "genericTypeMappings",
        "automaticOutputVariables"
      ]);
    });

    it("passes through non-object automatic output payloads unchanged", () => {
      const element = buildEditor();
      element.automaticOutputVariables = "unexpected";
      expect(element.automaticOutputVariables).toBe("unexpected");
    });
  });

  describe("reading saved configuration", () => {
    it("reads literals, references, and data-type markers", () => {
      const element = buildEditor();
      element.inputVariables = [
        { name: "label", value: "Total", valueDataType: "String" },
        { name: "records", value: "myCollection", valueDataType: "reference" }
      ];

      expect(element.input("label")).toBe("Total");
      expect(element.input("records")).toBe("{!myCollection}");
      expect(element.reference("records")).toBe("{!myCollection}");
      expect(element.inputDataType("records")).toBe("reference");
      expect(element.input("missing", "fallback")).toBe("fallback");
      expect(element.inputVariable("missing")).toBeNull();
      expect(element.inputDataType("missing", "String")).toBe("String");
    });

    it("resolves generic SObject type mappings by name", () => {
      const element = buildEditor();
      element.genericTypeMappings = [
        { typeName: "T", typeValue: "Account" },
        { typeName: "TOther", typeValue: null }
      ];

      expect(element.genericType("T")).toBe("Account");
      expect(element.genericType("TOther", "Contact")).toBe("Contact");
      expect(element.genericType("Absent")).toBeNull();
    });

    it("resolves the API version from every place Flow Builder has published it", () => {
      const element = buildEditor();
      expect(element.resolvedApiVersion).toBeNull();

      element.elementInfo = { apiVersion: 64 };
      expect(element.resolvedApiVersion).toBe(64);

      element.builderContext = { flowApiVersion: 65 };
      expect(element.resolvedApiVersion).toBe(65);

      element.builderContext = { apiVersion: 66 };
      expect(element.resolvedApiVersion).toBe(66);

      element.builderContext = { flowRuntimeApiVersion: 67, apiVersion: 66 };
      expect(element.resolvedApiVersion).toBe(67);
    });
  });

  describe("writing configuration", () => {
    it("dispatches the standard Flow Builder events", () => {
      const element = buildEditor();
      const events = captureEvents(element);

      element.setInput("label", "Total");
      element.setInput("count", 3, "Number");
      element.clearInput("label");
      element.setGenericType("T", "Account");

      expect(events).toEqual([
        {
          type: "configuration_editor_input_value_changed",
          detail: {
            name: "label",
            newValue: "Total",
            newValueDataType: "String"
          }
        },
        {
          type: "configuration_editor_input_value_changed",
          detail: { name: "count", newValue: 3, newValueDataType: "Number" }
        },
        {
          type: "configuration_editor_input_value_changed",
          detail: { name: "label", newValue: null, newValueDataType: "String" }
        },
        {
          type: "configuration_editor_generic_type_mapping_changed",
          detail: { typeName: "T", typeValue: "Account" }
        }
      ]);
    });
  });

  describe("applyCollectionChange", () => {
    const change = {
      objectProperty: "objectApiName",
      dependentProperty: "fieldApiName",
      typeName: "T"
    };

    it("moves the mapping, the mirrored object name, and the dependent field together", () => {
      const element = buildEditor();
      const events = captureEvents(element);

      const transition = element.applyCollectionChange({
        ...change,
        newValue: "{!accounts}",
        objectType: "Account",
        currentObjectType: null,
        dependentValue: null
      });

      expect(transition.changed).toBe(true);
      expect(transition.nextObjectType).toBe("Account");
      expect(events).toEqual([
        {
          type: "configuration_editor_generic_type_mapping_changed",
          detail: { typeName: "T", typeValue: "Account" }
        },
        {
          type: "configuration_editor_input_value_changed",
          detail: {
            name: "objectApiName",
            newValue: "Account",
            newValueDataType: "String"
          }
        },
        {
          type: "configuration_editor_input_value_changed",
          detail: {
            name: "fieldApiName",
            newValue: null,
            newValueDataType: "String"
          }
        }
      ]);
    });

    it("clears the mirrored object name when the collection is removed", () => {
      const element = buildEditor();
      const events = captureEvents(element);

      const transition = element.applyCollectionChange({
        ...change,
        newValue: null,
        objectType: null,
        currentObjectType: "Account",
        dependentValue: "Name"
      });

      expect(transition.showResetNotice).toBe(true);
      expect(events[0].detail).toEqual({ typeName: "T", typeValue: null });
      expect(events[1].detail).toEqual({
        name: "objectApiName",
        newValue: null,
        newValueDataType: "String"
      });
    });

    it("falls back to a supplied object type when one is offered", () => {
      const element = buildEditor();
      const events = captureEvents(element);

      const transition = element.applyCollectionChange({
        ...change,
        newValue: null,
        objectType: null,
        currentObjectType: "Contact",
        dependentValue: null,
        fallbackObjectType: "Account"
      });

      expect(transition.nextObjectType).toBe("Account");
      expect(events[0].detail).toEqual({ typeName: "T", typeValue: "Account" });
    });

    it("dispatches nothing when the object type is unchanged", () => {
      const element = buildEditor();
      const events = captureEvents(element);

      const transition = element.applyCollectionChange({
        ...change,
        newValue: "{!accounts}",
        objectType: "Account",
        currentObjectType: "Account",
        dependentValue: "Name"
      });

      expect(transition.changed).toBe(false);
      expect(events).toEqual([]);
    });
  });

  describe("validation", () => {
    it("returns declared errors and remembers the last result", () => {
      const element = buildEditor();
      element.setError("records", "Records is required.");

      expect(element.validate()).toEqual([
        { key: "records", errorString: "Records is required." }
      ]);
      expect(element.errorList).toHaveLength(1);
      expect(element.hasErrors).toBe(true);
    });

    it("merges business rules from validateConfiguration", () => {
      const element = buildEditor();
      element.setError("records", "Records is required.");
      element.errors = [{ key: "field", errorString: "Field is required." }];

      expect(element.validate()).toEqual([
        { key: "records", errorString: "Records is required." },
        { key: "field", errorString: "Field is required." }
      ]);
    });

    it("keeps the first message when two sources report the same key", () => {
      const element = buildEditor();
      element.setError("records", "Declared first.");
      element.errors = [{ key: "records", errorString: "Ignored." }];

      expect(element.validate()).toEqual([
        { key: "records", errorString: "Declared first." }
      ]);
    });

    it("ignores malformed entries returned by validateConfiguration", () => {
      const element = buildEditor();
      element.errors = [null, { key: "field" }, { errorString: "No key." }];

      expect(element.validate()).toEqual([]);
    });

    it("clears individual and all errors", () => {
      const element = buildEditor();
      element.setError("a", "A failed.");
      element.setError("b", "B failed.");
      element.clearError("a");
      expect(element.validate()).toEqual([
        { key: "b", errorString: "B failed." }
      ]);

      element.clearErrors();
      expect(element.validate()).toEqual([]);
      expect(element.hasErrors).toBe(false);
    });

    it("treats an empty message as clearing the error", () => {
      const element = buildEditor();
      element.setError("a", "A failed.");
      element.setError("a", "");
      expect(element.validate()).toEqual([]);
    });
  });
});
