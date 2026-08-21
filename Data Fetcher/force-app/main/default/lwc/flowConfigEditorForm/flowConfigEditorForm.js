import { LightningElement, api } from "lwc";

/**
 * Renders the controls described by a declarative editor schema.
 *
 * It owns no configuration state. Values arrive from the editor, changes leave
 * as one normalized `configchange` event, and validity is driven by the
 * editor's `validate()` through `collectValidity()`.
 */
export default class FlowConfigEditorForm extends LightningElement {
  @api schema = [];
  @api values = {};
  @api valueDataTypes = {};
  @api objectTypes = {};
  @api builderContext;
  @api automaticOutputVariables = {};
  @api apiVersion;

  get controls() {
    return (this.schema || []).map((descriptor) => ({
      ...descriptor,
      value: this.values?.[descriptor.name] ?? null,
      dataType: this.valueDataTypes?.[descriptor.name] || null,
      objectApiName: this.objectTypes?.[descriptor.name] || null,
      customMode: descriptor.customModeProperty
        ? Boolean(this.values?.[descriptor.customModeProperty])
        : false,
      collectionMode: descriptor.collection ? "only" : "any"
    }));
  }

  handleResourceChange(event) {
    this.emit(event, { resource: event.detail?.resource || null });
  }

  handleValueChange(event) {
    this.emit(event);
  }

  handleFieldChange(event) {
    this.emit(event, {
      selectedValues: event.detail?.selectedValues || null
    });
  }

  handleFieldInputChange(event) {
    this.emit(event, {
      selectedValues: event.detail?.selectedValues || null,
      customMode: Boolean(event.detail?.customMode)
    });
  }

  handleFieldModeChange(event) {
    const descriptor = (this.schema || []).find(
      (entry) => entry.name === event.currentTarget?.dataset?.property
    );
    if (!descriptor?.customModeProperty) {
      return;
    }
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("configchange", {
        detail: {
          name: descriptor.customModeProperty,
          newValue: Boolean(event.detail?.customMode),
          newValueDataType: "Boolean",
          modeFor: descriptor.name
        }
      })
    );
  }

  emit(event, extra = {}) {
    const name = event.currentTarget?.dataset?.property || event.detail?.name;
    if (!name) {
      return;
    }
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("configchange", {
        detail: {
          name,
          newValue: event.detail?.newValue ?? null,
          newValueDataType: event.detail?.newValueDataType || "String",
          ...extra
        }
      })
    );
  }

  /**
   * Mirrors the editor's errors onto each control and reports back anything a
   * control considers invalid on its own. Called by `validate()` on the editor,
   * which owns the resulting list.
   */
  @api
  collectValidity(errorsByKey) {
    const discovered = [];
    this.template
      .querySelectorAll("[data-validatable]")
      .forEach((component) => {
        const key = component.dataset.property;
        component.setCustomValidity?.(errorsByKey?.get(key) || "");
        component.reportValidity?.();
        if (component.validationMessage && !errorsByKey?.has(key)) {
          discovered.push({ key, errorString: component.validationMessage });
        }
      });
    return discovered;
  }
}
