import FlowConfigEditorBase from "c/flowConfigEditorBase";

const DEFAULT_VALUES = {
  objectName1: "Account",
  objectName2: "Account",
  queryString: null,
  searchString: null,
  aggQueryString: null,
  debounceTime: "300",
  useWireService: false,
  listViewApiName: null,
  fields: null,
  fieldsIsCustom: false,
  pageSize: 50,
  sortBy: null,
  sortByIsCustom: false,
  pageToken: null
};

const VALUE_PROPERTIES = [
  "queryString",
  "searchString",
  "aggQueryString",
  "debounceTime",
  "listViewApiName",
  "fields",
  "pageSize",
  "sortBy",
  "pageToken"
];

export default class DataFetcherCPE extends FlowConfigEditorBase {
  objectName1 = DEFAULT_VALUES.objectName1;
  objectName2 = DEFAULT_VALUES.objectName2;
  queryString = DEFAULT_VALUES.queryString;
  searchString = DEFAULT_VALUES.searchString;
  aggQueryString = DEFAULT_VALUES.aggQueryString;
  debounceTime = DEFAULT_VALUES.debounceTime;
  useWireService = DEFAULT_VALUES.useWireService;
  listViewApiName = DEFAULT_VALUES.listViewApiName;
  fields = DEFAULT_VALUES.fields;
  fieldsIsCustom = DEFAULT_VALUES.fieldsIsCustom;
  pageSize = DEFAULT_VALUES.pageSize;
  sortBy = DEFAULT_VALUES.sortBy;
  sortByIsCustom = DEFAULT_VALUES.sortByIsCustom;
  pageToken = DEFAULT_VALUES.pageToken;
  valueDataTypes = {};
  showSOSL = true;
  mappingRepairScheduled = false;
  repairedMappingsKey = "";
  additionalFieldsSortable = false;

  configurationChanged(source) {
    super.configurationChanged(source);
    if (source === "inputVariables") {
      this.hydrateInputs();
    } else if (source === "genericTypeMappings") {
      this.adoptGenericMappings();
    }
    if (source === "inputVariables" || source === "genericTypeMappings") {
      this.scheduleGenericMappingRepair();
    }
  }

  hydrateInputs() {
    this.objectName1 = this.input(
      "objectName1",
      this.genericType("T", DEFAULT_VALUES.objectName1)
    );
    this.objectName2 = this.input(
      "objectName2",
      this.genericType("S", DEFAULT_VALUES.objectName2)
    );
    this.useWireService = Boolean(
      this.input("useWireService", DEFAULT_VALUES.useWireService)
    );

    const dataTypes = {};
    VALUE_PROPERTIES.forEach((propertyName) => {
      this[propertyName] = this.input(
        propertyName,
        DEFAULT_VALUES[propertyName],
        this.inputDataType(propertyName) === "reference"
      );
      dataTypes[propertyName] = this.inputDataType(
        propertyName,
        propertyName === "pageSize" ? "Number" : "String"
      );
    });
    this.valueDataTypes = dataTypes;
    this.fieldsIsCustom = this.resolveCustomMode("fields");
    this.sortByIsCustom = this.resolveCustomMode(
      "sortBy",
      this.isLegacyCustomSortBy
    );
  }

  adoptGenericMappings() {
    this.objectName1 = this.inputVariable("objectName1")
      ? this.input("objectName1", DEFAULT_VALUES.objectName1)
      : this.genericType("T", this.objectName1 || DEFAULT_VALUES.objectName1);
    this.objectName2 = this.inputVariable("objectName2")
      ? this.input("objectName2", DEFAULT_VALUES.objectName2)
      : this.genericType("S", this.objectName2 || DEFAULT_VALUES.objectName2);
  }

  scheduleGenericMappingRepair() {
    if (this.mappingRepairScheduled) {
      return;
    }
    this.mappingRepairScheduled = true;
    Promise.resolve().then(() => {
      this.mappingRepairScheduled = false;
      this.repairGenericMappings();
    });
  }

  repairGenericMappings() {
    const primaryType =
      this.objectName1 || this.genericType("T", DEFAULT_VALUES.objectName1);
    const secondaryType =
      this.objectName2 || this.genericType("S", DEFAULT_VALUES.objectName2);
    const repairKey = `${primaryType}:${secondaryType}`;
    if (repairKey === this.repairedMappingsKey) {
      return;
    }
    this.repairedMappingsKey = repairKey;
    if (this.genericType("T") !== primaryType) {
      this.setGenericType("T", primaryType);
    }
    if (this.genericType("S") !== secondaryType) {
      this.setGenericType("S", secondaryType);
    }
  }

  get hideSOQLInputs() {
    return !this.useWireService;
  }

  get queryStringDataType() {
    return this.valueDataType("queryString");
  }

  get searchStringDataType() {
    return this.valueDataType("searchString");
  }

  get aggQueryStringDataType() {
    return this.valueDataType("aggQueryString");
  }

  get debounceTimeDataType() {
    return this.valueDataType("debounceTime");
  }

  get listViewApiNameDataType() {
    return this.valueDataType("listViewApiName");
  }

  get pageSizeDataType() {
    return this.valueDataType("pageSize", "Number");
  }

  get fieldsDataType() {
    return this.valueDataType("fields");
  }

  get sortByDataType() {
    return this.valueDataType("sortBy");
  }

  get pageTokenDataType() {
    return this.valueDataType("pageToken");
  }

  valueDataType(propertyName, fallback = "String") {
    return this.valueDataTypes[propertyName] || fallback;
  }

  get isLegacyCustomSortBy() {
    return (
      this.sortByDataType.toLowerCase() === "reference" ||
      /[\s,]/.test(String(this.sortBy || ""))
    );
  }

  resolveCustomMode(propertyName, fallback = false) {
    const modeProperty = `${propertyName}IsCustom`;
    return this.inputVariable(modeProperty)
      ? Boolean(this.input(modeProperty, false))
      : this.valueDataType(propertyName).toLowerCase() === "reference" ||
          fallback;
  }

  handlePrimaryObjectChange(event) {
    this.handleObjectChange("objectName1", "T", event);
  }

  handleSecondaryObjectChange(event) {
    this.handleObjectChange("objectName2", "S", event);
  }

  handleObjectChange(propertyName, typeName, event) {
    const objectType =
      event.detail?.newValue ?? event.detail?.objectType ?? null;
    if (event.detail?.isInit && this[propertyName] === objectType) {
      this.scheduleGenericMappingRepair();
      return;
    }
    const previousObjectType = this[propertyName];
    this.clearErrors();
    this[propertyName] = objectType;
    this.repairedMappingsKey = "";
    // flowConfigObjectPicker owns the standard input-value event. This editor
    // only coordinates the generic output type and dependent field values.
    this.setGenericType(typeName, objectType || DEFAULT_VALUES[propertyName]);
    if (propertyName === "objectName1" && previousObjectType !== objectType) {
      if (!this.fieldsIsCustom) {
        this.clearFieldSelection("fields");
      }
      if (!this.sortByIsCustom) {
        this.clearFieldSelection("sortBy");
      }
    }
  }

  clearFieldSelection(propertyName) {
    this[propertyName] = null;
    this.valueDataTypes = {
      ...this.valueDataTypes,
      [propertyName]: "String"
    };
    this.clearInput(propertyName, "String");
  }

  handleValueChange(event) {
    const { name, newValue, newValueDataType } = event.detail;
    if (!VALUE_PROPERTIES.includes(name)) {
      return;
    }
    this.clearErrors();
    this[name] = newValue;
    this.valueDataTypes = {
      ...this.valueDataTypes,
      [name]: newValueDataType
    };
  }

  handleFieldValueChange(event) {
    this.handleValueChange(event);
  }

  handleSortByModeChange(event) {
    this.clearErrors();
    this.sortByIsCustom = Boolean(event.detail?.customMode);
    this.setInput("sortByIsCustom", this.sortByIsCustom, "Boolean");
  }

  handleFieldsModeChange(event) {
    this.clearErrors();
    this.fieldsIsCustom = Boolean(event.detail?.customMode);
    this.setInput("fieldsIsCustom", this.fieldsIsCustom, "Boolean");
  }

  handleUseWireServiceChange(event) {
    this.clearErrors();
    this.useWireService = event.target.checked;
    this.setInput("useWireService", this.useWireService, "Boolean");
  }

  handleShowSOSLChange(event) {
    this.showSOSL = event.target.checked;
  }

  validateConfiguration() {
    const errors = [];
    if (!this.objectName1) {
      errors.push({
        key: "objectName1",
        errorString: "Object Name is required."
      });
    }
    if (this.useWireService && !this.listViewApiName) {
      errors.push({
        key: "listViewApiName",
        errorString: "List View API Name is required in wire service mode."
      });
    }
    if (!this.isValidPageSize) {
      errors.push({
        key: "pageSize",
        errorString: "Page Size must be a whole number between 1 and 2000."
      });
    }
    if (!this.isValidDebounceTime) {
      errors.push({
        key: "debounceTime",
        errorString: "Debounce Time must be zero or a positive number."
      });
    }
    return errors;
  }

  get isValidPageSize() {
    if (this.pageSizeDataType.toLowerCase() === "reference") {
      return true;
    }
    const value = Number(this.pageSize);
    return Number.isInteger(value) && value >= 1 && value <= 2000;
  }

  get isValidDebounceTime() {
    if (this.debounceTimeDataType.toLowerCase() === "reference") {
      return true;
    }
    const value = Number(this.debounceTime);
    return Number.isFinite(value) && value >= 0;
  }
}
