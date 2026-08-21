import { createElement } from "lwc";
import FlowConfigEditorForm from "c/flowConfigEditorForm";
import { normalizeSchema } from "c/flowConfigEditorSchema";

const SCHEMA = normalizeSchema({
  records: { type: "SObject", collection: true, label: "Records" },
  chosen: { type: "field", dependsOn: "records", label: "Chosen" },
  heading: { type: "String", label: "Heading" }
});

const CUSTOM_SCHEMA = normalizeSchema({
  chosen: {
    type: "field",
    allowCustom: true,
    customModeProperty: "chosenIsCustom"
  }
});

function buildForm(overrides = {}) {
  const element = createElement("c-flow-config-editor-form", {
    is: FlowConfigEditorForm
  });
  element.schema = SCHEMA;
  element.builderContext = {};
  Object.assign(element, overrides);
  document.body.appendChild(element);
  return element;
}

function control(element, property) {
  return element.shadowRoot.querySelector(`[data-property="${property}"]`);
}

describe("c-flow-config-editor-form", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders nothing without a schema", () => {
    const element = createElement("c-flow-config-editor-form", {
      is: FlowConfigEditorForm
    });
    document.body.appendChild(element);
    expect(element.shadowRoot.querySelectorAll("[data-property]")).toHaveLength(
      0
    );
  });

  it("maps a collection flag onto the picker's collection mode", () => {
    const element = buildForm();
    expect(control(element, "records").collection).toBe("only");
  });

  it("passes values, data types, and object types to their controls", () => {
    const element = buildForm({
      values: { records: "{!accounts}", chosen: "Name", heading: "Hi" },
      valueDataTypes: { heading: "String" },
      objectTypes: { chosen: "Account" }
    });

    expect(control(element, "records").value).toBe("{!accounts}");
    expect(control(element, "chosen").objectApiName).toBe("Account");
    expect(control(element, "heading").valueDataType).toBe("String");
  });

  it("normalizes every control's change into one configchange event", () => {
    const element = buildForm();
    const handler = jest.fn();
    element.addEventListener("configchange", handler);

    control(element, "records").dispatchEvent(
      new CustomEvent("resourcechange", {
        detail: {
          newValue: "{!accounts}",
          newValueDataType: "reference",
          resource: { objectType: "Account" }
        }
      })
    );
    control(element, "chosen").dispatchEvent(
      new CustomEvent("fieldchange", {
        detail: { newValue: "Name", selectedValues: ["Name"] }
      })
    );
    control(element, "heading").dispatchEvent(
      new CustomEvent("valuechange", {
        detail: { newValue: "Hi", newValueDataType: "String" }
      })
    );

    expect(handler.mock.calls.map((call) => call[0].detail)).toEqual([
      {
        name: "records",
        newValue: "{!accounts}",
        newValueDataType: "reference",
        resource: { objectType: "Account" }
      },
      {
        name: "chosen",
        newValue: "Name",
        newValueDataType: "String",
        selectedValues: ["Name"]
      },
      { name: "heading", newValue: "Hi", newValueDataType: "String" }
    ]);
  });

  it("defaults a missing new value to null rather than dropping the change", () => {
    const element = buildForm();
    const handler = jest.fn();
    element.addEventListener("configchange", handler);

    control(element, "records").dispatchEvent(
      new CustomEvent("resourcechange", { detail: {} })
    );

    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "records",
      newValue: null,
      newValueDataType: "String",
      resource: null
    });
  });

  it("mirrors editor errors onto controls and reports their own", () => {
    const element = buildForm();
    const records = control(element, "records");
    const chosen = control(element, "chosen");
    records.setCustomValidity = jest.fn();
    records.reportValidity = jest.fn();
    chosen.setCustomValidity = jest.fn();
    chosen.reportValidity = jest.fn();
    Object.defineProperty(chosen, "validationMessage", {
      get: () => "Chosen is invalid.",
      configurable: true
    });

    const discovered = element.collectValidity(
      new Map([["records", "Records is required."]])
    );

    expect(records.setCustomValidity).toHaveBeenCalledWith(
      "Records is required."
    );
    expect(chosen.setCustomValidity).toHaveBeenCalledWith("");
    expect(discovered).toEqual([
      { key: "chosen", errorString: "Chosen is invalid." }
    ]);
  });

  it("tolerates being asked for validity with no errors at all", () => {
    const element = buildForm();
    expect(element.collectValidity(undefined)).toEqual([]);
  });

  it("renders the optional field-or-custom wrapper and persists mode changes", () => {
    const element = buildForm({
      schema: CUSTOM_SCHEMA,
      values: { chosenIsCustom: true },
      objectTypes: { chosen: "Account" }
    });
    const handler = jest.fn();
    element.addEventListener("configchange", handler);

    const chosen = control(element, "chosen");
    expect(chosen.tagName).toBe("C-FLOW-CONFIG-FIELD-INPUT");
    expect(chosen.customMode).toBe(true);
    chosen.dispatchEvent(
      new CustomEvent("modechange", { detail: { customMode: false } })
    );

    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "chosenIsCustom",
      newValue: false,
      newValueDataType: "Boolean",
      modeFor: "chosen"
    });
  });
});
