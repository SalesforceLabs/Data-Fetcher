import { createElement } from "lwc";
import FlowConfigFieldInput from "c/flowConfigFieldInput";

describe("c-flow-config-field-input", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("switches from the picker header and opens the standard resource picker", async () => {
    const element = createElement("c-flow-config-field-input", {
      is: FlowConfigFieldInput
    });
    element.allowCustom = true;
    element.objectApiName = "Account";
    const modeChange = jest.fn();
    element.addEventListener("modechange", modeChange);
    document.body.appendChild(element);

    expect(
      element.shadowRoot.querySelector("c-flow-config-field-picker")
    ).not.toBeNull();
    element.shadowRoot
      .querySelector("c-flow-config-field-picker")
      .dispatchEvent(
        new CustomEvent("modetoggle", {
          bubbles: true,
          composed: true,
          detail: { checked: true }
        })
      );
    await Promise.resolve();
    await Promise.resolve();

    const valueInput = element.shadowRoot.querySelector(
      "c-flow-config-value-input"
    );
    expect(valueInput).not.toBeNull();
    const resourcePicker = valueInput.shadowRoot.querySelector(
      "c-flow-config-resource-picker"
    );
    expect(resourcePicker.shadowRoot.querySelector(".results")).not.toBeNull();
    const resourceHeader = resourcePicker.shadowRoot.querySelector(
      "c-flow-config-picker-header"
    );
    expect(resourceHeader.modeToggleLabel).toBe("Custom value");
    expect(resourceHeader.modeToggleChecked).toBe(true);
    expect(modeChange.mock.calls[0][0].detail).toEqual({ customMode: true });

    resourceHeader.shadowRoot.querySelector('[role="switch"]').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(
      element.shadowRoot
        .querySelector("c-flow-config-field-picker")
        .shadowRoot.querySelector(".results")
    ).not.toBeNull();
    expect(modeChange.mock.calls[1][0].detail).toEqual({ customMode: false });
  });

  it("forwards a normalized value change with the active mode", () => {
    const element = createElement("c-flow-config-field-input", {
      is: FlowConfigFieldInput
    });
    element.customMode = true;
    const valueChange = jest.fn();
    element.addEventListener("valuechange", valueChange);
    document.body.appendChild(element);

    element.shadowRoot.querySelector("c-flow-config-value-input").dispatchEvent(
      new CustomEvent("valuechange", {
        detail: {
          name: "sortBy",
          newValue: "{!sortField}",
          newValueDataType: "reference"
        }
      })
    );

    expect(valueChange.mock.calls[0][0].detail).toEqual({
      name: "sortBy",
      newValue: "{!sortField}",
      newValueDataType: "reference",
      customMode: true
    });
  });
});
