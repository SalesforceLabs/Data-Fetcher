import { createElement } from "lwc";
import FlowConfigValueInput from "c/flowConfigValueInput";
import { installImmediateAnimationFrames } from "../../../../../../test-utils/pickerTestUtils";

describe("c-flow-config-value-input", () => {
  beforeEach(() => {
    installImmediateAnimationFrames();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("commits typed input as a numeric literal", async () => {
    const element = createElement("c-flow-config-value-input", {
      is: FlowConfigValueInput
    });
    element.propertyName = "numberValue";
    element.valueType = "Number";
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    await Promise.resolve();

    const picker = element.shadowRoot.querySelector(
      "c-flow-config-resource-picker"
    );
    const input = picker.shadowRoot.querySelector("lightning-input");
    input.dispatchEvent(new CustomEvent("focus"));
    input.dispatchEvent(
      new CustomEvent("change", { detail: { value: "42.5" } })
    );
    await Promise.resolve();
    picker.shadowRoot.querySelector("button.manual").click();

    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "numberValue",
      newValue: 42.5,
      newValueDataType: "Number"
    });
  });

  it("rejects a partially numeric or nonnumeric literal with guidance", async () => {
    const element = createElement("c-flow-config-value-input", {
      is: FlowConfigValueInput
    });
    element.label = "Page Size";
    element.propertyName = "pageSize";
    element.valueType = "Number";
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    await Promise.resolve();

    const picker = element.shadowRoot.querySelector(
      "c-flow-config-resource-picker"
    );
    const input = picker.shadowRoot.querySelector("lightning-input");
    input.dispatchEvent(new CustomEvent("focus"));
    input.dispatchEvent(
      new CustomEvent("change", { detail: { value: "42 records" } })
    );
    await Promise.resolve();
    picker.shadowRoot.querySelector("button.manual").click();

    expect(handler).not.toHaveBeenCalled();
    expect(picker.validationMessage).toBe(
      "Page Size requires a numeric value. Enter a number or select a Number resource."
    );
    expect(element.reportValidity()).toBe(false);
  });

  it("accepts Flow-compatible scalar resources for a Text input", async () => {
    const element = createElement("c-flow-config-value-input", {
      is: FlowConfigValueInput
    });
    element.propertyName = "textValue";
    element.valueType = "String";
    element.builderContext = {
      variables: [{ name: "Amount", dataType: "Number" }],
      choices: [{ name: "YesChoice", dataType: "Boolean" }],
      textTemplates: [{ name: "WelcomeMessage" }]
    };
    document.body.appendChild(element);
    await Promise.resolve();

    const picker = element.shadowRoot.querySelector(
      "c-flow-config-resource-picker"
    );
    expect(picker.acceptedTypes).toBe(
      "String,Number,Boolean,Date,DateTime,Time"
    );
    picker.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await Promise.resolve();
    const references = [...picker.shadowRoot.querySelectorAll("button.result")]
      .map((button) => button.dataset.key)
      .filter(Boolean);

    expect(references).toEqual(
      expect.arrayContaining([
        "{!Amount}",
        "{!YesChoice}",
        "{!WelcomeMessage}",
        "global-flow",
        "global-user"
      ])
    );

    const headings = [
      ...picker.shadowRoot.querySelectorAll(".resource-group__title")
    ].map((heading) => heading.textContent);
    expect(headings).toEqual(
      expect.arrayContaining([
        "Choices",
        "Simple Variables",
        "Text Templates",
        "Global Variables"
      ])
    );
  });

  it("accepts a restored Number resource for a Text input", async () => {
    const element = createElement("c-flow-config-value-input", {
      is: FlowConfigValueInput
    });
    element.label = "Text Input";
    element.propertyName = "textValue";
    element.valueType = "String";
    element.value = "{!Amount}";
    element.valueDataType = "reference";
    element.builderContext = {
      variables: [{ name: "Amount", label: "Amount", dataType: "Number" }]
    };
    document.body.appendChild(element);
    await Promise.resolve();
    await Promise.resolve();

    expect(element.reportValidity()).toBe(true);
    expect(element.validationMessage).toBe("");
  });
});
