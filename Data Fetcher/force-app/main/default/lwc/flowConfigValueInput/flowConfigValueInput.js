import { LightningElement, api } from "lwc";
import { compatibleResourceTypesForInput } from "c/flowConfigResourceModel";

export default class FlowConfigValueInput extends LightningElement {
  @api label = "Value";
  @api propertyName;
  @api builderContext;
  @api valueType = "String";
  @api required = false;
  @api fieldLevelHelp;
  @api placeholder = "Enter value or search resources...";
  @api value;
  @api valueDataType;
  @api automaticOutputVariables = {};
  @api apiVersion;
  @api modeToggleLabel;
  @api modeToggleChecked = false;
  customValidityMessage = "";

  get acceptedTypes() {
    return compatibleResourceTypesForInput(this.valueType);
  }

  handleValueChange(event) {
    this.dispatchEvent(
      new CustomEvent("valuechange", {
        detail: event.detail
      })
    );
  }

  @api
  setCustomValidity(message) {
    this.customValidityMessage = message || "";
    this.template
      .querySelector("c-flow-config-resource-picker")
      ?.setCustomValidity(this.customValidityMessage);
  }

  @api
  get validationMessage() {
    return (
      this.template.querySelector("c-flow-config-resource-picker")
        ?.validationMessage || this.customValidityMessage
    );
  }

  @api
  reportValidity() {
    const picker = this.template.querySelector("c-flow-config-resource-picker");
    picker?.setCustomValidity(this.customValidityMessage);
    return picker?.reportValidity() ?? !this.customValidityMessage;
  }

  @api
  openPicker() {
    this.template.querySelector("c-flow-config-resource-picker")?.openPicker();
  }
}
