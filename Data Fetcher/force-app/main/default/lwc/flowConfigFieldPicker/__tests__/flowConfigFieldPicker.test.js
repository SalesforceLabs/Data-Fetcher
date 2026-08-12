import { createElement } from "lwc";
import { getObjectInfo } from "lightning/uiObjectInfoApi";
import describeSObjectPath from "@salesforce/apex/FlowConfigApexTypeController.describeSObjectPath";
import FlowConfigFieldPicker from "c/flowConfigFieldPicker";
import { clearRecordPathCache } from "c/flowConfigSchemaService";
import { installImmediateAnimationFrames } from "../../../../../../test-utils/pickerTestUtils";

jest.mock(
  "@salesforce/apex/FlowConfigApexTypeController.describeSObjectPath",
  () => ({ __esModule: true, default: jest.fn() }),
  { virtual: true }
);

const ACCOUNT_OBJECT_INFO = {
  apiName: "Account",
  fields: {
    Id: { apiName: "Id", label: "Account ID", dataType: "Id" },
    Name: { apiName: "Name", label: "Account Name", dataType: "String" },
    AnnualRevenue: {
      apiName: "AnnualRevenue",
      label: "Annual Revenue",
      dataType: "Currency"
    },
    BillingAddress: {
      apiName: "BillingAddress",
      label: "Billing Address",
      dataType: "Address"
    }
  }
};

const OPPORTUNITY_OBJECT_INFO = {
  apiName: "Opportunity",
  fields: {
    Name: { apiName: "Name", label: "Opportunity Name", dataType: "String" },
    AccountId: {
      apiName: "AccountId",
      label: "Account ID",
      dataType: "Reference",
      relationshipName: "Account",
      referenceToInfos: [{ apiName: "Account", label: "Account" }]
    }
  }
};

const RELATED_ACCOUNT_OBJECT_INFO = {
  apiName: "Account",
  fields: {
    Name: { apiName: "Name", label: "Account Name", dataType: "String" },
    OwnerId: {
      apiName: "OwnerId",
      label: "Owner ID",
      dataType: "Reference",
      relationshipName: "Owner",
      referenceToInfos: [{ apiName: "User", label: "User" }]
    }
  }
};

const USER_OBJECT_INFO = {
  apiName: "User",
  fields: {
    Name: { apiName: "Name", label: "Full Name", dataType: "String" }
  }
};

describe("c-flow-config-field-picker", () => {
  beforeEach(() => {
    installImmediateAnimationFrames();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    clearRecordPathCache();
    jest.useRealTimers();
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("treats Currency, Double, and Percent fields as Flow Numbers", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Account";
    element.acceptedTypes = "Number";
    document.body.appendChild(element);
    getObjectInfo.emit({
      apiName: "Account",
      fields: {
        Amount__c: {
          apiName: "Amount__c",
          label: "Amount",
          dataType: "Currency"
        },
        Ratio__c: {
          apiName: "Ratio__c",
          label: "Ratio",
          dataType: "Percent"
        },
        Name: { apiName: "Name", label: "Name", dataType: "String" }
      }
    });
    await Promise.resolve();

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await Promise.resolve();

    expect(
      [...element.shadowRoot.querySelectorAll("button.result")].map(
        (button) => button.dataset.apiName
      )
    ).toEqual(["Amount__c", "Ratio__c"]);
  });

  it("flags a restored field that is incompatible with accepted types", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.label = "Amount Field";
    element.objectApiName = "Account";
    element.acceptedTypes = "Number";
    element.value = "Name";
    document.body.appendChild(element);
    getObjectInfo.emit(ACCOUNT_OBJECT_INFO);
    await Promise.resolve();

    expect(element.validationMessage).toBe(
      "“Account Name (Name)” has type Text. Amount Field requires Number. Select a Number field."
    );
    expect(element.reportValidity()).toBe(false);
    expect(element.shadowRoot.querySelector(".picker__error").textContent).toBe(
      element.validationMessage
    );
  });

  it("shows each target for a polymorphic relationship", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Task";
    document.body.appendChild(element);
    getObjectInfo.emit({
      apiName: "Task",
      fields: {
        WhoId: {
          apiName: "WhoId",
          label: "Name ID",
          dataType: "Reference",
          relationshipName: "Who",
          referenceToInfos: [
            { apiName: "Contact", label: "Contact" },
            { apiName: "Lead", label: "Lead" }
          ]
        }
      }
    });
    await Promise.resolve();
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await Promise.resolve();

    expect(
      [...element.shadowRoot.querySelectorAll('[data-path="Who"]')].map(
        (button) => button.textContent.replace(/\s+/g, " ").trim()
      )
    ).toEqual([
      expect.stringContaining("Who (Contact)"),
      expect.stringContaining("Who (Lead)")
    ]);
  });

  it("rehydrates a saved nested field descriptor after reopening", async () => {
    describeSObjectPath.mockResolvedValueOnce(
      JSON.stringify({
        name: "AnnualRevenue",
        label: "Annual Revenue",
        labels: ["Account", "Annual Revenue"],
        dataType: "Currency",
        sourceDataType: "Currency"
      })
    );
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Opportunity";
    element.value = "Account.AnnualRevenue";
    document.body.appendChild(element);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(describeSObjectPath).toHaveBeenCalledWith({
      objectApiName: "Opportunity",
      fieldPath: "Account.AnnualRevenue"
    });
    expect(
      element.shadowRoot.querySelector(".selection__summary").textContent
    ).toBe("Annual Revenue");
    expect(element.shadowRoot.querySelector(".selection__icon").iconName).toBe(
      "utility:currency"
    );
  });

  it("searches object fields and dispatches the Flow Builder contract", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Account";
    element.propertyName = "titleFieldApiName";
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    getObjectInfo.emit(ACCOUNT_OBJECT_INFO);
    await Promise.resolve();

    const input = element.shadowRoot.querySelector("lightning-input");
    input.dispatchEvent(new CustomEvent("focus"));
    input.dispatchEvent(
      new CustomEvent("change", { detail: { value: "revenue" } })
    );
    await Promise.resolve();

    const results = element.shadowRoot.querySelectorAll("button.result");
    expect(results).toHaveLength(1);
    results[0].click();
    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "titleFieldApiName",
      newValue: "AnnualRevenue",
      newValueDataType: "String"
    });
    await Promise.resolve();
    expect(element.shadowRoot.querySelector(".selection__icon").iconName).toBe(
      "utility:currency"
    );
    expect(
      element.shadowRoot.querySelector(".selection__meta").textContent
    ).toBe("AnnualRevenue");
  });

  it("uses the shared Flow icon for compound address fields", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Account";
    document.body.appendChild(element);
    getObjectInfo.emit(ACCOUNT_OBJECT_INFO);
    await Promise.resolve();

    const input = element.shadowRoot.querySelector("lightning-input");
    input.dispatchEvent(new CustomEvent("focus"));
    input.dispatchEvent(
      new CustomEvent("change", { detail: { value: "billing address" } })
    );
    await Promise.resolve();

    expect(
      element.shadowRoot.querySelector("button.result lightning-icon").iconName
    ).toBe("utility:text");
  });

  it("supports multiple fields with JSON persistence", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Account";
    element.propertyName = "displayFieldsJson";
    element.multiple = true;
    element.value = '["Name"]';
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    getObjectInfo.emit(ACCOUNT_OBJECT_INFO);
    await Promise.resolve();

    element.shadowRoot.querySelector(".selection").click();
    await Promise.resolve();
    const revenue = [
      ...element.shadowRoot.querySelectorAll("button.result")
    ].find((button) => button.dataset.apiName === "AnnualRevenue");
    revenue.click();

    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "displayFieldsJson",
      newValue: '["Name","AnnualRevenue"]',
      newValueDataType: "String"
    });
  });

  it("supports unordered multiple selection without reorder controls", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Account";
    element.propertyName = "displayFieldsJson";
    element.multiple = true;
    element.sortable = false;
    element.value = '["Name","AnnualRevenue"]';
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    getObjectInfo.emit(ACCOUNT_OBJECT_INFO);
    await Promise.resolve();

    element.shadowRoot.querySelector(".selection").click();
    await Promise.resolve();

    const selectedFields = element.shadowRoot.querySelector(".selected-fields");
    expect(selectedFields).not.toBeNull();
    expect(selectedFields.querySelectorAll(".selected-field")).toHaveLength(2);
    expect(selectedFields.querySelector(".drag-handle")).toBeNull();
    expect(selectedFields.querySelector('[title="Move field up"]')).toBeNull();
    expect(
      selectedFields.querySelector('[title="Move field down"]')
    ).toBeNull();
    expect(
      selectedFields.querySelectorAll('[title="Remove field"]')
    ).toHaveLength(2);
    expect(
      [...element.shadowRoot.querySelectorAll("button.result")].filter(
        (button) => button.getAttribute("aria-selected") === "true"
      )
    ).toHaveLength(2);

    selectedFields.querySelector('[title="Remove field"]').click();
    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "displayFieldsJson",
      newValue: '["AnnualRevenue"]',
      newValueDataType: "String"
    });
  });

  it("clears every selected field from the heading icon and stays open", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Account";
    element.propertyName = "displayFieldsJson";
    element.multiple = true;
    element.value = '["Name","AnnualRevenue"]';
    const configurationHandler = jest.fn();
    const fieldHandler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      configurationHandler
    );
    element.addEventListener("fieldchange", fieldHandler);
    document.body.appendChild(element);
    getObjectInfo.emit(ACCOUNT_OBJECT_INFO);
    await Promise.resolve();

    element.shadowRoot.querySelector(".selection").click();
    await Promise.resolve();
    expect(element.shadowRoot.querySelector("lightning-button")).toBeNull();
    element.shadowRoot.querySelector(".selected-fields__clear").click();
    await Promise.resolve();

    expect(configurationHandler.mock.calls[0][0].detail).toEqual({
      name: "displayFieldsJson",
      newValue: null,
      newValueDataType: "String"
    });
    expect(fieldHandler.mock.calls[0][0].detail.selectedValues).toEqual([]);
    expect(element.shadowRoot.querySelector(".selected-fields")).toBeNull();
    expect(element.shadowRoot.querySelector(".results")).not.toBeNull();
    expect(element.shadowRoot.querySelector("button.remove")).toBeNull();
  });

  it("reorders selected fields with compact arrow buttons", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Account";
    element.propertyName = "displayFieldsJson";
    element.multiple = true;
    element.value = '["Name","AnnualRevenue","Id"]';
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    getObjectInfo.emit(ACCOUNT_OBJECT_INFO);
    await Promise.resolve();

    element.shadowRoot.querySelector(".selection").click();
    await Promise.resolve();
    const firstRow = element.shadowRoot.querySelector(".selected-field");
    firstRow.querySelector('[title="Move field down"]').click();

    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "displayFieldsJson",
      newValue: '["AnnualRevenue","Name","Id"]',
      newValueDataType: "String"
    });
  });

  it("reorders selected fields by dragging a handle onto another row", async () => {
    jest.useFakeTimers();
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Account";
    element.propertyName = "displayFieldsJson";
    element.multiple = true;
    element.value = '["Name","AnnualRevenue"]';
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    getObjectInfo.emit(ACCOUNT_OBJECT_INFO);
    await Promise.resolve();

    element.shadowRoot.querySelector(".selection").click();
    await Promise.resolve();
    const rows = element.shadowRoot.querySelectorAll(".selected-field");
    const transfer = {
      value: "",
      setData(_type, value) {
        this.value = value;
      },
      getData() {
        return this.value;
      }
    };
    const dragStart = new CustomEvent("dragstart", { bubbles: true });
    Object.defineProperty(dragStart, "dataTransfer", { value: transfer });
    rows[0].querySelector(".drag-handle").dispatchEvent(dragStart);
    const dragOver = new CustomEvent("dragover", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(dragOver, "dataTransfer", { value: transfer });
    rows[1].dispatchEvent(dragOver);
    const drop = new CustomEvent("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: transfer });
    rows[1].dispatchEvent(drop);

    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "displayFieldsJson",
      newValue: '["AnnualRevenue","Name"]',
      newValueDataType: "String"
    });
    element.shadowRoot
      .querySelector(".picker")
      .dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: null })
      );
    jest.advanceTimersByTime(700);
    await Promise.resolve();
    expect(element.shadowRoot.querySelector(".results")).not.toBeNull();
  });

  it("keeps the popup open when its ordering header is clicked", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Account";
    element.multiple = true;
    element.value = '["Name","AnnualRevenue"]';
    document.body.appendChild(element);
    getObjectInfo.emit(ACCOUNT_OBJECT_INFO);
    await Promise.resolve();

    element.shadowRoot.querySelector(".selection").click();
    await Promise.resolve();
    const heading = element.shadowRoot.querySelector(
      ".selected-fields__heading"
    );
    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true
    });
    heading.dispatchEvent(mouseDown);
    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: null })
      );
    heading.click();
    await Promise.resolve();

    expect(mouseDown.defaultPrevented).toBe(true);
    expect(element.shadowRoot.querySelector(".results")).not.toBeNull();
  });

  it("keeps the popup open through the selected-pill focus transition", async () => {
    jest.useFakeTimers();
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Account";
    element.multiple = true;
    element.value = '["Name","AnnualRevenue"]';
    document.body.appendChild(element);
    getObjectInfo.emit(ACCOUNT_OBJECT_INFO);
    await Promise.resolve();

    const selection = element.shadowRoot.querySelector(".selection");
    selection.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );
    selection.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: null })
    );
    selection.click();
    await Promise.resolve();
    element.shadowRoot
      .querySelector(".picker")
      .dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: null })
      );
    jest.advanceTimersByTime(1200);
    await Promise.resolve();

    expect(element.shadowRoot.querySelector(".results")).not.toBeNull();
    jest.useRealTimers();
  });

  it("shows collection guidance instead of a stale field before type resolution", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.value = "Name";
    document.body.appendChild(element);
    await Promise.resolve();

    expect(element.shadowRoot.querySelector(".selection")).toBeNull();
    const input = element.shadowRoot.querySelector("lightning-input");
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toBe("Select a record collection first");
  });

  it("selects a field through multiple relationship levels", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Opportunity";
    element.propertyName = "titleFieldApiName";
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    getObjectInfo.emit(OPPORTUNITY_OBJECT_INFO);
    await Promise.resolve();

    element.shadowRoot
      .querySelector("lightning-input")
      .dispatchEvent(new CustomEvent("focus"));
    await Promise.resolve();
    element.shadowRoot.querySelector('[data-path="Account"]').click();
    await Promise.resolve();
    getObjectInfo.emit(RELATED_ACCOUNT_OBJECT_INFO);
    await Promise.resolve();
    element.shadowRoot.querySelector('[data-path="Account.Owner"]').click();
    await Promise.resolve();
    getObjectInfo.emit(USER_OBJECT_INFO);
    await Promise.resolve();
    element.shadowRoot
      .querySelector('[data-api-name="Account.Owner.Name"]')
      .click();

    expect(handler.mock.calls[0][0].detail).toEqual({
      name: "titleFieldApiName",
      newValue: "Account.Owner.Name",
      newValueDataType: "String"
    });
  });

  it("shows the mode switch only at the field root", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Opportunity";
    element.modeToggleLabel = "Custom value";
    document.body.appendChild(element);
    getObjectInfo.emit(OPPORTUNITY_OBJECT_INFO);
    await Promise.resolve();

    element.openPicker();
    await Promise.resolve();
    let header = element.shadowRoot.querySelector(
      "c-flow-config-picker-header"
    );
    expect(header.modeToggleLabel).toBe("Custom value");

    element.shadowRoot.querySelector('[data-path="Account"]').click();
    await Promise.resolve();
    header = element.shadowRoot.querySelector("c-flow-config-picker-header");
    expect(header.modeToggleLabel).toBeNull();

    header.dispatchEvent(
      new CustomEvent("navigate", {
        bubbles: true,
        composed: true,
        detail: { depth: 0 }
      })
    );
    await Promise.resolve();
    expect(
      element.shadowRoot.querySelector("c-flow-config-picker-header")
        .modeToggleLabel
    ).toBe("Custom value");
  });

  it("keeps nested field paths ordered in multiple mode", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Opportunity";
    element.propertyName = "displayFieldsJson";
    element.multiple = true;
    element.value = '["Name"]';
    const handler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      handler
    );
    document.body.appendChild(element);
    getObjectInfo.emit(OPPORTUNITY_OBJECT_INFO);
    await Promise.resolve();

    element.shadowRoot.querySelector(".selection").click();
    await Promise.resolve();
    element.shadowRoot.querySelector('[data-path="Account"]').click();
    await Promise.resolve();
    getObjectInfo.emit(RELATED_ACCOUNT_OBJECT_INFO);
    await Promise.resolve();
    element.shadowRoot.querySelector('[data-api-name="Account.Name"]').click();

    expect(handler.mock.calls[0][0].detail.newValue).toBe(
      '["Name","Account.Name"]'
    );
  });

  it("renders above the input as a fixed overlay when more room is above", async () => {
    const element = createElement("c-flow-config-field-picker", {
      is: FlowConfigFieldPicker
    });
    element.objectApiName = "Account";
    document.body.appendChild(element);
    getObjectInfo.emit(ACCOUNT_OBJECT_INFO);
    await Promise.resolve();
    const input = element.shadowRoot.querySelector("lightning-input");
    input.getBoundingClientRect = () => ({
      left: 100,
      right: 500,
      top: 600,
      bottom: 640,
      width: 400,
      height: 40
    });

    input.dispatchEvent(new CustomEvent("focus"));
    await Promise.resolve();
    await Promise.resolve();
    const results = element.shadowRoot.querySelector(".results");

    expect(results.style.position).toBe("fixed");
    expect(Number.parseFloat(results.style.top)).toBeLessThan(600);
    expect(element.style.zIndex).toBe("1000000");
  });
});
