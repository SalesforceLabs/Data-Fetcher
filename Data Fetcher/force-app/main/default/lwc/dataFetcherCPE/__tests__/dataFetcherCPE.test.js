import { createElement } from "lwc";
import DataFetcherCPE from "c/dataFetcherCPE";

const flushPromises = () => Promise.resolve();

describe("c-data-fetcher-c-p-e", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("rehydrates existing references and generic mappings without changing their format", async () => {
    const element = createElement("c-data-fetcher-c-p-e", {
      is: DataFetcherCPE
    });
    const mappingChanges = [];
    element.addEventListener(
      "configuration_editor_generic_type_mapping_changed",
      (event) => mappingChanges.push(event.detail)
    );

    element.genericTypeMappings = [
      { typeName: "T", typeValue: "Contact" },
      { typeName: "S", typeValue: "Lead" }
    ];
    element.inputVariables = [
      { name: "objectName1", value: "Contact", valueDataType: "String" },
      { name: "objectName2", value: "Lead", valueDataType: "String" },
      {
        name: "queryString",
        value: "existingQuery",
        valueDataType: "reference"
      }
    ];
    document.body.appendChild(element);
    await flushPromises();

    const queryInput = element.shadowRoot.querySelector(
      'c-flow-config-value-input[data-property="queryString"]'
    );
    expect(queryInput.value).toBe("{!existingQuery}");
    expect(queryInput.valueDataType).toBe("reference");
    expect(mappingChanges).toEqual([]);
  });

  it("repairs both generic output mappings for a newly configured component", async () => {
    const element = createElement("c-data-fetcher-c-p-e", {
      is: DataFetcherCPE
    });
    const mappingChanges = [];
    element.addEventListener(
      "configuration_editor_generic_type_mapping_changed",
      (event) => mappingChanges.push(event.detail)
    );

    element.inputVariables = [];
    element.genericTypeMappings = [];
    document.body.appendChild(element);
    await flushPromises();

    expect(mappingChanges).toEqual([
      { typeName: "T", typeValue: "Account" },
      { typeName: "S", typeValue: "Account" }
    ]);
  });

  it("persists false as a Boolean instead of clearing the input", async () => {
    const element = createElement("c-data-fetcher-c-p-e", {
      is: DataFetcherCPE
    });
    const inputChanges = [];
    element.addEventListener(
      "configuration_editor_input_value_changed",
      (event) => inputChanges.push(event.detail)
    );
    element.inputVariables = [
      { name: "useWireService", value: true, valueDataType: "Boolean" }
    ];
    document.body.appendChild(element);
    await flushPromises();

    const toggle = element.shadowRoot.querySelector("lightning-input");
    toggle.checked = false;
    toggle.dispatchEvent(new CustomEvent("change"));

    expect(inputChanges).toContainEqual({
      name: "useWireService",
      newValue: false,
      newValueDataType: "Boolean"
    });
  });

  it("renders object-dependent field pickers in wire service mode", async () => {
    const element = createElement("c-data-fetcher-c-p-e", {
      is: DataFetcherCPE
    });
    element.inputVariables = [
      { name: "objectName1", value: "Contact", valueDataType: "String" },
      { name: "useWireService", value: true, valueDataType: "Boolean" },
      { name: "fields", value: "Name,Email", valueDataType: "String" }
    ];
    document.body.appendChild(element);
    await flushPromises();

    const additionalFields = element.shadowRoot.querySelector(
      'c-flow-config-field-input[data-property="fields"]'
    );
    const sortBy = element.shadowRoot.querySelector(
      'c-flow-config-field-input[data-property="sortBy"]'
    );
    expect(additionalFields.objectApiName).toBe("Contact");
    expect(additionalFields.multiple).toBe(true);
    expect(additionalFields.sortable).toBe(false);
    expect(additionalFields.value).toBe("Name,Email");
    expect(additionalFields.allowCustom).toBe(true);
    expect(additionalFields.customMode).toBe(false);
    expect(sortBy.objectApiName).toBe("Contact");
    expect(sortBy.allowCustom).toBe(true);
  });

  it("blocks an incompatible pasted resource through framework validation", async () => {
    const element = createElement("c-data-fetcher-c-p-e", {
      is: DataFetcherCPE
    });
    element.builderContext = {
      variables: [
        { name: "TextVariable", label: "Text Variable", dataType: "String" }
      ]
    };
    element.inputVariables = [
      { name: "objectName1", value: "Account", valueDataType: "String" },
      { name: "useWireService", value: true, valueDataType: "Boolean" },
      {
        name: "pageSize",
        value: "TextVariable",
        valueDataType: "reference"
      }
    ];
    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();

    expect(element.validate()).toContainEqual({
      key: "pageSize",
      errorString:
        "“Text Variable” has type Text. Page Size requires a single Number value. Select a Number resource or enter a numeric value."
    });
  });

  it("uses the framework object picker for both query objects", async () => {
    const element = createElement("c-data-fetcher-c-p-e", {
      is: DataFetcherCPE
    });
    element.inputVariables = [
      { name: "objectName1", value: "Contact", valueDataType: "String" }
    ];
    document.body.appendChild(element);
    await flushPromises();

    const objectPickers = element.shadowRoot.querySelectorAll(
      "c-flow-config-object-picker"
    );
    expect(objectPickers).toHaveLength(2);
    expect(objectPickers[0].propertyName).toBe("objectName1");
    expect(objectPickers[0].value).toBe("Contact");
    expect(objectPickers[0].queryableOnly).toBe(true);
    expect(objectPickers[1].propertyName).toBe("objectName2");
  });

  it("coordinates generic mappings when the framework object picker changes", async () => {
    const element = createElement("c-data-fetcher-c-p-e", {
      is: DataFetcherCPE
    });
    const mappingChanges = [];
    element.addEventListener(
      "configuration_editor_generic_type_mapping_changed",
      (event) => mappingChanges.push(event.detail)
    );
    element.inputVariables = [];
    element.genericTypeMappings = [
      { typeName: "T", typeValue: "Account" },
      { typeName: "S", typeValue: "Account" }
    ];
    document.body.appendChild(element);
    await flushPromises();

    element.shadowRoot
      .querySelector('[data-property="objectName1"]')
      .dispatchEvent(
        new CustomEvent("objectchange", {
          detail: { newValue: "Contact", objectType: "Contact" }
        })
      );

    expect(mappingChanges).toContainEqual({
      typeName: "T",
      typeValue: "Contact"
    });
  });

  it("opens legacy multi-sort values in custom mode", async () => {
    const element = createElement("c-data-fetcher-c-p-e", {
      is: DataFetcherCPE
    });
    element.inputVariables = [
      { name: "useWireService", value: true, valueDataType: "Boolean" },
      { name: "sortBy", value: "Name,CreatedDate", valueDataType: "String" }
    ];
    document.body.appendChild(element);
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(
        'c-flow-config-field-input[data-property="sortBy"]'
      ).customMode
    ).toBe(true);
  });

  it("persists the explicit custom sort mode", async () => {
    const element = createElement("c-data-fetcher-c-p-e", {
      is: DataFetcherCPE
    });
    const inputChanges = [];
    element.addEventListener(
      "configuration_editor_input_value_changed",
      (event) => inputChanges.push(event.detail)
    );
    element.inputVariables = [
      { name: "useWireService", value: true, valueDataType: "Boolean" }
    ];
    document.body.appendChild(element);
    await flushPromises();

    element.shadowRoot
      .querySelector('c-flow-config-field-input[data-property="sortBy"]')
      .dispatchEvent(
        new CustomEvent("modechange", { detail: { customMode: true } })
      );

    expect(inputChanges).toContainEqual({
      name: "sortByIsCustom",
      newValue: true,
      newValueDataType: "Boolean"
    });
  });

  it("hydrates and persists a Flow resource mode for Additional Fields", async () => {
    const element = createElement("c-data-fetcher-c-p-e", {
      is: DataFetcherCPE
    });
    const inputChanges = [];
    element.addEventListener(
      "configuration_editor_input_value_changed",
      (event) => inputChanges.push(event.detail)
    );
    element.inputVariables = [
      { name: "useWireService", value: true, valueDataType: "Boolean" },
      { name: "fields", value: "fieldApiNames", valueDataType: "reference" }
    ];
    document.body.appendChild(element);
    await flushPromises();

    const additionalFields = element.shadowRoot.querySelector(
      'c-flow-config-field-input[data-property="fields"]'
    );
    expect(additionalFields.customMode).toBe(true);
    additionalFields.dispatchEvent(
      new CustomEvent("modechange", { detail: { customMode: false } })
    );

    expect(inputChanges).toContainEqual({
      name: "fieldsIsCustom",
      newValue: false,
      newValueDataType: "Boolean"
    });
  });
});
