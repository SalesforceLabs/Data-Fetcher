import { createElement } from "lwc";
import { getObjectInfo } from "lightning/uiObjectInfoApi";
import describeApexType from "@salesforce/apex/FlowConfigApexTypeController.describeType";
import describeHierarchySettings from "@salesforce/apex/FlowConfigApexTypeController.describeHierarchySettings";
import describeSObjectPath from "@salesforce/apex/FlowConfigApexTypeController.describeSObjectPath";
import FlowConfigResourcePicker from "c/flowConfigResourcePicker";
import { clearRecordPathCache } from "c/flowConfigSchemaService";
import { clearMetadataCache } from "c/flowConfigMetadataService";
import { installImmediateAnimationFrames } from "../../../../../../test-utils/pickerTestUtils";

jest.mock(
  "@salesforce/apex/FlowConfigApexTypeController.describeType",
  () => ({ __esModule: true, default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/FlowConfigApexTypeController.describeSObjectPath",
  () => ({ __esModule: true, default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/FlowConfigApexTypeController.describeHierarchySettings",
  () => ({ __esModule: true, default: jest.fn() }),
  { virtual: true }
);

function flushPromises() {
  return Promise.resolve();
}

function pickerHeaderRoot(element) {
  return element.shadowRoot.querySelector("c-flow-config-picker-header")
    .shadowRoot;
}

describe("c-flow-config-resource-picker", () => {
  beforeEach(() => {
    installImmediateAnimationFrames();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    clearRecordPathCache();
    clearMetadataCache();
    window.history.replaceState({}, "", "/");
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("finds and selects an automatic Get Records collection", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.propertyName = "records";
    element.collection = "only";
    element.acceptedTypes = "SObject";
    element.builderContext = {
      recordLookups: [
        { name: "Get_Contacts", object: "Contact", getFirstRecordOnly: false }
      ]
    };
    const flowHandler = jest.fn();
    const resourceHandler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      flowHandler
    );
    element.addEventListener("resourcechange", resourceHandler);
    document.body.appendChild(element);

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    expect(
      element.shadowRoot.querySelector("button.result lightning-icon").iconName
    ).toBe("utility:record_collection");
    element.shadowRoot.querySelector("button.result").click();
    await flushPromises();

    expect(flowHandler).toHaveBeenCalledTimes(1);
    expect(flowHandler.mock.calls[0][0].detail).toEqual({
      name: "records",
      newValue: "{!Get_Contacts}",
      newValueDataType: "reference"
    });
    expect(resourceHandler.mock.calls[0][0].detail.resource).toMatchObject({
      objectType: "Contact",
      isCollection: true
    });
    expect(
      element.shadowRoot.querySelector("lightning-icon.selection__type")
        .iconName
    ).toBe("utility:record_collection");
    expect(
      element.shadowRoot.querySelector(".selection__primary").title
    ).toContain("Contact record collection");
  });

  it("uses data-type icons for resources inside a global namespace", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.builderContext = {};
    document.body.appendChild(element);

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    element.shadowRoot.querySelector('button[data-key="global-flow"]').click();
    await flushPromises();

    const options = [...element.shadowRoot.querySelectorAll("button.result")];
    const optionIcon = (label) =>
      options
        .find(
          (option) =>
            option.querySelector(".result__label").textContent === label
        )
        .querySelector("lightning-icon").iconName;

    expect(optionIcon("Current Date/Time")).toBe("utility:date_time");
    expect(optionIcon("Current Date")).toBe("utility:event");
    expect(optionIcon("Current Record ID")).toBe("utility:text");
  });

  it("excludes compound fields from global records and flags saved references", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.allowRecordFields = true;
    element.acceptedTypes = "String";
    element.builderContext = {};
    document.body.appendChild(element);

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    element.shadowRoot.querySelector('button[data-key="global-user"]').click();
    getObjectInfo.emit({
      apiName: "User",
      fields: {
        Name: {
          apiName: "Name",
          label: "Full Name",
          dataType: "String",
          compound: true
        },
        FirstName: {
          apiName: "FirstName",
          label: "First Name",
          dataType: "String",
          compound: false
        }
      }
    });
    await flushPromises();

    const labels = [
      ...element.shadowRoot.querySelectorAll("button.result .result__label")
    ].map((label) => label.textContent);
    expect(labels).toContain("First Name");
    expect(labels).not.toContain("Full Name");

    element.valueDataType = "reference";
    element.value = "{!$User.Name}";
    await flushPromises();
    expect(element.validationMessage).toContain(
      "Running User > Full Name is a compound field"
    );
  });

  it("rejects a pasted resource whose type is incompatible with the input", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.label = "Page Size";
    element.propertyName = "pageSize";
    element.acceptedTypes = "Number";
    element.collection = "exclude";
    element.allowManual = true;
    element.allowLiteral = true;
    element.literalType = "Number";
    element.builderContext = {
      variables: [
        { name: "TextVariable", label: "Text Variable", dataType: "String" }
      ]
    };
    document.body.appendChild(element);

    const input = element.shadowRoot.querySelector("lightning-input");
    input.dispatchEvent(new CustomEvent("focus"));
    input.dispatchEvent(
      new CustomEvent("input", {
        detail: { value: "{!TextVariable}" }
      })
    );
    await flushPromises();
    element.shadowRoot.querySelector("button.manual").click();
    await flushPromises();

    expect(element.validationMessage).toBe(
      "“Text Variable” has type Text. Page Size requires a single Number value. Select a Number resource or enter a numeric value."
    );
    expect(element.reportValidity()).toBe(false);
    expect(element.shadowRoot.querySelector(".picker__error").textContent).toBe(
      element.validationMessage
    );
  });

  it("accepts a restored resource with a compatible normalized numeric type", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.label = "Page Size";
    element.acceptedTypes = "Number";
    element.collection = "exclude";
    element.valueDataType = "reference";
    element.builderContext = {
      variables: [{ name: "CountVariable", dataType: "Integer" }]
    };
    element.value = "{!CountVariable}";
    document.body.appendChild(element);
    await flushPromises();

    expect(element.validationMessage).toBe("");
    expect(element.reportValidity()).toBe(true);
  });

  it("reopens an existing literal without refreshing Flow Builder", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.label = "Number Input";
    element.propertyName = "numberValue";
    element.acceptedTypes = "Number";
    element.collection = "exclude";
    element.allowLiteral = true;
    element.literalType = "Number";
    element.valueDataType = "Number";
    element.value = 324;
    const refreshHandler = jest.fn();
    element.addEventListener("flowresourcerefresh", refreshHandler);
    document.body.appendChild(element);

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    expect(refreshHandler).not.toHaveBeenCalled();
    expect(element.shadowRoot.querySelector(".results")).not.toBeNull();
    expect(element.shadowRoot.querySelector("lightning-input").value).toBe(
      "324"
    );
  });

  it("paints the popover shell before building root resources", async () => {
    const frames = [];
    window.requestAnimationFrame.mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.acceptedTypes = "Number";
    element.builderContext = {
      variables: [{ name: "Count", label: "Count", dataType: "Number" }]
    };
    document.body.appendChild(element);

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    expect(element.shadowRoot.querySelector(".results")).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(".results__empty").textContent
    ).toBe("Loading resources…");
    expect(element.shadowRoot.querySelector("button.result")).toBeNull();

    frames.shift()(0);
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(".results__empty").textContent
    ).toBe("Loading resources…");

    frames.shift()(16);
    await flushPromises();
    expect(element.shadowRoot.querySelector(".results__empty")).toBeNull();
    expect(
      element.shadowRoot.querySelector("button.result").textContent
    ).toContain("Count");
  });

  it("still requests refreshed Flow outputs for an empty input", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.propertyName = "numberValue";
    element.acceptedTypes = "Number";
    element.collection = "exclude";
    element.allowLiteral = true;
    element.literalType = "Number";
    const refreshHandler = jest.fn();
    element.addEventListener("flowresourcerefresh", refreshHandler);
    document.body.appendChild(element);

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    expect(refreshHandler).toHaveBeenCalledTimes(1);
  });

  it("skips unmatched automatic-output trees for a reopened literal", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.propertyName = "numberValue";
    element.acceptedTypes = "Number";
    element.collection = "exclude";
    element.allowLiteral = true;
    element.literalType = "Number";
    element.valueDataType = "Number";
    element.value = 324;
    element.builderContext = {
      subflows: [
        {
          name: "Tool_Schedule_Payments_Calculator",
          label: "Tool - Schedule Payments Calculator"
        }
      ]
    };
    element.automaticOutputVariables = {
      Tool_Schedule_Payments_Calculator: [
        { apiName: "count", label: "Count", dataType: "Number" }
      ]
    };
    document.body.appendChild(element);

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".resource-group__title")
    ).toBeNull();
    expect(
      element.shadowRoot.querySelector(
        'button[data-key="automatic-container-Tool_Schedule_Payments_Calculator"]'
      )
    ).toBeNull();
    expect(element.shadowRoot.querySelector("button.manual")).not.toBeNull();
  });

  it("shows only the matching nested output when its container does not match", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.acceptedTypes = "Number";
    element.collection = "exclude";
    element.builderContext = {
      subflows: [{ name: "Call_Subflow", label: "Call Subflow" }]
    };
    element.automaticOutputVariables = {
      Call_Subflow: [
        { apiName: "count", label: "Matching Count", dataType: "Number" },
        { apiName: "total", label: "Other Total", dataType: "Number" }
      ]
    };
    document.body.appendChild(element);
    const input = element.shadowRoot.querySelector("lightning-input");
    input.dispatchEvent(new CustomEvent("focus"));
    input.dispatchEvent(
      new CustomEvent("input", { detail: { value: "matching" } })
    );
    await flushPromises();

    const results = [
      ...element.shadowRoot.querySelectorAll("button.result .result__label")
    ].map((label) => label.textContent);
    expect(results).toEqual(["Outputs from Call Subflow > Matching Count"]);
  });

  it("distinguishes API and System containers from Custom Label values", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.builderContext = {};
    document.body.appendChild(element);

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(
        'button[data-key="global-api"] svg.result__api-system-icon'
      )
    ).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(
        'button[data-key="global-system"] svg.result__api-system-icon'
      )
    ).not.toBeNull();
    expect(
      element.shadowRoot.querySelector(
        'button[data-key="global-label"] lightning-icon'
      ).iconName
    ).toBe("utility:world");
    const globalContainers = [
      ...element.shadowRoot.querySelectorAll('button[data-key^="global-"]')
    ];
    expect(globalContainers.length).toBeGreaterThan(0);
    globalContainers.forEach((container) => {
      expect(container.querySelector(".result__chevron")).not.toBeNull();
    });
    expect(
      element.shadowRoot.querySelector(
        'button[data-key="$GlobalConstant.True"] .result__chevron'
      )
    ).toBeNull();

    element.shadowRoot.querySelector('button[data-key="global-label"]').click();
    await flushPromises();
    const frame = element.shadowRoot.querySelector("iframe.apex-bridge");
    frame.contentWindow.postMessage = jest.fn();
    const bridgeOrigin = "https://example--c.vf.force.com";
    window.dispatchEvent(
      new MessageEvent("message", {
        source: frame.contentWindow,
        origin: bridgeOrigin,
        data: { channel: "flow-config-apex-type", action: "ready" }
      })
    );
    await flushPromises();
    const [request] = frame.contentWindow.postMessage.mock.calls[0];
    expect(request.action).toBe("describeCustomLabels");

    window.dispatchEvent(
      new MessageEvent("message", {
        source: frame.contentWindow,
        origin: bridgeOrigin,
        data: {
          channel: "flow-config-apex-type",
          action: "result",
          requestId: request.requestId,
          success: true,
          labels: [
            {
              name: "$Label.example_Label",
              label: "Example Label"
            }
          ]
        }
      })
    );
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const labelOption = element.shadowRoot.querySelector("button.result");
    expect(labelOption.querySelector(".result__label").textContent).toBe(
      "Example Label"
    );
    expect(labelOption.querySelector("lightning-icon").iconName).toBe(
      "utility:text"
    );
  });

  it("rehydrates saved Custom Label values with their text icon", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.valueDataType = "reference";
    element.value = "{!$Label.example_Label}";
    element.builderContext = {};
    document.body.appendChild(element);
    await flushPromises();

    const frame = element.shadowRoot.querySelector("iframe.apex-bridge");
    frame.contentWindow.postMessage = jest.fn();
    const bridgeOrigin = "https://example--c.vf.force.com";
    window.dispatchEvent(
      new MessageEvent("message", {
        source: frame.contentWindow,
        origin: bridgeOrigin,
        data: { channel: "flow-config-apex-type", action: "ready" }
      })
    );
    await flushPromises();
    const [request] = frame.contentWindow.postMessage.mock.calls[0];
    window.dispatchEvent(
      new MessageEvent("message", {
        source: frame.contentWindow,
        origin: bridgeOrigin,
        data: {
          channel: "flow-config-apex-type",
          action: "result",
          requestId: request.requestId,
          success: true,
          labels: [
            {
              name: "$Label.example_Label",
              label: "Example Label"
            }
          ]
        }
      })
    );
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(
      element.shadowRoot.querySelector("lightning-icon.selection__type")
        .iconName
    ).toBe("utility:text");
    expect(
      element.shadowRoot.querySelector(".selection__leaf").textContent
    ).toBe("Example Label");
  });

  it("rehydrates saved hierarchy-setting fields with their field icon", async () => {
    describeHierarchySettings.mockResolvedValue(
      JSON.stringify([
        {
          name: "Feature_Settings__c",
          label: "Feature Settings",
          fields: [
            {
              name: "Message__c",
              label: "Message",
              dataType: "String",
              sourceDataType: "STRING"
            }
          ]
        }
      ])
    );
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.valueDataType = "reference";
    element.value = "{!$Setup.Feature_Settings__c.Message__c}";
    element.builderContext = {};
    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(
      element.shadowRoot.querySelector("lightning-icon.selection__type")
        .iconName
    ).toBe("utility:text");
    expect(
      element.shadowRoot.querySelector(".selection__leaf").textContent
    ).toBe("Message");
  });

  it("builds the supported API URL globals from the Flow API version", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.apiVersion = 67;
    element.builderContext = {};
    document.body.appendChild(element);

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    element.shadowRoot.querySelector('button[data-key="global-api"]').click();
    await flushPromises();

    const text = element.shadowRoot.querySelector(".results__list").textContent;
    expect(text).toContain("{!$Api.Partner_Server_URL_670}");
    expect(text).toContain("{!$Api.Enterprise_Server_URL_670}");
    expect(text).toContain("{!$Api.Partner_Server_URL_70}");
    expect(text).toContain("{!$Api.Enterprise_Server_URL_70}");
    expect(element.shadowRoot.querySelectorAll("button.result")).toHaveLength(
      122
    );
    expect(text).not.toContain("Session ID");
  });

  it("hides global containers with no compatible numeric resources", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.apiVersion = 67;
    element.builderContext = {};
    element.acceptedTypes = "Number";
    element.collection = "exclude";
    element.allowRecordFields = true;
    document.body.appendChild(element);

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    expect(
      element.shadowRoot.querySelector('button[data-key="global-flow"]')
    ).toBeNull();
    expect(
      element.shadowRoot.querySelector('button[data-key="global-api"]')
    ).toBeNull();
    expect(
      element.shadowRoot.querySelector('button[data-key="global-system"]')
    ).toBeNull();
    expect(
      element.shadowRoot.querySelector('button[data-key="global-org"]')
    ).not.toBeNull();
  });

  it("loads compatible hierarchy custom-setting fields as nested resources", async () => {
    describeHierarchySettings.mockResolvedValue(
      JSON.stringify([
        {
          name: "Feature_Settings__c",
          label: "Feature Settings",
          fields: [
            {
              name: "Threshold__c",
              label: "Threshold",
              dataType: "Number",
              sourceDataType: "DOUBLE"
            },
            {
              name: "Message__c",
              label: "Message",
              dataType: "String",
              sourceDataType: "STRING"
            }
          ]
        }
      ])
    );
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.builderContext = {};
    element.acceptedTypes = "Number";
    element.propertyName = "numberValue";
    const changeHandler = jest.fn();
    element.addEventListener("resourcechange", changeHandler);
    document.body.appendChild(element);

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    await flushPromises();
    await flushPromises();
    element.shadowRoot.querySelector('button[data-key="global-setup"]').click();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const setting = element.shadowRoot.querySelector(
      'button[data-key="custom-setting-Feature_Settings__c"]'
    );
    expect(setting).not.toBeNull();
    setting.click();
    await flushPromises();
    const text = element.shadowRoot.querySelector(".results__list").textContent;
    expect(text).toContain("Threshold");
    expect(text).not.toContain("Message");
    element.shadowRoot.querySelector("button.result").click();
    expect(changeHandler.mock.calls[0][0].detail.newValue).toBe(
      "{!$Setup.Feature_Settings__c.Threshold__c}"
    );
  });

  it("hides Custom Hierarchy Settings when it has no compatible fields", async () => {
    describeHierarchySettings.mockResolvedValue(
      JSON.stringify([
        {
          name: "Feature_Settings__c",
          label: "Feature Settings",
          fields: [
            {
              name: "Message__c",
              label: "Message",
              dataType: "String",
              sourceDataType: "STRING"
            }
          ]
        }
      ])
    );
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.builderContext = {};
    element.acceptedTypes = "Number";
    document.body.appendChild(element);

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(
      element.shadowRoot.querySelector('button[data-key="global-setup"]')
    ).toBeNull();
  });

  it("dispatches the delete contract when cleared", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.propertyName = "records";
    element.value = "{!Accounts}";
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    await flushPromises();

    element.shadowRoot.querySelector("button.selection__clear").click();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "records",
      newValue: null,
      newValueDataType: "reference"
    });
  });

  it("turns a selected resource pill back into editable reference text", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.value = "{!CurrentContact.Email}";
    element.builderContext = {
      variables: [
        { name: "CurrentContact", dataType: "SObject", objectType: "Contact" }
      ]
    };
    document.body.appendChild(element);
    await flushPromises();

    const selection = element.shadowRoot.querySelector(".selection");
    expect(selection.querySelector(".selection__parent").textContent).toBe(
      "CurrentContact"
    );
    expect(selection.querySelector(".selection__leaf").textContent).toBe(
      "Email"
    );
    selection.click();
    element.shadowRoot.querySelector(".picker").dispatchEvent(
      new FocusEvent("focusout", {
        bubbles: true,
        composed: true,
        relatedTarget: null
      })
    );
    await flushPromises();

    expect(element.shadowRoot.querySelector(".selection")).toBeNull();
    expect(element.shadowRoot.querySelector("section.results")).not.toBeNull();
    const editableInput = element.shadowRoot.querySelector("lightning-input");
    expect(editableInput.value).toBe("{!CurrentContact.Email}");
    editableInput.dispatchEvent(
      new CustomEvent("input", {
        detail: { value: "{!CurrentContact.Name}" }
      })
    );
    await flushPromises();
    expect(element.shadowRoot.querySelector("lightning-input").value).toBe(
      "{!CurrentContact.Name}"
    );

    pickerHeaderRoot(element)
      .querySelector('lightning-button-icon[title="Close resources"]')
      .click();
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(".selection__leaf").textContent
    ).toBe("Name");
  });

  it("commits a pasted reference when editing closes", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.propertyName = "textValue";
    element.value = "{!varOpportunity.StageName}";
    element.builderContext = {
      variables: [
        {
          name: "varOpportunity",
          dataType: "SObject",
          objectType: "Opportunity"
        }
      ]
    };
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    await flushPromises();

    element.shadowRoot.querySelector(".selection").click();
    await flushPromises();
    element.shadowRoot.querySelector("lightning-input").dispatchEvent(
      new CustomEvent("input", {
        detail: { value: "{!varOpportunity.Name}" }
      })
    );
    pickerHeaderRoot(element)
      .querySelector('lightning-button-icon[title="Close resources"]')
      .click();
    await flushPromises();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "textValue",
      newValue: "{!varOpportunity.Name}",
      newValueDataType: "reference"
    });
    expect(
      element.shadowRoot.querySelector(".selection__parent").textContent
    ).toBe("varOpportunity");
    expect(
      element.shadowRoot.querySelector(".selection__leaf").textContent
    ).toBe("Name");
  });

  it("permanently clears an existing value from the editable input", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.propertyName = "textValue";
    element.value = "{!varOpportunity.Name}";
    element.builderContext = {
      variables: [
        {
          name: "varOpportunity",
          dataType: "SObject",
          objectType: "Opportunity"
        }
      ]
    };
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    await flushPromises();

    element.shadowRoot.querySelector(".selection").click();
    await flushPromises();
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("input", { detail: { value: "" } }));

    // Flow's Done action can remove the custom editor before a deferred blur
    // completes, so clearing must persist as soon as the input becomes empty.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "textValue",
      newValue: null,
      newValueDataType: "reference"
    });
    expect(element.shadowRoot.querySelector("section.results")).not.toBeNull();

    pickerHeaderRoot(element)
      .querySelector('lightning-button-icon[title="Close resources"]')
      .click();
    await flushPromises();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(element.shadowRoot.querySelector(".selection")).toBeNull();
    expect(element.shadowRoot.querySelector("lightning-input").value).toBe("");
  });

  it("filters a nested record level using only text after its path", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.allowRecordFields = true;
    element.modeToggleLabel = "Custom value";
    element.builderContext = {
      variables: [
        { name: "CurrentContact", dataType: "SObject", objectType: "Contact" }
      ]
    };
    document.body.appendChild(element);
    const input = element.shadowRoot.querySelector("lightning-input");
    input.dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    expect(
      element.shadowRoot.querySelector("c-flow-config-picker-header")
        .modeToggleLabel
    ).toBe("Custom value");
    element.shadowRoot
      .querySelector('button[data-key="{!CurrentContact}"]')
      .click();
    getObjectInfo.emit({
      apiName: "Contact",
      fields: {
        Email: { apiName: "Email", label: "Email", dataType: "Email" },
        Name: { apiName: "Name", label: "Full Name", dataType: "String" }
      }
    });
    await flushPromises();
    expect(
      element.shadowRoot.querySelector("c-flow-config-picker-header")
        .modeToggleLabel
    ).toBeNull();

    input.dispatchEvent(
      new CustomEvent("input", {
        detail: { value: "{!CurrentContact.}Na" }
      })
    );
    await flushPromises();
    const labels = [
      ...element.shadowRoot.querySelectorAll("button.result .result__label")
    ].map((label) => label.textContent);

    expect(labels).toEqual(["Full Name"]);
    expect(element.shadowRoot.querySelector("button.manual")).toBeNull();

    element.shadowRoot
      .querySelector("c-flow-config-picker-header")
      .dispatchEvent(
        new CustomEvent("navigate", {
          bubbles: true,
          composed: true,
          detail: { depth: 0 }
        })
      );
    await flushPromises();
    expect(
      element.shadowRoot.querySelector("c-flow-config-picker-header")
        .modeToggleLabel
    ).toBe("Custom value");
  });

  it("browses from a screen into a custom component output", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.propertyName = "textValue";
    element.builderContext = {
      screens: [
        {
          name: "Screen_1",
          label: "Screen 1",
          fields: [
            {
              name: "CustomWidget",
              fieldType: "ComponentInstance",
              extensionName: "c:customWidget",
              outputParameters: [
                { name: "status", label: "Status", dataType: "String" }
              ]
            }
          ]
        }
      ]
    };
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    element.shadowRoot
      .querySelector('button[data-key="screen-Screen_1"]')
      .click();
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(
        'button[data-key="screen-component-Screen_1-CustomWidget"] svg.result__component-icon'
      )
    ).not.toBeNull();
    element.shadowRoot
      .querySelector(
        'button[data-key="screen-component-Screen_1-CustomWidget"]'
      )
      .click();
    await flushPromises();
    element.shadowRoot
      .querySelector(
        'button[data-key="automatic-output-CustomWidget.status-0"]'
      )
      .click();

    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "textValue",
      newValue: "{!CustomWidget.status}",
      newValueDataType: "reference"
    });
  });

  it("reconstructs a saved Screen field path and type icon", async () => {
    const builderContext = {
      screens: [
        {
          name: "Screen_1",
          label: "Screen 1",
          fields: [
            {
              name: "Text",
              label: "Text",
              fieldType: "InputField",
              dataType: "String"
            }
          ]
        }
      ]
    };
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.builderContext = builderContext;
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    element.shadowRoot
      .querySelector('button[data-key="screen-Screen_1"]')
      .click();
    await flushPromises();
    element.shadowRoot.querySelector("button.result").click();
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(".selection__parent").textContent
    ).toBe("Screen 1");

    document.body.removeChild(element);
    const reloaded = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    reloaded.builderContext = builderContext;
    reloaded.value = "{!Text}";
    document.body.appendChild(reloaded);
    await flushPromises();

    expect(
      reloaded.shadowRoot.querySelector(".selection__parent").textContent
    ).toBe("Screen 1");
    expect(
      reloaded.shadowRoot.querySelector(".selection__leaf").textContent
    ).toBe("Text");
    expect(
      reloaded.shadowRoot.querySelector("lightning-icon.selection__type")
        .iconName
    ).toBe("utility:text");
  });

  it("uses Flow's automatic output descriptors for scalar and record pickers", async () => {
    const builderContext = {
      screens: [
        {
          name: "Screen_1",
          fields: [
            {
              name: "Fetch_Contacts",
              label: "Fetch Contacts",
              fieldType: "ComponentInstance",
              extensionName: "managed:runtimeComponent"
            }
          ]
        }
      ]
    };
    const automaticOutputVariables = {
      Fetch_Contacts: [
        {
          apiName: "aggregateResult",
          label: "Aggregate Result",
          dataType: "number",
          maxOccurs: 1
        },
        {
          apiName: "errorMessage",
          label: "Error Message",
          dataType: "string",
          maxOccurs: 1
        },
        {
          apiName: "firstRecord",
          label: "First Record",
          dataType: "sobject",
          subtype: "Contact",
          maxOccurs: 1
        },
        {
          apiName: "records",
          label: "Records",
          dataType: "sobject",
          sobjectType: "Contact",
          maxOccurs: 2000
        }
      ]
    };

    const numberPicker = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    numberPicker.acceptedTypes = "Number";
    numberPicker.collection = "exclude";
    numberPicker.builderContext = builderContext;
    numberPicker.automaticOutputVariables = automaticOutputVariables;
    document.body.appendChild(numberPicker);
    numberPicker.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    numberPicker.shadowRoot
      .querySelector('button[data-key="screen-Screen_1"]')
      .click();
    await flushPromises();
    numberPicker.shadowRoot
      .querySelector(
        'button[data-key="screen-component-Screen_1-Fetch_Contacts"]'
      )
      .click();
    await flushPromises();
    expect(
      [...numberPicker.shadowRoot.querySelectorAll(".result__label")].map(
        (node) => node.textContent
      )
    ).toEqual(["Aggregate Result"]);

    document.body.removeChild(numberPicker);
    const collectionPicker = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    collectionPicker.acceptedTypes = "SObject";
    collectionPicker.collection = "only";
    collectionPicker.builderContext = builderContext;
    collectionPicker.automaticOutputVariables = automaticOutputVariables;
    document.body.appendChild(collectionPicker);
    collectionPicker.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    collectionPicker.shadowRoot
      .querySelector('button[data-key="screen-Screen_1"]')
      .click();
    await flushPromises();
    collectionPicker.shadowRoot
      .querySelector(
        'button[data-key="screen-component-Screen_1-Fetch_Contacts"]'
      )
      .click();
    await flushPromises();
    const collectionOption = collectionPicker.shadowRoot.querySelector(
      'button[data-key="automatic-output-Fetch_Contacts.records-3"]'
    );
    expect(collectionOption.textContent).toContain("Records");
    expect(collectionOption.textContent).toContain("SObject");
    expect(collectionOption.textContent).toContain("Contact");
  });

  it("finds an Integer component output from its complete Flow reference", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.acceptedTypes = "Number";
    element.collection = "exclude";
    element.builderContext = {
      screens: [
        {
          name: "Screen_1",
          label: "Screen 1",
          fields: [
            {
              name: "DataFetcher",
              fieldType: "ComponentInstance",
              extensionName: "managed:dataFetcher"
            }
          ]
        }
      ]
    };
    element.automaticOutputVariables = {
      DataFetcher: [
        {
          apiName: "aggQueryResult",
          label: "Aggregate Query Result",
          dataType: { name: "Object" },
          subtype: { name: "Integer" },
          maxOccurs: 1
        }
      ]
    };
    document.body.appendChild(element);
    const input = element.shadowRoot.querySelector("lightning-input");
    input.dispatchEvent(new CustomEvent("focus"));
    input.dispatchEvent(
      new CustomEvent("input", {
        detail: { value: "{!DataFetcher.aggQueryResult}" }
      })
    );
    await flushPromises();

    const result = element.shadowRoot.querySelector("button.result");
    expect(result.textContent).toContain("Aggregate Query Result");
    expect(result.textContent).toContain("Number");
  });

  it("resolves a generic custom component record output before loading fields", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.propertyName = "textValue";
    element.acceptedTypes = "String";
    element.collection = "exclude";
    element.allowRecordFields = true;
    element.builderContext = {
      screens: [
        {
          name: "Screen_1",
          fields: [
            {
              name: "DataFetcher",
              label: "Data Fetcher",
              fieldType: "ComponentInstance",
              extensionName: "managed:dataFetcher",
              dataTypeMappings: [{ typeName: "T", typeValue: "Contact" }]
            }
          ]
        }
      ]
    };
    element.automaticOutputVariables = {
      DataFetcher: [
        {
          apiName: "firstRetrievedRecord",
          label: "First Retrieved Record",
          dataType: "sobject",
          subtype: "{T}",
          maxOccurs: 1
        }
      ]
    };
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    element.shadowRoot
      .querySelector('button[data-key="screen-Screen_1"]')
      .click();
    await flushPromises();
    element.shadowRoot
      .querySelector('button[data-key="screen-component-Screen_1-DataFetcher"]')
      .click();
    await flushPromises();
    element.shadowRoot
      .querySelector(
        'button[data-key="automatic-output-DataFetcher.firstRetrievedRecord-0"]'
      )
      .click();
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".results__empty").textContent
    ).toBe("Loading Contact fields…");
    expect(getObjectInfo.getLastConfig()).toEqual({ objectApiName: "Contact" });
  });

  it("discovers arbitrary custom component outputs without a component registry", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.acceptedTypes = "String";
    element.automaticOutputVariables = {
      Fetch_Data: [{ apiName: "message", label: "Message", dataType: "string" }]
    };
    element.builderContext = {
      screens: [
        {
          name: "Screen_1",
          fields: [
            {
              name: "Fetch_Data",
              fieldType: "ComponentInstance",
              extensionName: "c:customFetcher"
            }
          ]
        }
      ]
    };
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    element.shadowRoot
      .querySelector('button[data-key="screen-Screen_1"]')
      .click();
    await flushPromises();
    element.shadowRoot
      .querySelector('button[data-key="screen-component-Screen_1-Fetch_Data"]')
      .click();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".result__label").textContent).toBe(
      "Message"
    );
  });

  it("keeps nested screen components collapsed but includes them in search", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.builderContext = {
      screens: [
        {
          name: "Screen_1",
          label: "Screen 1",
          fields: [
            {
              name: "Section",
              fieldType: "RegionContainer",
              fields: [
                {
                  name: "NestedWidget",
                  label: "Nested Widget",
                  fieldType: "ComponentInstance",
                  extensionName: "c:nestedWidget",
                  outputParameters: [{ name: "result", dataType: "String" }]
                }
              ]
            }
          ]
        }
      ]
    };
    document.body.appendChild(element);
    const input = element.shadowRoot.querySelector("lightning-input");
    input.dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    element.shadowRoot
      .querySelector('button[data-key="screen-Screen_1"]')
      .click();
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(
        'button[data-key="screen-component-Screen_1-NestedWidget"]'
      )
    ).toBeNull();
    element.shadowRoot
      .querySelector('button[data-key="screen-component-Screen_1-Section"]')
      .click();
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(
        'button[data-key="screen-component-Screen_1-NestedWidget"]'
      )
    ).not.toBeNull();

    pickerHeaderRoot(element)
      .querySelector('button.breadcrumb-link[data-depth="0"]')
      .click();
    input.dispatchEvent(
      new CustomEvent("change", { detail: { value: "widget" } })
    );
    await flushPromises();
    expect(element.shadowRoot.querySelector(".result__label").textContent).toBe(
      "Screen 1 > Section > Nested Widget"
    );
  });

  it("omits screen elements and components that expose no selectable outputs", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.builderContext = {
      screens: [
        {
          name: "Screen_1",
          fields: [
            {
              name: "DisplayText",
              label: "Display Text",
              fieldType: "DisplayText",
              dataType: "DisplayText"
            },
            {
              name: "NoOutputLwc",
              label: "No Output LWC",
              fieldType: "ComponentInstance",
              extensionName: "c:noOutputLwc",
              outputParameters: []
            },
            {
              name: "Text",
              label: "Text",
              fieldType: "InputField",
              dataType: "String"
            }
          ]
        }
      ]
    };
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    element.shadowRoot
      .querySelector('button[data-key="screen-Screen_1"]')
      .click();
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(
        'button[data-key="screen-field-Screen_1-DisplayText"]'
      )
    ).toBeNull();
    expect(
      element.shadowRoot.querySelector(
        'button[data-key="screen-component-Screen_1-NoOutputLwc"]'
      )
    ).toBeNull();
    expect(
      element.shadowRoot.querySelector(
        'button[data-key="screen-field-Screen_1-Text"]'
      )
    ).not.toBeNull();
  });

  it("refreshes a newly added component when outputs arrive on reused objects", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    const builderContext = {
      screens: [
        {
          name: "Screen_1",
          label: "Screen 1",
          fields: [
            {
              name: "DataFetcher",
              label: "DataFetcher",
              fieldType: "ComponentInstance",
              extensionName: "c:dataFetcher"
            }
          ]
        }
      ]
    };
    const automaticOutputs = {};
    element.builderContext = builderContext;
    element.automaticOutputVariables = automaticOutputs;
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    element.shadowRoot
      .querySelector('button[data-key="screen-Screen_1"]')
      .click();
    await flushPromises();

    const pendingComponent = element.shadowRoot.querySelector(
      'button[data-key="screen-component-Screen_1-DataFetcher"]'
    );
    expect(pendingComponent).not.toBeNull();
    pendingComponent.click();
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(".results__empty").textContent
    ).toBe("Loading DataFetcher fields…");

    automaticOutputs.DataFetcher = [
      { apiName: "result", label: "Result", dataType: "string" }
    ];
    element.automaticOutputVariables = automaticOutputs;
    element.builderContext = builderContext;
    await flushPromises();

    expect(element.shadowRoot.querySelector(".result__label").textContent).toBe(
      "Result"
    );
  });

  it("drills into a record resource and selects one of its fields", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.propertyName = "textValue";
    element.allowRecordFields = true;
    element.builderContext = {
      variables: [
        {
          name: "CurrentContact",
          dataType: "SObject",
          objectType: "Contact"
        }
      ]
    };
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(
        'button[data-key="{!CurrentContact}"] lightning-icon'
      ).iconName
    ).toBe("utility:record_alt");
    element.shadowRoot
      .querySelector('button[data-key="{!CurrentContact}"]')
      .click();
    getObjectInfo.emit({
      apiName: "Contact",
      fields: {
        Email: { apiName: "Email", label: "Email", dataType: "Email" },
        Score__c: {
          apiName: "Score__c",
          label: "Score",
          dataType: "Double"
        },
        AnnualRevenue__c: {
          apiName: "AnnualRevenue__c",
          label: "Annual Revenue",
          dataType: "Currency"
        }
      }
    });
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(
        'button[data-key="{!CurrentContact.Email}"] lightning-icon'
      ).iconName
    ).toBe("utility:text");
    expect(
      element.shadowRoot.querySelector(
        'button[data-key="{!CurrentContact.Score__c}"] lightning-icon'
      ).iconName
    ).toBe("utility:number_input");
    const currencyOption = element.shadowRoot.querySelector(
      'button[data-key="{!CurrentContact.AnnualRevenue__c}"]'
    );
    expect(currencyOption.querySelector("lightning-icon").iconName).toBe(
      "utility:currency"
    );
    expect(currencyOption.querySelector(".result__meta").textContent).toBe(
      "AnnualRevenue__c · Currency"
    );
    element.shadowRoot
      .querySelector('button[data-key="{!CurrentContact.Email}"]')
      .click();

    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "textValue",
      newValue: "{!CurrentContact.Email}",
      newValueDataType: "reference"
    });
  });

  it("browses through multiple record relationships", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.propertyName = "textValue";
    element.allowRecordFields = true;
    element.builderContext = {
      variables: [
        {
          name: "CurrentContact",
          dataType: "SObject",
          objectType: "Contact"
        }
      ]
    };
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    element.shadowRoot
      .querySelector('button[data-key="{!CurrentContact}"]')
      .click();
    getObjectInfo.emit({
      apiName: "Contact",
      fields: {
        AccountId: {
          apiName: "AccountId",
          label: "Account ID",
          dataType: "Reference",
          relationshipName: "Account",
          referenceToInfos: [{ apiName: "Account", label: "Account" }]
        }
      }
    });
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(
        'button[data-key^="relationship-"] lightning-icon'
      ).iconName
    ).toBe("utility:record_lookup");
    element.shadowRoot
      .querySelector('button[data-key^="relationship-"]')
      .click();

    getObjectInfo.emit({
      apiName: "Account",
      fields: {
        OwnerId: {
          apiName: "OwnerId",
          label: "Owner ID",
          dataType: "Reference",
          relationshipName: "Owner",
          referenceToInfos: [{ apiName: "User", label: "User" }]
        }
      }
    });
    await flushPromises();
    element.shadowRoot
      .querySelector('button[data-key^="relationship-"]')
      .click();

    getObjectInfo.emit({
      apiName: "User",
      fields: {
        Name: { apiName: "Name", label: "Full Name", dataType: "String" }
      }
    });
    await flushPromises();
    element.shadowRoot.querySelector("button.result").click();

    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "textValue",
      newValue: "{!CurrentContact.Account.Owner.Name}",
      newValueDataType: "reference"
    });
  });

  it("finishes an internal row click before evaluating input blur", async () => {
    jest.useFakeTimers();
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.allowRecordFields = true;
    element.builderContext = {
      variables: [
        { name: "CurrentContact", dataType: "SObject", objectType: "Contact" }
      ]
    };
    document.body.appendChild(element);
    const outsideButton = document.createElement("button");
    document.body.appendChild(outsideButton);
    const input = element.shadowRoot.querySelector("lightning-input");
    const picker = element.shadowRoot.querySelector(".picker");
    input.dispatchEvent(new CustomEvent("focus"));
    jest.runOnlyPendingTimers();
    jest.runOnlyPendingTimers();
    await flushPromises();

    const row = element.shadowRoot.querySelector(
      'button[data-key="{!CurrentContact}"]'
    );
    outsideButton.focus();
    picker.dispatchEvent(
      new FocusEvent("focusout", {
        bubbles: true,
        composed: true,
        relatedTarget: outsideButton
      })
    );
    row.click();
    await flushPromises();
    jest.runOnlyPendingTimers();
    expect(element.shadowRoot.querySelector("section.results")).not.toBeNull();
    expect(
      pickerHeaderRoot(element).querySelector(".header").textContent
    ).toContain("CurrentContact");

    pickerHeaderRoot(element)
      .querySelector('lightning-button-icon[title="Close resources"]')
      .click();
    await flushPromises();
    expect(element.shadowRoot.querySelector("section.results")).toBeNull();
    expect(input.value).toBe("{!CurrentContact.}");

    input.dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    expect(
      pickerHeaderRoot(element).querySelector(".breadcrumb-current").textContent
    ).toBe("CurrentContact");
    jest.useRealTimers();
  });

  it("uses clickable breadcrumbs to return to an earlier level", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.allowRecordFields = true;
    element.builderContext = {
      variables: [
        { name: "CurrentContact", dataType: "SObject", objectType: "Contact" }
      ]
    };
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    element.shadowRoot
      .querySelector('button[data-key="{!CurrentContact}"]')
      .click();
    await flushPromises();

    const rootLink = pickerHeaderRoot(element).querySelector(
      'button.breadcrumb-link[data-depth="0"]'
    );
    expect(rootLink.textContent).toContain("All Resources");
    rootLink.click();
    await flushPromises();

    expect(
      pickerHeaderRoot(element).querySelector(".breadcrumb-current").textContent
    ).toBe("All Resources");
    expect(
      [...element.shadowRoot.querySelectorAll(".resource-group__title")].map(
        (heading) => heading.textContent
      )
    ).toContain("Record Variables");
  });

  it("browses dynamic subflow and Apex-defined output hierarchies", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.acceptedTypes = "Number";
    element.collection = "exclude";
    element.builderContext = {
      variables: [
        {
          name: "apexPayload",
          label: "Apex Payload",
          dataType: "Apex",
          apexClass: "Payload"
        }
      ],
      subflows: [{ name: "Call_Subflow", label: "Call Subflow" }]
    };
    element.automaticOutputVariables = {
      apexPayload: [
        { apiName: "total", label: "Total", dataType: "number" },
        { apiName: "detail", label: "Detail", dataType: "string" }
      ],
      Call_Subflow: [
        { apiName: "count", label: "Count", dataType: "number" },
        {
          apiName: "records",
          label: "Records",
          dataType: "sobject",
          sobjectType: "Account",
          maxOccurs: "unbounded"
        }
      ]
    };
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    const categories = [
      ...element.shadowRoot.querySelectorAll(".resource-group__title")
    ].map((node) => node.textContent);
    expect(categories).toEqual(
      expect.arrayContaining(["Apex-Defined Variables", "Subflows"])
    );
    element.shadowRoot
      .querySelector('button[data-key="automatic-container-apexPayload"]')
      .click();
    await flushPromises();
    expect(element.shadowRoot.querySelector(".result__label").textContent).toBe(
      "Total"
    );

    document.body.removeChild(element);
    const collectionPicker = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    collectionPicker.acceptedTypes = "SObject,Apex";
    collectionPicker.collection = "only";
    collectionPicker.builderContext = {
      subflows: [{ name: "Call_Subflow", label: "Call Subflow" }]
    };
    collectionPicker.automaticOutputVariables =
      element.automaticOutputVariables;
    document.body.appendChild(collectionPicker);
    collectionPicker.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    collectionPicker.shadowRoot
      .querySelector('button[data-key="automatic-container-Call_Subflow"]')
      .click();
    await flushPromises();
    expect(
      collectionPicker.shadowRoot.querySelector(".result__label").textContent
    ).toBe("Records");
  });

  it("renders stages as String-compatible Stage resources", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.acceptedTypes = "String";
    element.builderContext = {
      stages: [
        { name: "Stage1", label: "Stage1", stageOrder: 1 },
        { name: "Stage2", label: "Stage2", stageOrder: 2 }
      ]
    };
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".resource-group__title").textContent
    ).toBe("Stages");
    const stageRow = element.shadowRoot.querySelector(
      'button[data-key="{!Stage1}"]'
    );
    expect(stageRow.querySelector("lightning-icon").iconName).toBe(
      "utility:stage"
    );
    expect(stageRow.querySelector(".result__meta").textContent).toBe(
      "Stage · {!Stage1}"
    );
  });

  it("uses the Salesforce text-template icon instead of a generic String icon", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.acceptedTypes = "String";
    element.builderContext = {
      textTemplates: [{ name: "TextTemplate", label: "TextTemplate" }]
    };
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    const templateRow = element.shadowRoot.querySelector(
      'button[data-key="{!TextTemplate}"]'
    );
    expect(templateRow.querySelector("lightning-icon").iconName).toBe(
      "utility:text_template"
    );
  });

  it("uses Salesforce Flow icons for record and specialized variable types", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.allowRecordFields = true;
    element.builderContext = {
      variables: [
        { name: "varRecord", dataType: "SObject", objectType: "Contact" },
        { name: "varCurrency", dataType: "Currency" },
        { name: "varMulti", dataType: "Multipicklist" },
        { name: "varPicklist", dataType: "Picklist" },
        { name: "varTime", dataType: "Time" }
      ]
    };
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    const iconFor = (reference) =>
      element.shadowRoot.querySelector(
        `button[data-key="${reference}"] lightning-icon`
      ).iconName;
    expect(iconFor("{!varRecord}")).toBe("utility:record_alt");
    expect(iconFor("{!varCurrency}")).toBe("utility:currency");
    expect(iconFor("{!varMulti}")).toBe("utility:multi_picklist");
    expect(iconFor("{!varPicklist}")).toBe("utility:picklist_type");
    expect(iconFor("{!varTime}")).toBe("utility:clock");
    expect(iconFor("global-org")).toBe("utility:company");
  });

  it("enriches automatic subflow outputs from the current Flow metadata", async () => {
    window.history.replaceState(
      {},
      "",
      "/builder_platform_interaction/flowBuilder.app?flowId=301000000000000AAA"
    );
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.acceptedTypes = "String";
    element.automaticOutputVariables = {
      Tool_Schedule_Payments_Calculator: [
        { apiName: "message", dataType: "string", label: "Message" }
      ]
    };
    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();

    const frame = element.shadowRoot.querySelector("iframe.apex-bridge");
    frame.contentWindow.postMessage = jest.fn();
    const bridgeOrigin = "https://example--c.vf.force.com";
    window.dispatchEvent(
      new MessageEvent("message", {
        source: frame.contentWindow,
        origin: bridgeOrigin,
        data: { channel: "flow-config-apex-type", action: "ready" }
      })
    );
    await flushPromises();

    const [request] = frame.contentWindow.postMessage.mock.calls[0];
    expect(request).toMatchObject({
      action: "describeFlowElements",
      flowId: "301000000000000AAA"
    });
    window.dispatchEvent(
      new MessageEvent("message", {
        source: frame.contentWindow,
        origin: bridgeOrigin,
        data: {
          channel: "flow-config-apex-type",
          action: "result",
          requestId: request.requestId,
          success: true,
          elements: [
            {
              name: "Tool_Schedule_Payments_Calculator",
              label: "Tool - Schedule Payments Calculator",
              kind: "Subflow",
              iconName: "utility:flow"
            }
          ]
        }
      })
    );
    await flushPromises();
    await flushPromises();

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    expect(
      element.shadowRoot.querySelector(".resource-group__title").textContent
    ).toBe("Subflows");
    const row = element.shadowRoot.querySelector("button.result");
    expect(row.querySelector(".result__label").textContent).toBe(
      "Outputs from Tool - Schedule Payments Calculator"
    );
    expect(row.querySelector(".result__meta").textContent).toBe("Outputs");
    expect(row.querySelector("lightning-icon").iconName).toBe("utility:flow");
  });

  it("keeps the friendly parent path and leaf visible before and after reload", async () => {
    const builderContext = {
      actionCalls: [
        {
          name: "Tool_Schedule_Payments_Calculator",
          label: "Schedule Payments Calculator"
        }
      ]
    };
    const automaticOutputVariables = {
      Tool_Schedule_Payments_Calculator: [
        {
          apiName: "AmountPerPayment",
          label: "AmountPerPayment",
          dataType: "String"
        }
      ]
    };
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.acceptedTypes = "String";
    element.builderContext = builderContext;
    element.automaticOutputVariables = automaticOutputVariables;
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    element.shadowRoot
      .querySelector(
        'button[data-key="automatic-container-Tool_Schedule_Payments_Calculator"]'
      )
      .click();
    await flushPromises();
    element.shadowRoot.querySelector("button.result").click();
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".selection__parent").textContent
    ).toBe("Schedule Payments Calculator");
    expect(
      element.shadowRoot.querySelector(".selection__leaf").textContent
    ).toBe("AmountPerPayment");

    document.body.removeChild(element);
    const reloaded = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    reloaded.acceptedTypes = "String";
    reloaded.builderContext = builderContext;
    reloaded.automaticOutputVariables = automaticOutputVariables;
    reloaded.value = "{!Tool_Schedule_Payments_Calculator.AmountPerPayment}";
    document.body.appendChild(reloaded);
    await flushPromises();

    expect(
      reloaded.shadowRoot.querySelector(".selection__parent").textContent
    ).toBe("Schedule Payments Calculator");
    expect(
      reloaded.shadowRoot.querySelector(".selection__leaf").textContent
    ).toBe("AmountPerPayment");
  });

  it("describes Apex-defined variables and nested Apex members on demand", async () => {
    describeApexType
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            name: "title",
            label: "Title",
            dataType: "String",
            isCollection: false
          },
          {
            name: "detail",
            label: "Detail",
            dataType: "Apex",
            apexClass: "sample__PaymentDetail",
            isCollection: false
          }
        ])
      )
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            name: "amount",
            label: "Amount",
            dataType: "Number",
            isCollection: false
          }
        ])
      );
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.acceptedTypes = "String,Number";
    element.collection = "exclude";
    element.allowRecordFields = true;
    element.builderContext = {
      variables: [
        {
          name: "ApexDefined",
          dataType: "Apex",
          apexClass: "sample__PaymentTemplate",
          isCollection: false
        }
      ]
    };
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    element.shadowRoot
      .querySelector('button[data-key="{!ApexDefined}"]')
      .click();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    expect(describeApexType).toHaveBeenNthCalledWith(1, {
      apexClassName: "sample__PaymentTemplate"
    });
    expect(
      [...element.shadowRoot.querySelectorAll(".result__label")].map(
        (node) => node.textContent
      )
    ).toEqual(["Title", "Detail"]);

    element.shadowRoot
      .querySelector('button[data-key="automatic-output-ApexDefined.detail-1"]')
      .click();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    expect(describeApexType).toHaveBeenNthCalledWith(2, {
      apexClassName: "sample__PaymentDetail"
    });
    expect(element.shadowRoot.querySelector(".result__label").textContent).toBe(
      "Amount"
    );
    element.shadowRoot.querySelector("button.result").click();
    await flushPromises();
    expect(
      element.shadowRoot.querySelector("lightning-icon.selection__type")
        .iconName
    ).toBe("utility:number_input");
  });

  it("hydrates a saved Apex field pill with the leaf label and type icon", async () => {
    describeApexType.mockResolvedValueOnce(
      JSON.stringify([
        {
          name: "amount",
          label: "Amount",
          dataType: "Number",
          isCollection: false
        }
      ])
    );
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.builderContext = {
      variables: [
        {
          name: "ApexDefined",
          label: "ApexDefined",
          dataType: "Apex",
          apexClass: "paytram__PaytramPaymentTemplate"
        }
      ]
    };
    element.value = "{!ApexDefined.amount}";
    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".selection__leaf").textContent
    ).toBe("Amount");
    expect(
      element.shadowRoot.querySelector("lightning-icon.selection__type")
        .iconName
    ).toBe("utility:number_input");
  });

  it("rehydrates a saved deep record field with its labels and type icon", async () => {
    describeSObjectPath.mockResolvedValueOnce(
      JSON.stringify({
        name: "AccountSource",
        label: "Account Source",
        labels: ["Account", "Account Source"],
        objectTypes: ["Account", null],
        parentObjectType: "Account",
        dataType: "Picklist",
        sourceDataType: "Picklist",
        isCollection: false
      })
    );
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.allowRecordFields = true;
    element.builderContext = {
      variables: [
        {
          name: "varOpportunity",
          label: "Opportunity",
          dataType: "SObject",
          objectType: "Opportunity"
        }
      ]
    };
    element.value = "{!varOpportunity.Account.AccountSource}";
    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(describeSObjectPath).toHaveBeenCalledWith({
      objectApiName: "Opportunity",
      fieldPath: "Account.AccountSource"
    });
    expect(
      element.shadowRoot.querySelector("lightning-icon.selection__type")
        .iconName
    ).toBe("utility:picklist_type");
    expect(
      element.shadowRoot.querySelector(".selection__parent").textContent
    ).toBe("Opportunity > Account");
    expect(
      element.shadowRoot.querySelector(".selection__leaf").textContent
    ).toBe("Account Source");

    element.shadowRoot.querySelector(".selection").click();
    getObjectInfo.emit({
      apiName: "Account",
      fields: {
        Name: { apiName: "Name", label: "Account Name", dataType: "String" },
        AccountSource: {
          apiName: "AccountSource",
          label: "Account Source",
          dataType: "Picklist"
        }
      }
    });
    await flushPromises();
    const input = element.shadowRoot.querySelector("lightning-input");
    input.dispatchEvent(
      new CustomEvent("input", {
        detail: { value: "{!varOpportunity.Account.Na}" }
      })
    );
    await flushPromises();

    expect(
      pickerHeaderRoot(element).querySelector(".breadcrumb-current").textContent
    ).toBe("Account");
    expect(element.shadowRoot.querySelector(".result__label").textContent).toBe(
      "Account Name"
    );

    input.dispatchEvent(new CustomEvent("input", { detail: { value: "var" } }));
    await flushPromises();
    expect(
      pickerHeaderRoot(element).querySelector(".breadcrumb-current").textContent
    ).toBe("All Resources");
    expect(
      element.shadowRoot.querySelector('button[data-key="{!varOpportunity}"]')
    ).not.toBeNull();
  });

  it("discards a stale record hydration response after the value changes", async () => {
    let resolveOldRequest;
    describeSObjectPath
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOldRequest = resolve;
          })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          name: "Name",
          label: "Contact Name",
          labels: ["Contact Name"],
          objectTypes: [null],
          dataType: "String",
          sourceDataType: "String"
        })
      );
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.allowRecordFields = true;
    element.builderContext = {
      variables: [
        {
          name: "varOpportunity",
          label: "Opportunity",
          dataType: "SObject",
          objectType: "Opportunity"
        },
        {
          name: "varContact",
          label: "Contact",
          dataType: "SObject",
          objectType: "Contact"
        }
      ]
    };
    element.value = "{!varOpportunity.Account.Name}";
    document.body.appendChild(element);
    await flushPromises();

    element.value = "{!varContact.Name}";
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    resolveOldRequest(
      JSON.stringify({
        name: "Name",
        label: "Old Account Name",
        labels: ["Account", "Old Account Name"],
        objectTypes: ["Account", null],
        dataType: "String",
        sourceDataType: "String"
      })
    );
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(
      element.shadowRoot.querySelector(".selection__leaf").textContent
    ).toBe("Contact Name");
  });

  it("falls back to the Visualforce bridge when managed Apex source is hidden", async () => {
    describeApexType.mockResolvedValueOnce("[]");
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    element.acceptedTypes = "String,Number";
    element.collection = "exclude";
    element.allowRecordFields = true;
    element.builderContext = {
      variables: [
        {
          name: "ApexDefined",
          dataType: "Apex",
          apexClass: "paytram__PaytramPaymentTemplate",
          isCollection: false
        }
      ]
    };
    document.body.appendChild(element);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    element.shadowRoot
      .querySelector('button[data-key="{!ApexDefined}"]')
      .click();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const frame = element.shadowRoot.querySelector("iframe.apex-bridge");
    expect(frame).not.toBeNull();
    frame.contentWindow.postMessage = jest.fn();
    window.dispatchEvent(
      new MessageEvent("message", {
        source: frame.contentWindow,
        origin: "https://example--c.vf.force.com",
        data: { channel: "flow-config-apex-type", action: "ready" }
      })
    );
    await flushPromises();

    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(1);
    const [request, targetOrigin] =
      frame.contentWindow.postMessage.mock.calls[0];
    expect(targetOrigin).toBe("https://example--c.vf.force.com");
    expect(request).toMatchObject({
      channel: "flow-config-apex-type",
      action: "describeApexType",
      apexClassName: "paytram__PaytramPaymentTemplate"
    });

    window.dispatchEvent(
      new MessageEvent("message", {
        source: frame.contentWindow,
        origin: targetOrigin,
        data: {
          channel: "flow-config-apex-type",
          action: "result",
          requestId: request.requestId,
          success: true,
          members: [
            {
              name: "amount",
              label: "Amount",
              dataType: "Number",
              isCollection: false
            }
          ]
        }
      })
    );
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(element.shadowRoot.querySelector(".result__label").textContent).toBe(
      "Amount"
    );
  });

  it("uses the roomier side and expands upward from a stable bottom edge", async () => {
    const element = createElement("c-flow-config-resource-picker", {
      is: FlowConfigResourcePicker
    });
    document.body.appendChild(element);
    const input = element.shadowRoot.querySelector("lightning-input");
    input.getBoundingClientRect = () => ({
      left: 100,
      right: 500,
      top: 400,
      bottom: 440,
      width: 400,
      height: 40
    });
    input.dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    const header = element.shadowRoot.querySelector(".results__header");
    const scrollArea = element.shadowRoot.querySelector(".results__scroll");
    const actions = element.shadowRoot.querySelector(".results__actions");
    let resourceContentHeight = 120;
    Object.defineProperty(header, "scrollHeight", {
      configurable: true,
      get: () => 36
    });
    Object.defineProperty(scrollArea, "scrollHeight", {
      configurable: true,
      get: () => resourceContentHeight
    });
    Object.defineProperty(actions, "scrollHeight", {
      configurable: true,
      get: () => 0
    });

    window.dispatchEvent(new CustomEvent("resize"));
    await flushPromises();
    let style = element.shadowRoot
      .querySelector(".results")
      .getAttribute("style");
    const compactTop = Number(style.match(/top:([\d.-]+)px/)[1]);
    const compactHeight = Number(style.match(/height:([\d.-]+)px/)[1]);

    resourceContentHeight = 700;
    window.dispatchEvent(new CustomEvent("resize"));
    await flushPromises();
    style = element.shadowRoot.querySelector(".results").getAttribute("style");
    const expandedTop = Number(style.match(/top:([\d.-]+)px/)[1]);
    const expandedHeight = Number(style.match(/height:([\d.-]+)px/)[1]);

    expect(compactHeight).toBe(220);
    expect(expandedHeight).toBe(380);
    expect(expandedTop).toBeLessThan(compactTop);
    expect(expandedTop + expandedHeight).toBe(compactTop + compactHeight);
    expect(expandedTop + expandedHeight).toBeLessThanOrEqual(396);
  });
});
