import { LightningElement, api } from "lwc";
import {
  createGenericTypeMappingChangedEvent,
  createInputValueChangedEvent,
  createInputValueDeletedEvent,
  getInputValue,
  getInputVariable
} from "c/flowConfigEditorUtils";
import { planCollectionChange } from "c/flowConfigGenericTypeCoordinator";
import {
  normalizeSchema,
  objectTypeFor,
  requiredErrors,
  sourceDescriptor
} from "c/flowConfigEditorSchema";
import schemaTemplate from "./flowConfigEditorBase.html";

/**
 * Base class for Flow Builder custom property editors.
 *
 * Flow Builder hands every custom property editor the same four inputs and
 * expects the same events and `validate()` contract back. Rewriting that
 * plumbing per editor is the bulk of a consuming component, so this class owns
 * it and leaves the editor with only its own business rules.
 *
 * Extend it, read saved configuration with `input()` / `genericType()`, and
 * write it back with `setInput()` / `clearInput()` / `setGenericType()`.
 *
 * ```js
 * import FlowConfigEditorBase from "c/flowConfigEditorBase";
 *
 * export default class MyEditor extends FlowConfigEditorBase {
 *   get label() {
 *     return this.input("label");
 *   }
 *
 *   handleLabelChange(event) {
 *     this.setInput("label", event.detail.newValue, event.detail.newValueDataType);
 *   }
 * }
 * ```
 *
 * Subclasses may override `configurationChanged()` and `validateConfiguration()`.
 * Everything else is intended to be called, not replaced.
 */
export default class FlowConfigEditorBase extends LightningElement {
  /**
   * Optional declarative schema. When a subclass sets it, the base renders the
   * described controls and keeps their values, generic type mappings, and
   * required-value errors in step without any further code. Leave it unset to
   * drive everything through the methods below and your own template.
   */
  static flowProperties = null;

  @api elementInfo;

  _builderContext = {};
  _inputVariables = [];
  _genericTypeMappings = [];
  _automaticOutputVariables = {};
  _errors = new Map();
  _validationErrors = [];
  _schema = null;
  schemaValues = {};
  schemaDataTypes = {};
  schemaObjectTypes = {};

  /* ------------------------------------------------------------------ *
   * Flow Builder contract
   * ------------------------------------------------------------------ */

  @api
  get builderContext() {
    return this._builderContext;
  }
  set builderContext(value) {
    const context = value || {};
    // Flow Builder reuses its own arrays between republishes. Cloning the ones
    // pickers iterate keeps a later republish from mutating rendered state.
    this._builderContext = {
      ...context,
      screens: [...(context.screens || [])]
    };
    this.configurationChanged("builderContext");
  }

  @api
  get inputVariables() {
    return this._inputVariables;
  }
  set inputVariables(value) {
    this._inputVariables = value || [];
    this.configurationChanged("inputVariables");
  }

  @api
  get genericTypeMappings() {
    return this._genericTypeMappings;
  }
  set genericTypeMappings(value) {
    this._genericTypeMappings = value || [];
    this.configurationChanged("genericTypeMappings");
  }

  @api
  get automaticOutputVariables() {
    return this._automaticOutputVariables;
  }
  set automaticOutputVariables(value) {
    if (!value || typeof value === "string" || Array.isArray(value)) {
      this._automaticOutputVariables = value || {};
    } else {
      this._automaticOutputVariables = Object.fromEntries(
        Object.entries(value).map(([key, outputs]) => [
          key,
          Array.isArray(outputs) ? [...outputs] : outputs
        ])
      );
    }
    this.configurationChanged("automaticOutputVariables");
  }

  /**
   * Called after Flow Builder republishes any of the four inputs above. The
   * argument names which one. Override to derive local state; the default
   * implementation refreshes declarative schema values and does nothing else.
   */
  configurationChanged(source) {
    if (
      this.hasSchema &&
      (source === "inputVariables" || source === "genericTypeMappings")
    ) {
      this.refreshSchemaValues();
    }
  }

  /* ------------------------------------------------------------------ *
   * Declarative schema
   * ------------------------------------------------------------------ */

  get schema() {
    if (this._schema === null) {
      this._schema = normalizeSchema(this.constructor.flowProperties);
    }
    return this._schema;
  }

  get hasSchema() {
    return this.schema.length > 0;
  }

  /**
   * A schema-driven editor needs no template of its own. Anything else keeps
   * whatever template its own bundle provides.
   */
  render() {
    return this.hasSchema ? schemaTemplate : super.render();
  }

  refreshSchemaValues() {
    const values = {};
    const dataTypes = {};
    const objectTypes = {};
    const readers = {
      input: (name) => this.input(name),
      genericType: (typeName) => this.genericType(typeName)
    };

    this.schema.forEach((descriptor) => {
      values[descriptor.name] = this.input(
        descriptor.name,
        null,
        descriptor.isResource
      );
      dataTypes[descriptor.name] = this.inputDataType(
        descriptor.name,
        descriptor.isResource ? "reference" : descriptor.type
      );
      if (descriptor.customModeProperty) {
        const explicitMode = this.inputVariable(descriptor.customModeProperty);
        values[descriptor.customModeProperty] = explicitMode
          ? Boolean(this.input(descriptor.customModeProperty, false))
          : dataTypes[descriptor.name] === "reference";
      }
      if (descriptor.isResource) {
        objectTypes[descriptor.name] = objectTypeFor(descriptor, readers);
      }
    });

    // A field picker takes its object type from the resource it depends on.
    this.schema
      .filter((descriptor) => descriptor.isField)
      .forEach((descriptor) => {
        const source = sourceDescriptor(descriptor, this.schema);
        objectTypes[descriptor.name] = source
          ? objectTypes[source.name] || null
          : null;
      });

    this.schemaValues = values;
    this.schemaDataTypes = dataTypes;
    this.schemaObjectTypes = objectTypes;
  }

  /**
   * Applies one change from the schema-driven form. A resource selection also
   * moves its generic type mapping, mirrored object name, and any dependent
   * field, which is the part editors most often get wrong by hand.
   */
  handleConfigChange(event) {
    const { name, newValue, newValueDataType, resource } = event.detail;
    const descriptor = this.schema.find((entry) => entry.name === name);
    if (!descriptor) {
      const modeDescriptor = this.schema.find(
        (entry) => entry.customModeProperty === name
      );
      if (modeDescriptor) {
        this.schemaValues = { ...this.schemaValues, [name]: Boolean(newValue) };
        this.setInput(name, Boolean(newValue), "Boolean");
      }
      return;
    }
    this.clearError(name);

    if (!descriptor.isResource) {
      this.schemaValues = { ...this.schemaValues, [name]: newValue };
      this.schemaDataTypes = {
        ...this.schemaDataTypes,
        [name]: newValueDataType
      };
      return;
    }

    const dependents = this.schema.filter(
      (entry) => entry.dependsOn === descriptor.name
    );
    const transition = this.applyCollectionChange({
      objectProperty: descriptor.objectProperty,
      dependentProperty: dependents[0]?.name || null,
      typeName: descriptor.genericType,
      newValue,
      objectType: resource?.objectType || null,
      currentObjectType: this.schemaObjectTypes[descriptor.name] || null,
      dependentValue: this.schemaValues[dependents[0]?.name] || null
    });

    const values = { ...this.schemaValues, [name]: newValue };
    const objectTypes = { ...this.schemaObjectTypes };
    if (transition.changed) {
      objectTypes[descriptor.name] = transition.nextObjectType;
      dependents.forEach((dependent) => {
        values[dependent.name] = null;
        objectTypes[dependent.name] = transition.nextObjectType;
        // The first dependent was cleared by applyCollectionChange; the rest
        // still need their own deletion event.
        if (dependent.name !== dependents[0].name) {
          this.clearInput(dependent.name);
        }
      });
    }
    this.schemaValues = values;
    this.schemaObjectTypes = objectTypes;
  }

  /* ------------------------------------------------------------------ *
   * Reading saved configuration
   * ------------------------------------------------------------------ */

  /** Saved value for a Flow input property. */
  input(name, fallback = null, asReference = false) {
    return getInputValue(this._inputVariables, name, fallback, asReference);
  }

  /** Saved value for a property that stores a `{!Resource}` reference. */
  reference(name, fallback = null) {
    return getInputValue(this._inputVariables, name, fallback, true);
  }

  /** Raw input variable, for callers that need `valueDataType` as well. */
  inputVariable(name) {
    return getInputVariable(this._inputVariables, name);
  }

  /** `valueDataType` marker Flow Builder saved alongside the value. */
  inputDataType(name, fallback = null) {
    return this.inputVariable(name)?.valueDataType || fallback;
  }

  /** Object API name currently bound to a generic SObject type mapping. */
  genericType(typeName, fallback = null) {
    return (
      this._genericTypeMappings.find(
        (mapping) => mapping?.typeName === typeName
      )?.typeValue || fallback
    );
  }

  /**
   * Flow runtime API version, resolved from the places Flow Builder has used
   * across releases. Pass this to pickers so versioned globals stay correct.
   */
  get apiVersion() {
    return (
      this._builderContext.flowRuntimeApiVersion ||
      this._builderContext.apiVersion ||
      this._builderContext.flowApiVersion ||
      this.elementInfo?.flowRuntimeApiVersion ||
      this.elementInfo?.apiVersion ||
      null
    );
  }

  /* ------------------------------------------------------------------ *
   * Writing configuration back to Flow Builder
   * ------------------------------------------------------------------ */

  /** Assigns a Flow input property. */
  setInput(name, newValue, newValueDataType = "String") {
    this.dispatchEvent(
      createInputValueChangedEvent(name, newValue, newValueDataType)
    );
  }

  /** Removes a Flow input assignment. */
  clearInput(name, newValueDataType = "String") {
    this.dispatchEvent(createInputValueDeletedEvent(name, newValueDataType));
  }

  /** Assigns or clears a generic SObject type mapping. */
  setGenericType(typeName, typeValue) {
    this.dispatchEvent(
      createGenericTypeMappingChangedEvent(typeName, typeValue)
    );
  }

  /**
   * Applies a record-collection selection and everything that must move with
   * it: the generic type mapping, the mirrored object API name, and any
   * dependent field selection that the new object type invalidates.
   *
   * Returns the planned transition so the caller can react — for example to
   * tell the user a field selection was reset.
   */
  applyCollectionChange({
    objectProperty,
    dependentProperty,
    typeName,
    newValue,
    objectType,
    currentObjectType,
    dependentValue,
    fallbackObjectType = null
  }) {
    const transition = planCollectionChange({
      newValue,
      objectType,
      currentObjectType,
      dependentValue,
      fallbackObjectType
    });
    if (!transition.changed) {
      return transition;
    }
    if (typeName) {
      this.setGenericType(typeName, transition.nextObjectType);
    }
    if (objectProperty) {
      if (transition.nextObjectType) {
        this.setInput(objectProperty, transition.nextObjectType, "String");
      } else {
        this.clearInput(objectProperty);
      }
    }
    if (dependentProperty) {
      this.clearInput(dependentProperty);
    }
    return transition;
  }

  /* ------------------------------------------------------------------ *
   * Validation
   * ------------------------------------------------------------------ */

  /** Records an editor-owned error against a property key. */
  setError(key, errorString) {
    if (errorString) {
      this._errors.set(key, errorString);
    } else {
      this._errors.delete(key);
    }
  }

  /** Drops one editor-owned error. */
  clearError(key) {
    this._errors.delete(key);
  }

  /** Drops every editor-owned error and the last validation result. */
  clearErrors() {
    this._errors.clear();
    this._validationErrors = [];
  }

  /**
   * Hook for business rules. Return `[{ key, errorString }]`. The default
   * implementation reports nothing, leaving only the pickers' own validity.
   */
  validateConfiguration() {
    return [];
  }

  /**
   * Flow Builder's validation entry point.
   *
   * Combines errors declared through `setError()`, errors returned by
   * `validateConfiguration()`, and the validity of every rendered input marked
   * `data-validatable` with a `data-property` key, then mirrors each message
   * onto its input so the panel shows it inline as well as in the summary.
   */
  @api
  validate() {
    const errors = [];
    const errorsByKey = new Map();
    const record = (key, errorString) => {
      if (!key || !errorString || errorsByKey.has(key)) {
        return;
      }
      errorsByKey.set(key, errorString);
      errors.push({ key, errorString });
    };

    this._errors.forEach((errorString, key) => record(key, errorString));
    if (this.hasSchema) {
      requiredErrors(this.schema, this.schemaValues).forEach((error) =>
        record(error.key, error.errorString)
      );
    }
    (this.validateConfiguration() || []).forEach((error) =>
      record(error?.key, error?.errorString)
    );

    this.template
      .querySelectorAll("[data-validatable]")
      .forEach((component) => {
        const key = component.dataset.property;
        component.setCustomValidity?.(errorsByKey.get(key) || "");
        component.reportValidity?.();
        if (component.validationMessage && !errorsByKey.has(key)) {
          record(key, component.validationMessage);
        }
      });

    // Schema-driven controls live inside the form's shadow root, so the form
    // mirrors and reports them on this editor's behalf.
    this.template
      .querySelector("c-flow-config-editor-form")
      ?.collectValidity(errorsByKey)
      ?.forEach((error) => record(error.key, error.errorString));

    this._validationErrors = errors;
    return errors;
  }

  /** Errors produced by the most recent `validate()` call. */
  get validationErrors() {
    return this._validationErrors;
  }

  get hasValidationErrors() {
    return this._validationErrors.length > 0;
  }
}
