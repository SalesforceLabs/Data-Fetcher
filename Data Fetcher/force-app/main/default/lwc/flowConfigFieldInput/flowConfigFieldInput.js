import { LightningElement, api } from "lwc";

/**
 * Lets an editor choose an SObject field or deliberately switch to the
 * standard literal/resource input while preserving one Flow String property.
 * The consuming editor owns persistence of customMode when that choice must
 * survive a Flow Builder reopen.
 */
export default class FlowConfigFieldInput extends LightningElement {
  @api label = "Field";
  @api propertyName;
  @api objectApiName;
  @api value;
  @api valueDataType;
  @api multiple = false;
  @api acceptedTypes = "";
  @api maxResults = 100;
  @api maxRelationshipDepth = 5;
  @api required = false;
  @api placeholder;
  @api fieldLevelHelp;
  @api builderContext;
  @api automaticOutputVariables = {};
  @api apiVersion;
  @api allowCustom = false;

  _customMode = false;
  _sortable = true;
  customValidityMessage = "";

  @api
  get sortable() {
    return this._sortable;
  }
  set sortable(value) {
    this._sortable = value !== false && value !== "false";
  }

  @api
  get customMode() {
    return this._customMode;
  }
  set customMode(value) {
    this._customMode = value === true || value === "true";
  }

  get modeToggleLabel() {
    return this.allowCustom ? "Custom value" : null;
  }

  handleModeToggle(event) {
    event.stopPropagation();
    this._customMode = Boolean(event.detail?.checked);
    this.customValidityMessage = "";
    this.dispatchEvent(
      new CustomEvent("modechange", {
        detail: { customMode: this._customMode }
      })
    );
    Promise.resolve().then(() => this.activeInput()?.openPicker());
  }

  handleFieldChange(event) {
    this.dispatchValueChange(event.detail);
  }

  handleCustomValueChange(event) {
    this.dispatchValueChange(event.detail);
  }

  dispatchValueChange(detail) {
    this.dispatchEvent(
      new CustomEvent("valuechange", {
        detail: {
          ...detail,
          customMode: this._customMode
        }
      })
    );
  }

  activeInput() {
    return this.template.querySelector(
      this._customMode
        ? "c-flow-config-value-input"
        : "c-flow-config-field-picker"
    );
  }

  @api
  setCustomValidity(message) {
    this.customValidityMessage = message || "";
    this.activeInput()?.setCustomValidity(this.customValidityMessage);
  }

  @api
  get validationMessage() {
    return this.activeInput()?.validationMessage || this.customValidityMessage;
  }

  @api
  reportValidity() {
    const input = this.activeInput();
    input?.setCustomValidity(this.customValidityMessage);
    return input?.reportValidity() ?? !this.customValidityMessage;
  }
}
