import { LightningElement, api, wire } from "lwc";
import { getObjectInfo } from "lightning/uiObjectInfoApi";
import {
  collectFlowResources,
  createInputValueChangedEvent,
  createInputValueDeletedEvent,
  filterFlowResources,
  findFlowResource,
  flowDataTypeForField,
  fromFlowReference,
  iconForFlowDataType,
  relationshipTargetsForField,
  toFlowReference
} from "c/flowConfigEditorUtils";
import {
  buildPickerBreadcrumbs,
  createPopoverViewportController,
  createProgressiveRenderController,
  createPopoverState,
  positionAnchoredPopover,
  setPopoverHostActive
} from "c/flowConfigPopoverUtils";
import { describeRecordPath } from "c/flowConfigSchemaService";
import {
  loadApexMembers as loadSharedApexMembers,
  loadHierarchySettings,
  loadSharedMetadata,
  parseMetadataList
} from "c/flowConfigMetadataService";
import {
  focusRemainsInside,
  inputEventValue,
  isActivationKey,
  nextActiveIndex
} from "c/flowConfigPickerInteraction";
import {
  asBrowseNode,
  automaticOutputEntry,
  buildResourceSearchText,
  buildResourceCompatibilityError,
  buildOutputItems as buildResourceOutputItems,
  buildRecordBrowseStack,
  CATEGORY_ICONS,
  findNestedResource,
  GLOBAL_CONTAINERS,
  groupResourceOptions,
  normalizeAutomaticOutputMap,
  normalizeOutputType,
  SCREEN_OUTPUT_TYPES,
  searchNestedItems
} from "c/flowConfigResourceModel";

const APEX_BRIDGE_CHANNEL = "flow-config-apex-type";
const APEX_BRIDGE_TIMEOUT = 15000;

export default class FlowConfigResourcePicker extends LightningElement {
  @api label = "Flow Resource";
  @api propertyName;
  @api placeholder = "Enter value or search resources...";
  @api fieldLevelHelp;
  @api acceptedTypes = "";
  @api collection = "any";
  @api required = false;
  @api allowManual = false;
  @api allowLiteral = false;
  _apiVersion;
  @api allowRecordFields = false;
  @api literalType = "String";
  @api maxResults = 100;
  @api modeToggleLabel;
  @api modeToggleChecked = false;

  _builderContext = {};
  _value = null;
  _incomingValue = null;
  _valueDataType = "reference";
  _allResources = [];
  _automaticOutputVariables = {};
  _automaticOutputMap = {};
  automaticOutputSearchIndex = new Map();
  screenSearchIndex = new Map();
  topLevelResourcesCache = null;
  screenContainerCache = null;
  automaticContainerCache = null;
  resourceGroupsCache = null;
  rootVisibleResultCount = null;
  browseStack = [];
  objectInfo = null;
  query = "";
  isOpen = false;
  isEditing = false;
  activeIndex = -1;
  focusOutTimer = null;
  pickerActivity = 0;
  popoverStyle = "";
  popoverState = createPopoverState();
  boundViewportHandler;
  ignoreNextFocusOut = false;
  editTransitionTimer = null;
  hasPendingEdit = false;
  selectedResourceSnapshot = null;
  showApexBridge = false;
  apexBridgeReady = false;
  apexBridgeOrigin = "";
  apexBridgeRequests = new Map();
  apexBridgeSequence = 0;
  boundApexBridgeHandler;
  selectedHydrationKey = "";
  selectedRecordHydrationKey = "";
  selectedGlobalHydrationKey = "";
  selectionHydrationPending = true;
  hydrationGeneration = 0;
  customValidityMessage = "";
  inputValidityMessage = "";
  flowElementMetadata = {};
  flowMetadataRequestStarted = false;
  flowMetadataCheckPending = true;
  automaticOutputRefreshRequested = false;
  dynamicGlobalCache = {};
  hierarchyPrefetchPromise = null;
  rootResultsReady = true;
  progressiveResultsController;
  viewportController;

  constructor() {
    super();
    this.boundViewportHandler = this.handleViewportChange.bind(this);
    this.boundApexBridgeHandler = this.handleApexBridgeMessage.bind(this);
    this.viewportController = createPopoverViewportController(
      this.boundViewportHandler
    );
    this.progressiveResultsController = createProgressiveRenderController(
      () => {
        if (this.isOpen) {
          this.rootResultsReady = true;
          this.requestAutomaticOutputRefresh();
          this.prefetchHierarchySettings();
        }
      }
    );
  }

  connectedCallback() {
    window.addEventListener("message", this.boundApexBridgeHandler);
  }

  renderedCallback() {
    this.viewportController.setActive(this.isOpen);
    if (this.isOpen) {
      this.updatePopoverPosition();
    }
    if (this.selectionHydrationPending) {
      this.selectionHydrationPending = false;
      this.hydrateSelectedApexReference();
      this.hydrateSelectedRecordReference();
      this.hydrateSelectedDynamicGlobalReference();
    }
    if (this.flowMetadataCheckPending) {
      this.flowMetadataCheckPending = false;
      this.hydrateFlowElementMetadata();
    }
  }

  @api
  get builderContext() {
    return this._builderContext;
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
    this._automaticOutputMap = normalizeAutomaticOutputMap(
      this._automaticOutputVariables
    );
    this.flowMetadataCheckPending = true;
    this.rebuildResourceSearchIndexes();
    this.refreshOpenScreenBrowseStack();
  }
  set builderContext(value) {
    const context = value || {};
    this._builderContext = {
      ...context,
      screens: [...(context.screens || [])]
    };
    this.rebuildResourceSearchIndexes();
    this.refreshCollectedResources();
    this.flowMetadataRequestStarted = false;
    this.flowMetadataCheckPending = true;
    this.refreshOpenScreenBrowseStack();
    this.syncQueryToValue();
  }

  @api
  get apiVersion() {
    return this._apiVersion;
  }
  set apiVersion(value) {
    this._apiVersion = value;
    this.refreshCollectedResources();
  }

  refreshCollectedResources() {
    this._allResources = collectFlowResources(
      this._builderContext,
      this._apiVersion
    );
  }

  rebuildResourceSearchIndexes() {
    this.screenSearchIndex = new Map(
      (this._builderContext.screens || []).map((screen, index) => [
        screen.name || String(index),
        buildResourceSearchText(screen)
      ])
    );
    this.automaticOutputSearchIndex = new Map(
      Object.entries(this._automaticOutputMap).map(([path, outputs]) => [
        path,
        buildResourceSearchText(outputs)
      ])
    );
  }

  @api
  get value() {
    return this._value;
  }
  set value(value) {
    this._incomingValue = value ?? null;
    this.normalizeIncomingValue();
  }

  @api
  get valueDataType() {
    return this._valueDataType;
  }
  set valueDataType(value) {
    this._valueDataType = value || "reference";
    this.normalizeIncomingValue();
  }

  normalizeIncomingValue() {
    const previousValue = this._value;
    this._value = this.isReferenceValue
      ? toFlowReference(this._incomingValue)
      : this._incomingValue;
    if (previousValue !== this._value) {
      this.invalidateSelectionHydration();
    }
    this.syncQueryToValue();
  }

  invalidateSelectionHydration() {
    this.hydrationGeneration += 1;
    this.selectionHydrationPending = true;
    this.selectedResourceSnapshot = null;
    this.selectedHydrationKey = "";
    this.selectedRecordHydrationKey = "";
    this.selectedGlobalHydrationKey = "";
  }

  get isReferenceValue() {
    return String(this._valueDataType).toLowerCase() === "reference";
  }

  get acceptedTypeList() {
    return this.acceptedTypes
      .split(",")
      .map((type) => type.trim().toLowerCase())
      .filter(Boolean);
  }

  get currentBrowseNode() {
    return this.browseStack[this.browseStack.length - 1] || null;
  }

  get isBrowsingRecord() {
    return this.currentBrowseNode?.kind === "record";
  }

  get isBrowsingNamespace() {
    return this.currentBrowseNode?.kind === "namespace";
  }

  get isBrowsingList() {
    return this.currentBrowseNode?.kind === "list";
  }

  get currentObjectApiName() {
    if (this.isBrowsingRecord) {
      return this.currentBrowseNode.objectType;
    }
    if (!this.isReferenceValue || !this.hasValue) {
      return null;
    }
    const segments = fromFlowReference(this._value).split(".");
    if (segments.length < 2) {
      return null;
    }
    const collectedObjectType = this._allResources.find(
      (resource) =>
        fromFlowReference(resource.reference) === segments[0] &&
        resource.dataType === "SObject"
    )?.objectType;
    if (collectedObjectType) {
      return collectedObjectType;
    }
    return GLOBAL_CONTAINERS.find(
      (container) => container.namespace === segments[0] && container.objectType
    )?.objectType;
  }

  @wire(getObjectInfo, { objectApiName: "$currentObjectApiName" })
  wiredObjectInfo({ data }) {
    this.objectInfo = data || null;
  }

  get topLevelResources() {
    const cacheKey = [
      this.acceptedTypes,
      this.collection,
      this.filterQuery,
      this.allowRecordFields
    ].join("|");
    if (
      this.topLevelResourcesCache?.source === this._allResources &&
      this.topLevelResourcesCache.key === cacheKey
    ) {
      return this.topLevelResourcesCache.value;
    }
    const resources = filterFlowResources(this._allResources, {
      dataTypes: this.acceptedTypes,
      collection: this.collection,
      query: this.filterQuery
    }).filter(
      (resource) =>
        resource.category !== "Global Variables" &&
        resource.category !== "Screen"
    );

    if (this.allowRecordFields) {
      filterFlowResources(this._allResources, {
        dataTypes: "SObject",
        collection: "exclude",
        query: this.filterQuery
      }).forEach((resource) => {
        if (!resources.some((item) => item.reference === resource.reference)) {
          resources.push(resource);
        }
      });
      filterFlowResources(this._allResources, {
        dataTypes: "Apex",
        collection: "exclude",
        query: this.filterQuery
      }).forEach((resource) => {
        if (
          resource.apexClass &&
          !resources.some((item) => item.reference === resource.reference)
        ) {
          resources.push(resource);
        }
      });
    }
    this.topLevelResourcesCache = {
      source: this._allResources,
      key: cacheKey,
      value: resources
    };
    return resources;
  }

  get filteredResources() {
    let resources;
    if (this.isBrowsingRecord) {
      resources = this.filteredRecordFields;
    } else if (this.isBrowsingNamespace) {
      resources = this.filteredNamespaceResources;
    } else if (this.isBrowsingList) {
      resources = this.filteredListResources;
    } else {
      resources = this.topLevelResources;
    }

    const omitLimit =
      this.isBrowsingNamespace && this.currentBrowseNode.namespace === "$Api";
    return omitLimit
      ? resources
      : resources.slice(0, Number(this.maxResults) || 100);
  }

  get filteredListResources() {
    const query = this.filterQuery.toLowerCase();
    const items = query
      ? this.searchListItems(
          this.currentBrowseNode.items,
          query,
          this.browseStack
        ).map((item) => ({
          ...item,
          label: item.searchLabel || item.label
        }))
      : this.currentBrowseNode.items || [];
    return items.map((item, index) => this.decorateOption(item, index));
  }

  get filteredNamespaceResources() {
    const namespace = this.currentBrowseNode.namespace;
    const resources = filterFlowResources(this._allResources, {
      dataTypes: this.acceptedTypes,
      collection: "exclude",
      query: this.filterQuery
    }).filter((resource) => resource.namespace === namespace);
    if (namespace === "$Api") {
      resources.sort(
        (left, right) =>
          Number(right.apiVersion || 0) - Number(left.apiVersion || 0) ||
          left.label.localeCompare(right.label)
      );
    }
    return resources.map((resource, index) =>
      this.decorateOption(resource, index, {
        meta: `${resource.dataType || "Value"} · ${resource.reference}`,
        iconName: this.iconForResource(resource)
      })
    );
  }

  get filteredRecordFields() {
    const query = this.filterQuery.toLowerCase();
    const node = this.currentBrowseNode;
    const options = [];

    Object.values(this.objectInfo?.fields || {}).forEach((field) => {
      // Flow runtime doesn't resolve compound fields (for example $User.Name)
      // when they are supplied directly as global record values. Salesforce's
      // standard picker exposes their scalar components instead.
      if (node.path.startsWith("$") && field.compound) {
        return;
      }
      const dataType = flowDataTypeForField(field.dataType);
      const searchText = [
        field.label,
        field.apiName,
        field.relationshipName,
        field.dataType
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const typeMatches =
        !this.acceptedTypeList.length ||
        this.acceptedTypeList.includes(dataType.toLowerCase());

      if (typeMatches && (!query || searchText.includes(query))) {
        options.push({
          name: `${node.path}.${field.apiName}`,
          reference: toFlowReference(`${node.path}.${field.apiName}`),
          label: field.label || field.apiName,
          source: `${node.label} field`,
          category: "Fields",
          dataType,
          sourceDataType: field.dataType,
          objectType: node.objectType,
          isCollection: false,
          apiName: field.apiName,
          searchText
        });
      }

      const targets = relationshipTargetsForField(field);
      if (this.allowRecordFields && (!query || searchText.includes(query))) {
        targets.forEach((target) => {
          const targetSuffix =
            targets.length > 1 ? ` (${target.objectLabel})` : "";
          options.push({
            key: `relationship-${node.path}-${field.relationshipName}-${target.objectApiName}`,
            label: `${field.relationshipName}${targetSuffix}`,
            relationshipLabel: field.label || field.relationshipName,
            relationshipName: field.relationshipName,
            targetObject: target.objectApiName,
            targetLabel: target.objectLabel,
            browseFields: true,
            isRelationship: true,
            iconName: "utility:record_lookup",
            meta: `${target.objectLabel} relationship`
          });
        });
      }
    });

    return options
      .sort((left, right) => {
        if (left.browseFields !== right.browseFields) {
          return left.browseFields ? -1 : 1;
        }
        return left.label.localeCompare(right.label);
      })
      .map((field, index) =>
        this.decorateOption(field, index, {
          meta:
            field.meta ||
            `${field.apiName} · ${field.sourceDataType || field.dataType || "Field"}`,
          iconName: this.iconForResource(field)
        })
      );
  }

  get globalContainerOptions() {
    if (this.collection === "only") {
      return [];
    }
    const query = this.filterQuery.toLowerCase();
    return GLOBAL_CONTAINERS.filter((container) => {
      if (
        query &&
        !`${container.label} ${container.namespace}`
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }
      if (!this.acceptedTypeList.length) {
        return true;
      }
      const hasCompatibleKnownResource = this._allResources.some(
        (resource) =>
          resource.namespace === container.namespace &&
          this.isOptionCompatible(resource)
      );
      if (hasCompatibleKnownResource) {
        return true;
      }
      if (container.objectType && this.allowRecordFields) {
        return true;
      }
      if (container.namespace === "$Setup") {
        if (
          Object.prototype.hasOwnProperty.call(
            this.dynamicGlobalCache,
            container.namespace
          )
        ) {
          return this.dynamicGlobalCache[container.namespace].length > 0;
        }
        if (this.hierarchyPrefetchPromise) {
          return false;
        }
      }
      return Boolean(
        container.dynamic &&
        container.supportedTypes?.some((type) =>
          this.acceptedTypeList.includes(type.toLowerCase())
        )
      );
    }).map((container, index) =>
      this.decorateOption(container, index, {
        isContainer: true,
        browseFields: true,
        meta: container.namespace
      })
    );
  }

  get screenContainerOptions() {
    const query = this.filterQuery.toLowerCase();
    const cacheKey = [
      query,
      this.acceptedTypes,
      this.collection,
      this.allowRecordFields,
      this.activeIndex,
      this._value
    ].join("|");
    if (
      this.screenContainerCache?.context === this._builderContext &&
      this.screenContainerCache.automaticOutputs === this._automaticOutputMap &&
      this.screenContainerCache.key === cacheKey
    ) {
      return this.screenContainerCache.value;
    }
    const options = [];
    (this._builderContext.screens || []).forEach((screen, index) => {
      const label = screen.label || screen.name || `Screen ${index + 1}`;
      const screenMatches = `${label} ${screen.name || ""}`
        .toLowerCase()
        .includes(query);
      const queryRoot = query.split(".")[0];
      const fieldSearchText = query
        ? this.screenSearchIndex.get(screen.name || String(index)) || ""
        : "";
      const fieldsMayMatch =
        !query ||
        fieldSearchText.includes(query) ||
        (query.includes(".") && fieldSearchText.includes(queryRoot));
      if (query && !screenMatches && !fieldsMayMatch) {
        return;
      }
      const screenNode = {
        key: `screen-${screen.name || index}`,
        label,
        name: screen.name,
        path: screen.name,
        items: this.buildScreenItems(screen),
        isListContainer: true,
        iconName: "utility:screen",
        meta: "Screen"
      };
      if (!screenNode.items.length) {
        return;
      }
      if (!query) {
        options.push(screenNode);
        return;
      }

      if (screenMatches) {
        options.push(screenNode);
      }
      options.push(
        ...this.searchListItems(screenNode.items, query, [
          this.asBrowseNode(screenNode)
        ]).map((item) => ({
          ...item,
          label: `${screenNode.label} > ${item.searchLabel || item.label}`
        }))
      );
    });
    const result = options.map((option, index) =>
      this.decorateOption(option, index, {
        browseFields: Boolean(option.isListContainer)
      })
    );
    this.screenContainerCache = {
      context: this._builderContext,
      automaticOutputs: this._automaticOutputMap,
      key: cacheKey,
      value: result
    };
    return result;
  }

  buildScreenItems(screen) {
    return (screen.fields || [])
      .map((field, index) => this.buildScreenField(field, screen, index))
      .filter(Boolean);
  }

  buildScreenField(field, screen, index) {
    const nestedFields = (field.fields || [])
      .map((child, childIndex) =>
        this.buildScreenField(child, screen, `${index}-${childIndex}`)
      )
      .filter(Boolean);
    const isComponent =
      field.fieldType === "ComponentInstance" || Boolean(field.extensionName);
    if (isComponent || nestedFields.length) {
      const outputState = isComponent
        ? this.componentOutputState(field)
        : { outputs: [], resolved: true };
      const items = isComponent
        ? this.buildOutputItems(
            String(field.name || "")
              .split(".")
              .pop(),
            outputState.outputs,
            field,
            screen
          )
        : nestedFields;
      if (!items.length && outputState.resolved) {
        return null;
      }
      return {
        key: `screen-component-${screen.name}-${field.name || index}`,
        label: field.label || field.fieldText || field.name || "Component",
        name: field.name,
        path: field.name,
        items,
        isListContainer: true,
        browseFields: true,
        isLightningComponent: isComponent,
        iconName: isComponent ? null : "utility:layout",
        loading: isComponent && !outputState.resolved,
        meta: field.extensionName || field.fieldType || "Screen container"
      };
    }

    const declaredDataType = normalizeOutputType(
      field.dataType || field.valueDataType || field.type || field.fieldType
    );
    if (!SCREEN_OUTPUT_TYPES.has(String(declaredDataType).toLowerCase())) {
      return null;
    }

    const option = {
      key: `screen-field-${screen.name}-${field.name || index}`,
      label: field.label || field.fieldText || field.name || "Screen field",
      name: field.name,
      reference: toFlowReference(field.name),
      dataType: declaredDataType,
      isCollection: Boolean(field.isCollection),
      iconName: this.iconForResource(field),
      meta: `${declaredDataType} · ${toFlowReference(field.name)}`
    };
    return this.isOptionCompatible(option) ? option : null;
  }

  asBrowseNode(item) {
    return asBrowseNode(item);
  }

  searchListItems(items, query, ancestors = []) {
    return searchNestedItems(items, query, ancestors);
  }

  buildComponentOutputs(field, screen = {}) {
    const outputState = this.componentOutputState(field);
    const componentApiName = String(field.name || "")
      .split(".")
      .pop();
    return this.buildOutputItems(
      componentApiName,
      outputState.outputs,
      field,
      screen
    );
  }

  componentOutputState(field) {
    const declaredKeys = ["outputParameters", "outputs", "outputVariables"];
    const suppliedOutputs = declaredKeys.flatMap((key) => {
      return Array.isArray(field?.[key]) ? field[key] : [];
    });
    const automaticEntry = this.automaticOutputEntryFor(field);
    return {
      outputs: [...suppliedOutputs, ...automaticEntry.outputs],
      resolved:
        declaredKeys.some((key) =>
          Object.prototype.hasOwnProperty.call(field || {}, key)
        ) || automaticEntry.found
    };
  }

  buildOutputItems(path, outputs, field = {}, screen = {}) {
    return buildResourceOutputItems({
      path,
      outputs,
      field,
      screen,
      automaticOutputMap: this.automaticOutputMap,
      allowRecordFields: this.allowRecordFields,
      resolveObjectType: (...args) => this.resolveComponentObjectType(...args),
      isCompatible: (option) => this.isOptionCompatible(option),
      iconForResource: (resource) => this.iconForResource(resource)
    });
  }

  get automaticOutputMap() {
    return this._automaticOutputMap;
  }

  automaticOutputsFor(field) {
    return this.automaticOutputEntryFor(field).outputs;
  }

  automaticOutputEntryFor(field) {
    return automaticOutputEntry(field, this.automaticOutputMap);
  }

  refreshOpenScreenBrowseStack() {
    if (!this.browseStack.length || !this._builderContext.screens?.length) {
      return;
    }
    const firstNode = this.browseStack[0];
    const screen = this._builderContext.screens.find(
      (item) => item.name === firstNode.path
    );
    if (!screen) {
      return;
    }
    let items = this.buildScreenItems(screen);
    this.browseStack = this.browseStack.map((node) => {
      if (node === firstNode) {
        return { ...node, items };
      }
      const matchingItem = items.find((item) => item.path === node.path);
      if (!matchingItem) {
        return node;
      }
      items = matchingItem.items || [];
      return {
        ...node,
        items,
        loading: Boolean(matchingItem.loading)
      };
    });
  }

  resolveComponentObjectType(field, output, genericTypeName, screen = {}) {
    const explicitType =
      output.objectType ||
      output.objectApiName ||
      output.sobjectType ||
      output.subtype;
    const genericMatch = String(explicitType || "").match(/^\{(.+?)\}$/);
    if (explicitType && !genericMatch) {
      return explicitType;
    }
    const genericNames = [output.typeName, genericMatch?.[1], genericTypeName]
      .filter(Boolean)
      .map((name) =>
        String(name).replace(/^\{/, "").replace(/\}$/, "").replace(/\[\]$/, "")
      );
    const mappings = [
      ...(field.genericTypeMappings || []),
      ...(field.dataTypeMappings || []),
      ...(field.typeMappings || []),
      ...(screen.genericTypeMappings || []),
      ...(screen.dataTypeMappings || []),
      ...(screen.typeMappings || [])
    ];
    const mapping = mappings.find((item) =>
      genericNames.some(
        (name) =>
          String(item.typeName || item.name || "").toLowerCase() ===
          name.toLowerCase()
      )
    );
    const mappedType = this.extractConfiguredValue(
      mapping?.typeValue ?? mapping?.value
    );
    if (mappedType) {
      return mappedType;
    }
    const inputNames = [
      ...genericNames,
      output.objectTypeInput,
      "objectApiName",
      "objectName",
      "sObjectName",
      "objectType",
      "object"
    ]
      .filter(Boolean)
      .map((name) => String(name).toLowerCase());
    const input = [
      ...(field.inputParameters || []),
      ...(screen.inputParameters || [])
    ].find((parameter) =>
      inputNames.includes(
        String(parameter.name || parameter.apiName || "").toLowerCase()
      )
    );
    return this.extractConfiguredValue(
      input?.stringValue ?? input?.newValue ?? input?.value
    );
  }

  extractConfiguredValue(value) {
    if (typeof value === "string") {
      return value;
    }
    return (
      value?.stringValue ||
      value?.newValue ||
      value?.value ||
      value?.elementReference ||
      null
    );
  }

  isOptionCompatible(option) {
    if (
      this.acceptedTypeList.length &&
      !this.acceptedTypeList.includes(
        String(option.dataType || "").toLowerCase()
      )
    ) {
      return false;
    }
    if (this.collection === "only" && !option.isCollection) {
      return false;
    }
    if (this.collection === "exclude" && option.isCollection) {
      return false;
    }
    return true;
  }

  findScreenFieldByName(fields, outputKey) {
    const normalizedKey = String(outputKey).toLowerCase();
    for (const field of fields || []) {
      const fieldName = String(field.name || "").toLowerCase();
      if (
        fieldName === normalizedKey ||
        normalizedKey.endsWith(`.${fieldName}`)
      ) {
        return field;
      }
      const nested = this.findScreenFieldByName(field.fields, outputKey);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  findScreenFieldPath(fields, outputKey, ancestors = []) {
    const normalizedKey = String(outputKey).toLowerCase();
    for (const field of fields || []) {
      const path = [...ancestors, field];
      const fieldName = String(field.name || "").toLowerCase();
      if (
        fieldName === normalizedKey ||
        normalizedKey.endsWith(`.${fieldName}`)
      ) {
        return path;
      }
      const nested = this.findScreenFieldPath(field.fields, outputKey, path);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  findScreenReferenceContext(rootName) {
    for (const screen of this._builderContext.screens || []) {
      const fieldPath = this.findScreenFieldPath(screen.fields, rootName);
      if (fieldPath) {
        return { screen, fieldPath, field: fieldPath[fieldPath.length - 1] };
      }
    }
    return null;
  }

  get automaticOutputContainerOptions() {
    const outputMap = this.automaticOutputMap;
    const query = this.filterQuery.toLowerCase();
    const cacheKey = [
      query,
      this.acceptedTypes,
      this.collection,
      this.allowRecordFields,
      this.activeIndex,
      this._value
    ].join("|");
    if (
      this.automaticContainerCache?.context === this._builderContext &&
      this.automaticContainerCache.outputs === outputMap &&
      this.automaticContainerCache.flowMetadata === this.flowElementMetadata &&
      this.automaticContainerCache.key === cacheKey
    ) {
      return this.automaticContainerCache.value;
    }
    const keys = Object.keys(outputMap).filter((key) =>
      Array.isArray(outputMap[key])
    );
    const rootKeys = keys.filter(
      (key) =>
        !keys.some((parent) => parent !== key && key.startsWith(`${parent}.`))
    );
    const result = rootKeys.flatMap((path) => {
      const screenField = (this._builderContext.screens || [])
        .map((screen) => this.findScreenFieldByName(screen.fields, path))
        .find(Boolean);
      if (screenField) {
        return [];
      }
      const variable = (this._builderContext.variables || []).find(
        (item) => item.name === path
      );
      const subflow = (this._builderContext.subflows || []).find(
        (item) => (item.name || item.apiName) === path
      );
      const action = (this._builderContext.actionCalls || []).find(
        (item) => (item.name || item.apiName) === path
      );
      const apexAction = (this._builderContext.apexPluginCalls || []).find(
        (item) => (item.name || item.apiName) === path
      );
      const bridgedElement = this.flowElementMetadata[path];
      const isSubflow = Boolean(subflow) || bridgedElement?.kind === "Subflow";
      const label =
        variable?.label ||
        (isSubflow
          ? `Outputs from ${subflow?.label || bridgedElement?.label || path}`
          : null) ||
        action?.label ||
        apexAction?.label ||
        bridgedElement?.label ||
        path;
      const category = variable
        ? variable.dataType === "Apex"
          ? "Apex-Defined Variables"
          : "Variables"
        : isSubflow
          ? "Subflows"
          : apexAction
            ? "Apex Action Outputs"
            : action
              ? "Action Outputs"
              : "Element Outputs";
      const containerMatches =
        !query ||
        `${label} ${path} ${category} outputs`.toLowerCase().includes(query);
      const outputsMayMatch =
        !query ||
        (this.automaticOutputSearchIndex.get(path) || "").includes(query);
      if (query && !containerMatches && !outputsMayMatch) {
        return [];
      }
      const items = this.buildOutputItems(path, outputMap[path]);
      if (!items.length) {
        return [];
      }
      const container = {
        key: `automatic-container-${path}`,
        label,
        name: path,
        path,
        items,
        category,
        isListContainer: true,
        browseFields: true,
        iconName: variable
          ? "utility:apex"
          : isSubflow
            ? "utility:flow"
            : bridgedElement?.iconName || "utility:fallback",
        meta: "Outputs"
      };
      if (!query || containerMatches) {
        return [container];
      }
      return this.searchListItems(items, query, [
        this.asBrowseNode(container)
      ]).map((item) => ({
        ...item,
        label: `${label} > ${item.searchLabel || item.label}`,
        category
      }));
    });
    this.automaticContainerCache = {
      context: this._builderContext,
      outputs: outputMap,
      flowMetadata: this.flowElementMetadata,
      key: cacheKey,
      value: result
    };
    return result;
  }

  get resourceGroups() {
    if (this.currentBrowseNode) {
      return [];
    }
    const cacheKey = [
      this.filterQuery,
      this.acceptedTypes,
      this.collection,
      this.allowRecordFields,
      this.activeIndex,
      this._value
    ].join("|");
    if (
      this.resourceGroupsCache?.resources === this._allResources &&
      this.resourceGroupsCache.context === this._builderContext &&
      this.resourceGroupsCache.outputs === this._automaticOutputMap &&
      this.resourceGroupsCache.dynamicGlobals === this.dynamicGlobalCache &&
      this.resourceGroupsCache.flowMetadata === this.flowElementMetadata &&
      this.resourceGroupsCache.key === cacheKey
    ) {
      return this.resourceGroupsCache.value;
    }
    let optionIndex = 0;
    const result = groupResourceOptions({
      topLevelResources: this.topLevelResources,
      automaticContainers: this.automaticOutputContainerOptions,
      screenContainers: this.screenContainerOptions,
      globalContainers: this.globalContainerOptions
    }).map(([label, resources]) => ({
      key: `group-${label.replace(/[^a-zA-Z0-9]/g, "-")}`,
      label,
      resources: resources.map((resource) =>
        this.decorateOption(resource, optionIndex++, {
          browseFields:
            resource.browseFields ||
            resource.isListContainer ||
            (this.allowRecordFields &&
              resource.dataType === "SObject" &&
              !resource.isCollection &&
              Boolean(resource.objectType)) ||
            (this.allowRecordFields &&
              resource.dataType === "Apex" &&
              !resource.isCollection &&
              Boolean(resource.apexClass)),
          browseApex:
            this.allowRecordFields &&
            resource.dataType === "Apex" &&
            !resource.isCollection &&
            Boolean(resource.apexClass),
          iconName: resource.iconName || this.iconForResource(resource),
          meta: resource.meta || this.metaForResource(resource)
        })
      )
    }));
    this.resourceGroupsCache = {
      resources: this._allResources,
      context: this._builderContext,
      outputs: this._automaticOutputMap,
      dynamicGlobals: this.dynamicGlobalCache,
      flowMetadata: this.flowElementMetadata,
      key: cacheKey,
      value: result
    };
    return result;
  }

  decorateOption(resource, index, extras = {}) {
    const key =
      resource.key ||
      resource.reference ||
      resource.name ||
      `resource-option-${index}`;
    const isActive = index === this.activeIndex;
    const isSelected = resource.reference === this._value;
    return {
      ...resource,
      ...extras,
      key,
      id: `resource-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
      optionClass: [
        "result",
        isActive ? "result--active" : "",
        isSelected ? "result--selected" : ""
      ]
        .filter(Boolean)
        .join(" "),
      isActive,
      isSelected,
      iconName: extras.iconName || resource.iconName || "utility:variable"
    };
  }

  iconForResource(resource) {
    const globalContainer = resource.namespace
      ? GLOBAL_CONTAINERS.find(
          (container) => container.namespace === resource.namespace
        )
      : null;
    const resourcePath = fromFlowReference(
      resource.reference || resource.name || ""
    );
    const isGlobalRoot =
      resource.isContainer || resourcePath === globalContainer?.namespace;
    if (globalContainer && isGlobalRoot) {
      return globalContainer.iconName;
    }
    if (resource.category === "Stages") {
      return CATEGORY_ICONS.Stages;
    }
    if (resource.category === "Text Templates") {
      return CATEGORY_ICONS["Text Templates"];
    }
    return iconForFlowDataType(
      resource,
      CATEGORY_ICONS[resource.category] || "utility:variable"
    );
  }

  metaForResource(resource) {
    return [
      resource.category === "Stages"
        ? "Stage"
        : resource.dataType || "Unknown type",
      resource.isCollection ? "Collection" : null,
      resource.objectType,
      resource.reference
    ]
      .filter(Boolean)
      .join(" · ");
  }

  get hasResults() {
    if (!this.currentBrowseNode && !this.rootResultsReady) {
      return false;
    }
    return this.currentBrowseNode
      ? this.filteredResources.length > 0
      : this.resourceGroups.length > 0;
  }

  get showGroupedResults() {
    return !this.isBrowsingNamespace && !this.isBrowsingList;
  }

  get displayGroups() {
    if (!this.isBrowsingRecord) {
      const limit =
        this.rootVisibleResultCount || Number(this.maxResults) || 100;
      let remaining = limit;
      return this.resourceGroups
        .map((group) => {
          const resources = group.resources.slice(0, Math.max(0, remaining));
          remaining -= resources.length;
          return { ...group, resources };
        })
        .filter((group) => group.resources.length);
    }
    const relationships = this.filteredResources.filter(
      (resource) => resource.isRelationship
    );
    const fields = this.filteredResources.filter(
      (resource) => !resource.isRelationship
    );
    return [
      {
        key: "relationship-fields",
        label: "Relationship Fields",
        resources: relationships
      },
      { key: "record-fields", label: "Fields", resources: fields }
    ].filter((group) => group.resources.length);
  }

  get showResults() {
    return this.isOpen;
  }

  get showSelectedState() {
    return this.hasValue && this.isReferenceValue && !this.isEditing;
  }

  get hasHelpText() {
    return Boolean(this.fieldLevelHelp);
  }

  get selectedResource() {
    if (!this.isReferenceValue) {
      return null;
    }
    if (this.selectedResourceSnapshot?.reference === this._value) {
      return this.selectedResourceSnapshot;
    }
    return (
      findFlowResource(this._builderContext, this._value) ||
      this.findFieldReference(this._value)
    );
  }

  findFieldReference(reference) {
    const inner = fromFlowReference(reference);
    const segments = inner.split(".");
    if (segments.length < 2) {
      return null;
    }
    const base = this._allResources.find(
      (resource) => resource.reference === toFlowReference(segments[0])
    );
    if (!base) {
      return null;
    }
    const field =
      segments.length === 2
        ? this.objectInfo?.fields?.[segments[segments.length - 1]]
        : null;
    const dataType = field
      ? flowDataTypeForField(field.dataType)
      : "Field reference";
    return {
      label: field?.label || segments[segments.length - 1],
      reference,
      dataType,
      sourceDataType: field?.dataType,
      objectType: base.objectType,
      iconName: this.iconForResource({
        dataType,
        sourceDataType: field?.dataType
      })
    };
  }

  get selectedPrimary() {
    return this.selectedDisplayLabels.join(" > ");
  }

  get selectedDisplayLabels() {
    if (!this.isReferenceValue) {
      return [String(this._value ?? "")];
    }
    if (this.selectedResourceSnapshot?.displayLabels?.length) {
      return this.selectedResourceSnapshot.displayLabels;
    }
    const path = fromFlowReference(this._value);
    const segments = path.split(".").filter(Boolean);
    if (!segments.length) {
      return [path];
    }
    const screenContext = this.findScreenReferenceContext(segments[0]);
    const labels = screenContext
      ? [
          screenContext.screen.label || screenContext.screen.name,
          ...screenContext.fieldPath.map(
            (field) => field.label || field.fieldText || field.name
          )
        ]
      : [this.labelForReferenceRoot(segments[0])];
    let parentPath = segments[0];
    segments.slice(1).forEach((segment) => {
      const output =
        (this.automaticOutputMap[parentPath] || []).find(
          (item) => (item.name || item.apiName) === segment
        ) ||
        (parentPath === segments[0]
          ? this.findDeclaredScreenOutput(screenContext?.field, segment)
          : null);
      const recordField =
        parentPath === segments[0] ? this.objectInfo?.fields?.[segment] : null;
      labels.push(
        output?.label ||
          recordField?.label ||
          `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`
      );
      parentPath = `${parentPath}.${segment}`;
    });
    return labels.filter(Boolean);
  }

  labelForReferenceRoot(rootName) {
    if (this.flowElementMetadata[rootName]?.label) {
      return this.flowElementMetadata[rootName].label;
    }
    const resource = this._allResources.find(
      (item) => fromFlowReference(item.reference) === rootName
    );
    if (resource?.label) {
      return resource.label;
    }
    for (const screen of this._builderContext.screens || []) {
      const field = this.findScreenFieldByName(screen.fields, rootName);
      if (field) {
        return field.label || field.fieldText || field.name || rootName;
      }
    }
    const sources = [
      ...(this._builderContext.variables || []),
      ...(this._builderContext.subflows || []),
      ...(this._builderContext.actionCalls || []),
      ...(this._builderContext.apexPluginCalls || [])
    ];
    const source = sources.find(
      (item) => (item.name || item.apiName) === rootName
    );
    return source?.label || rootName;
  }

  get selectedLeaf() {
    const labels = this.selectedDisplayLabels;
    return labels[labels.length - 1] || "";
  }

  get selectedParentPath() {
    return this.selectedDisplayLabels.slice(0, -1).join(" > ");
  }

  get selectedPathSeparator() {
    return ">";
  }

  get hasSelectedParentPath() {
    return this.selectedDisplayLabels.length > 1;
  }

  get selectedDisplayTitle() {
    const resource =
      this.selectedResourceSnapshot?.reference === this._value
        ? this.selectedResourceSnapshot
        : this.selectedResource;
    const typeDescription = resource?.objectType
      ? `${resource.objectType} ${resource.isCollection ? "record collection" : "record"}`
      : resource?.dataType;
    return [this.selectedPrimary, typeDescription].filter(Boolean).join(" · ");
  }

  get selectedIconName() {
    if (this.selectedResourceSnapshot?.reference === this._value) {
      return (
        this.selectedResourceSnapshot.iconName ||
        this.iconForResource(this.selectedResourceSnapshot)
      );
    }
    const descriptor = this.selectedReferenceDescriptor;
    if (descriptor) {
      return this.iconForResource(descriptor);
    }
    const resource = this.selectedResource;
    return resource?.iconName || this.iconForResource(resource || {});
  }

  get selectedReferenceDescriptor() {
    if (!this.isReferenceValue) {
      return null;
    }
    const segments = fromFlowReference(this._value).split(".").filter(Boolean);
    if (!segments.length) {
      return null;
    }
    if (segments.length > 1) {
      const parentPath = segments.slice(0, -1).join(".");
      const leafName = segments[segments.length - 1];
      const screenContext = this.findScreenReferenceContext(segments[0]);
      const output =
        (this.automaticOutputMap[parentPath] || []).find(
          (item) => (item.name || item.apiName) === leafName
        ) ||
        (segments.length === 2
          ? this.findDeclaredScreenOutput(screenContext?.field, leafName)
          : null);
      if (output) {
        return {
          ...output,
          dataType: normalizeOutputType(
            output.dataType || output.valueDataType || output.type,
            output.subtype
          )
        };
      }
    }
    const screenContext = this.findScreenReferenceContext(segments[0]);
    if (screenContext && segments.length === 1) {
      const field = screenContext.field;
      return {
        ...field,
        dataType: normalizeOutputType(
          field.dataType || field.valueDataType || field.type || "String",
          field.subtype
        )
      };
    }
    return null;
  }

  findDeclaredScreenOutput(field, outputName) {
    return [
      ...(field?.outputParameters || []),
      ...(field?.outputs || []),
      ...(field?.outputVariables || [])
    ].find((item) => (item.name || item.apiName) === outputName);
  }

  async hydrateSelectedApexReference() {
    if (
      !this.showSelectedState ||
      this.selectedResourceSnapshot?.reference === this._value
    ) {
      return;
    }
    const reference = this._value;
    const generation = this.hydrationGeneration;
    const path = fromFlowReference(reference);
    const segments = path.split(".").filter(Boolean);
    if (segments.length < 2) {
      return;
    }
    const base = this._allResources.find(
      (resource) =>
        fromFlowReference(resource.reference) === segments[0] &&
        resource.dataType === "Apex" &&
        resource.apexClass
    );
    if (!base) {
      return;
    }
    const hydrationKey = `${reference}:${base.apexClass}`;
    if (this.selectedHydrationKey === hydrationKey) {
      return;
    }
    this.selectedHydrationKey = hydrationKey;
    try {
      let apexClass = base.apexClass;
      let member;
      const labels = [base.label || segments[0]];
      for (const segment of segments.slice(1)) {
        // Each nested member determines the Apex class for the next level.
        // eslint-disable-next-line no-await-in-loop
        const members = await this.loadApexMembers(apexClass);
        if (
          generation !== this.hydrationGeneration ||
          this._value !== reference
        ) {
          return;
        }
        member = members.find((item) => item.name === segment);
        if (!member) {
          return;
        }
        labels.push(member.label || segment);
        if (member.dataType === "Apex" && member.apexClass) {
          apexClass = member.apexClass;
        }
      }
      if (
        generation !== this.hydrationGeneration ||
        this._value !== reference
      ) {
        return;
      }
      this.selectedResourceSnapshot = {
        ...member,
        reference,
        displayLabels: labels,
        iconName: this.iconForResource(member || {})
      };
    } catch {
      // Keep the generic reference display if type metadata is unavailable.
    }
  }

  async hydrateSelectedRecordReference() {
    if (
      !this.showSelectedState ||
      this.selectedResourceSnapshot?.reference === this._value
    ) {
      return;
    }
    const reference = this._value;
    const generation = this.hydrationGeneration;
    const segments = fromFlowReference(reference).split(".").filter(Boolean);
    if (segments.length < 2) {
      return;
    }
    const base = this._allResources.find(
      (resource) =>
        fromFlowReference(resource.reference) === segments[0] &&
        resource.dataType === "SObject" &&
        resource.objectType
    );
    if (!base) {
      return;
    }
    const hydrationKey = `${reference}:${base.objectType}`;
    if (this.selectedRecordHydrationKey === hydrationKey) {
      return;
    }
    this.selectedRecordHydrationKey = hydrationKey;
    try {
      const descriptor = await describeRecordPath(
        base.objectType,
        segments.slice(1).join(".")
      );
      if (
        !descriptor?.dataType ||
        generation !== this.hydrationGeneration ||
        this._value !== reference
      ) {
        return;
      }
      this.selectedResourceSnapshot = {
        ...descriptor,
        reference,
        displayLabels: [
          base.label || segments[0],
          ...(descriptor.labels || segments.slice(1))
        ],
        iconName: this.iconForResource(descriptor)
      };
    } catch {
      // Keep the generic display if the schema path is unavailable.
    }
  }

  async hydrateSelectedDynamicGlobalReference() {
    if (
      !this.showSelectedState ||
      this.selectedResourceSnapshot?.reference === this._value
    ) {
      return;
    }
    const reference = this._value;
    const generation = this.hydrationGeneration;
    const path = fromFlowReference(reference);
    const container = GLOBAL_CONTAINERS.find(
      (item) => item.dynamic && path.startsWith(`${item.namespace}.`)
    );
    if (!container || this.selectedGlobalHydrationKey === reference) {
      return;
    }
    this.selectedGlobalHydrationKey = reference;
    try {
      const items = await this.loadDynamicGlobalItems(container.namespace);
      const match = this.findNestedDynamicResource(items, reference, []);
      if (
        !match ||
        generation !== this.hydrationGeneration ||
        this._value !== reference
      ) {
        return;
      }
      this.selectedResourceSnapshot = {
        ...match.resource,
        reference,
        displayLabels: [container.label, ...match.labels],
        iconName: this.iconForResource(match.resource)
      };
    } catch {
      // Keep the generic reference display if dynamic metadata is unavailable.
    }
  }

  findNestedDynamicResource(items, reference, parentLabels) {
    return findNestedResource(items, reference, parentLabels);
  }

  get selectedMeta() {
    if (!this.isReferenceValue) {
      return `${this.literalType} literal`;
    }
    const resource = this.selectedResource;
    if (!resource) {
      return "Flow reference";
    }
    return [
      resource.objectType,
      resource.isCollection ? "Record collection" : resource.dataType
    ]
      .filter(Boolean)
      .join(" · ");
  }

  get breadcrumbItems() {
    return buildPickerBreadcrumbs("All Resources", this.browseStack);
  }

  get effectiveModeToggleLabel() {
    return this.browseStack.length ? null : this.modeToggleLabel;
  }

  get inputDisplayValue() {
    if (!this.query && this.isBrowsingRecord) {
      return `{!${this.currentBrowseNode.path}.}`;
    }
    if (!this.query && this.isBrowsingNamespace) {
      return `{!${this.currentBrowseNode.namespace}.}`;
    }
    if (!this.query && this.isBrowsingList && this.currentBrowseNode.path) {
      return `{!${this.currentBrowseNode.path}.}`;
    }
    return this.query;
  }

  get filterQuery() {
    const raw = String(this.query || "").trim();
    const node = this.currentBrowseNode;
    if (!node) {
      return fromFlowReference(raw);
    }

    const path =
      node.kind === "record"
        ? node.path
        : node.kind === "namespace"
          ? node.namespace
          : node.path;
    const closedPrefix = `{!${path}.}`;
    const openPrefix = `{!${path}.`;
    let suffix = raw;
    if (raw.startsWith(closedPrefix)) {
      suffix = raw.slice(closedPrefix.length);
    } else if (raw.startsWith(openPrefix)) {
      suffix = raw.slice(openPrefix.length);
    }
    return suffix.replace(/\}$/, "").trim();
  }

  get hasValue() {
    return (
      this._value !== null && this._value !== undefined && this._value !== ""
    );
  }

  get manualReference() {
    return toFlowReference(this.query);
  }

  get showManualAction() {
    return (
      this.allowManual &&
      (!this.currentBrowseNode || this.currentBrowseNode.dynamic) &&
      this.query.trim().startsWith("{!") &&
      !this.filteredResources.some(
        (resource) => resource.reference === this.manualReference
      )
    );
  }

  get showLiteralAction() {
    return (
      this.allowLiteral &&
      Boolean(this.query.trim()) &&
      !this.query.trim().startsWith("{!")
    );
  }

  get literalActionLabel() {
    return `Use “${this.query}” as a ${this.literalType} value`;
  }

  get noResultsMessage() {
    if (!this.currentBrowseNode && !this.rootResultsReady) {
      return "Loading resources…";
    }
    if (this.isBrowsingRecord && !this.objectInfo) {
      return `Loading ${this.currentBrowseNode.objectType} fields…`;
    }
    if (this.currentBrowseNode?.loading) {
      return `Loading ${this.currentBrowseNode.label} fields…`;
    }
    if (this.currentBrowseNode?.loadError) {
      return this.currentBrowseNode.loadError;
    }
    if (this.currentBrowseNode?.dynamic) {
      return `No accessible ${this.currentBrowseNode.label.toLowerCase()} match this input type.`;
    }
    return "No resources match this search and filter.";
  }

  syncQueryToValue() {
    if (!this.isOpen && !this.isEditing) {
      this.query = this.selectedResource?.label || String(this._value ?? "");
    }
  }

  handleFocus() {
    const wasOpen = this.isOpen;
    this.isOpen = true;
    this.isEditing = true;
    this.activeIndex = -1;
    if (!wasOpen) {
      this.scheduleRootResultsAfterPaint();
    }
  }

  scheduleRootResultsAfterPaint() {
    this.rootResultsReady = false;
    this.rootVisibleResultCount = null;
    this.progressiveResultsController.schedule();
  }

  cancelRootResultsLoad() {
    this.progressiveResultsController.cancel();
  }

  @api
  openPicker() {
    this.handleFocus();
    this.focusSearchAfterRender();
  }

  requestAutomaticOutputRefresh() {
    if (
      this.automaticOutputRefreshRequested ||
      !this.propertyName ||
      (this.hasValue && !this.isReferenceValue)
    ) {
      return;
    }
    this.automaticOutputRefreshRequested = true;
    // Flow Builder only republishes automaticOutputVariables after a CPE
    // configuration event. Re-reporting the current value is state-neutral,
    // but gives a newly opened picker the latest unsaved screen outputs.
    this.dispatchEvent(
      new CustomEvent("flowresourcerefresh", {
        bubbles: true,
        composed: true,
        detail: {
          name: this.propertyName,
          currentValue: this._value ?? null,
          currentValueDataType: this._valueDataType || "String"
        }
      })
    );
  }

  prefetchHierarchySettings() {
    const namespace = "$Setup";
    const couldMatch =
      !this.acceptedTypeList.length ||
      GLOBAL_CONTAINERS.find(
        (container) => container.namespace === namespace
      ).supportedTypes.some((type) =>
        this.acceptedTypeList.includes(type.toLowerCase())
      );
    if (
      !couldMatch ||
      this.hierarchyPrefetchPromise ||
      Object.prototype.hasOwnProperty.call(this.dynamicGlobalCache, namespace)
    ) {
      return;
    }
    this.hierarchyPrefetchPromise = this.loadDynamicGlobalItems(namespace)
      .catch(() => [])
      .finally(() => {
        this.hierarchyPrefetchPromise = null;
      });
  }

  handleViewportChange() {
    if (this.isOpen) {
      this.updatePopoverPosition();
    }
  }

  updatePopoverPosition() {
    const anchor = this.template.querySelector(".selection, lightning-input");
    const popover = this.template.querySelector(".results");
    setPopoverHostActive(this.template.host, true);
    const positioned = positionAnchoredPopover({
      anchor,
      popover,
      header: this.template.querySelector(".results__header"),
      scrollArea: this.template.querySelector(".results__scroll"),
      actions: this.template.querySelector(".results__actions"),
      currentStyle: this.popoverStyle,
      state: this.popoverState
    });
    this.popoverState = positioned.state;
    this.popoverStyle = positioned.style;
  }

  resetPopoverPosition() {
    this.popoverStyle = "";
    this.popoverState = createPopoverState();
    setPopoverHostActive(this.template.host, false);
  }

  handleSearch(event) {
    const nextQuery = inputEventValue(event);
    this.inputValidityMessage = "";
    event.currentTarget?.setCustomValidity(this.customValidityMessage);
    const activePath = this.currentBrowseNode
      ? this.currentBrowseNode.kind === "namespace"
        ? this.currentBrowseNode.namespace
        : this.currentBrowseNode.path
      : null;
    if (
      activePath &&
      !String(nextQuery).trim().startsWith(`{!${activePath}.`)
    ) {
      this.browseStack = [];
      this.objectInfo = null;
    }
    this.query = nextQuery;
    this.rootVisibleResultCount = null;
    if (!nextQuery.trim()) {
      if (this.hasValue && this.isEditing) {
        this.clearCommittedValue(true);
      } else {
        this.hasPendingEdit = false;
        this.isOpen = true;
        this.isEditing = true;
        this.activeIndex = -1;
      }
      return;
    }
    this.hasPendingEdit = true;
    this.isOpen = true;
    this.isEditing = true;
    this.activeIndex = -1;
  }

  handleKeydown(event) {
    if (event.key === "Escape") {
      this.closePicker();
      return;
    }
    const nextIndex = nextActiveIndex(
      this.activeIndex,
      event.key,
      this.visibleOptions.length
    );
    if (nextIndex !== null) {
      event.preventDefault();
      this.activeIndex = nextIndex;
    } else if (event.key === "Enter" && this.activeIndex >= 0) {
      event.preventDefault();
      this.selectOption(this.visibleOptions[this.activeIndex]);
    } else if (event.key === "Enter" && this.showManualAction) {
      event.preventDefault();
      this.commitReference(this.manualReference, null);
    } else if (event.key === "Enter" && this.showLiteralAction) {
      event.preventDefault();
      this.commitLiteral();
    }
  }

  handleEdit() {
    window.clearTimeout(this.editTransitionTimer);
    this.ignoreNextFocusOut = true;
    this.isOpen = true;
    this.isEditing = true;
    this.hasPendingEdit = false;
    this.query = String(this._value ?? "");
    this.browseStack = [];
    this.objectInfo = null;

    const path = fromFlowReference(this._value);
    const rootName = path.split(".")[0];
    const rootResource = this._allResources.find(
      (resource) => fromFlowReference(resource.reference) === rootName
    );
    const exactResource = findFlowResource(this._builderContext, this._value);
    if (
      this.allowRecordFields &&
      rootResource?.dataType === "SObject" &&
      !rootResource.isCollection &&
      path.includes(".")
    ) {
      this.browseStack = this.recordBrowseStack(
        rootResource,
        path,
        this.selectedResourceSnapshot
      );
    } else if (exactResource?.namespace) {
      const container = GLOBAL_CONTAINERS.find(
        (item) => item.namespace === exactResource.namespace
      );
      if (container) {
        this.browseStack = [
          {
            kind: "namespace",
            label: container.label,
            namespace: container.namespace,
            dynamic: container.dynamic
          }
        ];
      }
    }
    this.activeIndex = -1;
    this.scheduleRootResultsAfterPaint();
    Promise.resolve().then(() => {
      this.template.querySelector("lightning-input")?.focus();
    });
    // Keep the guard through LWC's pill-to-input render cycle. The focused pill
    // can emit focusout while it is being replaced by the editable input.
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.editTransitionTimer = window.setTimeout(() => {
      this.ignoreNextFocusOut = false;
      this.editTransitionTimer = null;
    }, 0);
  }

  recordBrowseStack(rootResource, path, descriptor = {}) {
    return buildRecordBrowseStack(rootResource, path, descriptor);
  }

  handleSelectionKeydown(event) {
    if (isActivationKey(event.key)) {
      event.preventDefault();
      this.handleEdit();
    }
  }

  get visibleOptions() {
    if (!this.currentBrowseNode && !this.rootResultsReady) {
      return [];
    }
    return this.currentBrowseNode
      ? this.filteredResources
      : this.displayGroups.flatMap((group) => group.resources);
  }

  handleResultsScroll(event) {
    if (this.currentBrowseNode) {
      return;
    }
    const scrollArea = event.currentTarget;
    const distanceFromBottom =
      scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
    const visibleCount =
      this.rootVisibleResultCount || Number(this.maxResults) || 100;
    const totalCount = this.resourceGroups.reduce(
      (count, group) => count + group.resources.length,
      0
    );
    if (distanceFromBottom <= 24 && visibleCount < totalCount) {
      this.rootVisibleResultCount =
        visibleCount + (Number(this.maxResults) || 100);
    }
  }

  handleSelect(event) {
    const key = event.currentTarget.dataset.key;
    this.selectOption(this.visibleOptions.find((item) => item.key === key));
  }

  async selectOption(resource) {
    if (!resource) {
      return;
    }
    if (resource.isContainer) {
      this.openGlobalContainer(resource);
      return;
    }
    if (resource.browseApex) {
      await this.openApexType(resource);
      return;
    }
    if (resource.isListContainer) {
      const ancestors = resource.browseAncestors || this.browseStack;
      this.browseStack = [
        ...ancestors,
        {
          kind: "list",
          label: resource.label,
          path: resource.path,
          items: resource.items || [],
          loading: Boolean(resource.loading)
        }
      ];
      this.query = "";
      this.activeIndex = -1;
      this.focusSearchAfterRender();
      return;
    }
    if (resource.isRelationship) {
      this.browseStack = [
        ...this.browseStack,
        {
          kind: "record",
          label: resource.relationshipLabel,
          objectType: resource.targetObject,
          path: `${this.currentBrowseNode.path}.${resource.relationshipName}`
        }
      ];
      this.objectInfo = null;
      this.query = "";
      this.focusSearchAfterRender();
      return;
    }
    if (resource.browseFields) {
      this.browseStack = [
        {
          kind: "record",
          label: resource.label,
          objectType: resource.objectType,
          path: fromFlowReference(resource.reference)
        }
      ];
      this.objectInfo = null;
      this.query = "";
      this.focusSearchAfterRender();
      return;
    }
    this.commitReference(resource.reference, resource);
  }

  async openApexType(resource) {
    const path = resource.path || fromFlowReference(resource.reference);
    const node = {
      kind: "list",
      label: resource.label,
      path,
      items: [],
      loading: true,
      apexClass: resource.apexClass
    };
    const ancestors = resource.browseAncestors || this.browseStack;
    this.browseStack = [...ancestors, node];
    this.query = "";
    this.activeIndex = -1;
    this.focusSearchAfterRender();

    try {
      const members = await this.loadApexMembers(resource.apexClass);
      if (this.currentBrowseNode !== node) {
        return;
      }
      node.items = this.buildOutputItems(path, members || []);
      node.loading = false;
      if (!node.items.length) {
        node.loadError = `No accessible fields were found for ${resource.label}.`;
      }
      this.browseStack = [...this.browseStack];
    } catch (error) {
      if (this.currentBrowseNode !== node) {
        return;
      }
      node.loading = false;
      node.loadError =
        error?.body?.message ||
        error?.message ||
        `Unable to load ${resource.label} fields.`;
      this.browseStack = [...this.browseStack];
    }
  }

  loadApexMembers(apexClassName) {
    return loadSharedApexMembers(apexClassName, () =>
      this.describeApexTypeThroughVisualforce(apexClassName)
    );
  }

  get apexBridgeUrl() {
    const parentOrigin = encodeURIComponent(window.location.origin);
    return `/apex/FlowConfigApexTypeBridge?parentOrigin=${parentOrigin}`;
  }

  describeApexTypeThroughVisualforce(apexClassName) {
    return this.requestMetadataBridge(
      "describeApexType",
      { apexClassName },
      "members"
    );
  }

  describeFlowElementsThroughVisualforce(flowId) {
    return this.requestMetadataBridge(
      "describeFlowElements",
      { flowId },
      "elements"
    );
  }

  describeCustomLabelsThroughVisualforce() {
    return this.requestMetadataBridge("describeCustomLabels", {}, "labels");
  }

  async loadDynamicGlobalItems(namespace) {
    if (this.dynamicGlobalCache[namespace]) {
      return this.dynamicGlobalCache[namespace];
    }
    let items = [];
    if (namespace === "$Label") {
      const labels = await loadSharedMetadata("global:$Label", () =>
        this.describeCustomLabelsThroughVisualforce()
      );
      items = parseMetadataList(labels, "labels")
        .map((label, index) => {
          const option = {
            key: `custom-label-${label.name || index}`,
            label: label.label || label.name,
            name: label.name,
            reference: toFlowReference(label.name),
            dataType: "String",
            isCollection: false,
            // The globe identifies the $Label container. Individual labels
            // are String resources, matching Flow's Aa treatment.
            iconName: "utility:text",
            meta: toFlowReference(label.name)
          };
          return this.isOptionCompatible(option) ? option : null;
        })
        .filter(Boolean);
    } else if (namespace === "$Setup") {
      const settings = parseMetadataList(
        await loadHierarchySettings(),
        "settings"
      );
      items = settings
        .map((setting, settingIndex) => {
          const path = `$Setup.${setting.name}`;
          const fields = (setting.fields || [])
            .map((field, fieldIndex) => {
              const option = {
                key: `custom-setting-${setting.name}-${field.name || fieldIndex}`,
                label: field.label || field.name,
                name: field.name,
                reference: toFlowReference(`${path}.${field.name}`),
                dataType: field.dataType || "String",
                sourceDataType: field.sourceDataType,
                isCollection: false,
                iconName: this.iconForResource(field),
                meta: `${field.name} · ${field.dataType || "String"}`
              };
              return this.isOptionCompatible(option) ? option : null;
            })
            .filter(Boolean);
          if (!fields.length) {
            return null;
          }
          return {
            key: `custom-setting-${setting.name || settingIndex}`,
            label: setting.label || setting.name,
            name: setting.name,
            path,
            items: fields,
            isListContainer: true,
            browseFields: true,
            iconName: "utility:hierarchy",
            meta: setting.name
          };
        })
        .filter(Boolean);
    }
    this.dynamicGlobalCache = {
      ...this.dynamicGlobalCache,
      [namespace]: items
    };
    return items;
  }

  requestMetadataBridge(action, payload, responseKey) {
    this.showApexBridge = true;
    const requestId = `metadata-${Date.now()}-${++this.apexBridgeSequence}`;
    return new Promise((resolve, reject) => {
      // The bridge is a separate Visualforce document, so it needs a bounded wait.
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      const timeoutId = window.setTimeout(() => {
        this.apexBridgeRequests.delete(requestId);
        reject(
          new Error(
            "The metadata bridge did not respond. Confirm that the Visualforce page is enabled for your profile."
          )
        );
      }, APEX_BRIDGE_TIMEOUT);
      this.apexBridgeRequests.set(requestId, {
        requestId,
        action,
        payload,
        responseKey,
        resolve,
        reject,
        timeoutId,
        sent: false
      });
      Promise.resolve().then(() => this.flushApexBridgeRequests());
    });
  }

  handleApexBridgeMessage(event) {
    const frame = this.template.querySelector("iframe.apex-bridge");
    if (!frame || event.source !== frame.contentWindow) {
      return;
    }
    const message = event.data;
    if (!message || message.channel !== APEX_BRIDGE_CHANNEL) {
      return;
    }
    if (message.action === "ready") {
      if (!this.isTrustedVisualforceOrigin(event.origin)) {
        return;
      }
      this.apexBridgeOrigin = event.origin;
      this.apexBridgeReady = true;
      this.flushApexBridgeRequests();
      return;
    }
    if (event.origin !== this.apexBridgeOrigin) {
      return;
    }
    const pending = this.apexBridgeRequests.get(message.requestId);
    if (!pending) {
      return;
    }
    window.clearTimeout(pending.timeoutId);
    this.apexBridgeRequests.delete(message.requestId);
    if (message.success) {
      pending.resolve(message[pending.responseKey] || []);
    } else {
      pending.reject(
        new Error(message.error || "Unable to inspect Flow metadata.")
      );
    }
  }

  isTrustedVisualforceOrigin(origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== "https:") {
        return false;
      }
      const host = parsed.hostname.toLowerCase();
      return (
        host.endsWith(".visual.force.com") ||
        host.endsWith(".vf.force.com") ||
        host.endsWith(".visualforce.com")
      );
    } catch {
      return false;
    }
  }

  flushApexBridgeRequests() {
    if (!this.apexBridgeReady || !this.apexBridgeOrigin) {
      return;
    }
    const frame = this.template.querySelector("iframe.apex-bridge");
    if (!frame?.contentWindow) {
      return;
    }
    this.apexBridgeRequests.forEach((pending) => {
      if (pending.sent) {
        return;
      }
      pending.sent = true;
      frame.contentWindow.postMessage(
        {
          channel: APEX_BRIDGE_CHANNEL,
          action: pending.action,
          requestId: pending.requestId,
          ...pending.payload
        },
        this.apexBridgeOrigin
      );
    });
  }

  get currentFlowId() {
    let locationText = window.location.href;
    try {
      locationText = decodeURIComponent(locationText);
    } catch {
      // The undecoded URL can still contain the Flow ID.
    }
    return locationText.match(/\b(?:300|301)[a-zA-Z0-9]{12,15}\b/)?.[0] || null;
  }

  hydrateFlowElementMetadata() {
    if (this.flowMetadataRequestStarted || !this.currentFlowId) {
      return;
    }
    const knownRoots = new Set([
      ...(this._builderContext.variables || []).map((item) => item.name),
      ...(this._builderContext.actionCalls || []).map(
        (item) => item.name || item.apiName
      ),
      ...(this._builderContext.apexPluginCalls || []).map(
        (item) => item.name || item.apiName
      )
    ]);
    const hasUnknownAutomaticRoot = Object.keys(this.automaticOutputMap).some(
      (path) =>
        !path.includes(".") &&
        !knownRoots.has(path) &&
        !this.findScreenReferenceContext(path)
    );
    if (!hasUnknownAutomaticRoot) {
      return;
    }
    this.flowMetadataRequestStarted = true;
    loadSharedMetadata(`flow:${this.currentFlowId}`, () =>
      this.describeFlowElementsThroughVisualforce(this.currentFlowId)
    )
      .then((elements) => {
        this.flowElementMetadata = (elements || []).reduce(
          (metadata, element) => ({
            ...metadata,
            [element.name]: element
          }),
          {}
        );
      })
      .catch(() => {
        // Automatic outputs remain usable with their API names as a fallback.
      });
  }

  async openGlobalContainer(container) {
    const globalResource = this._allResources.find(
      (resource) => resource.namespace === container.namespace
    );
    if (container.objectType) {
      this.browseStack = [
        {
          kind: "record",
          label: container.label,
          objectType: container.objectType,
          path: container.namespace
        }
      ];
      this.objectInfo = null;
    } else if (container.dynamic) {
      const node = {
        kind: "list",
        label: container.label,
        namespace: container.namespace,
        path: container.namespace,
        items: [],
        dynamic: true,
        loading: true
      };
      this.browseStack = [node];
      this.query = "";
      this.activeIndex = -1;
      this.focusSearchAfterRender();
      try {
        const items = await this.loadDynamicGlobalItems(container.namespace);
        if (this.currentBrowseNode !== node) {
          return;
        }
        node.items = items;
        node.loading = false;
      } catch (error) {
        if (this.currentBrowseNode !== node) {
          return;
        }
        node.loading = false;
        node.loadError =
          error?.body?.message ||
          error?.message ||
          `Unable to load ${container.label}.`;
      }
      this.browseStack = [...this.browseStack];
    } else {
      this.browseStack = [
        {
          kind: "namespace",
          label: container.label,
          namespace: container.namespace,
          dynamic: container.dynamic,
          hasKnownResources: Boolean(globalResource)
        }
      ];
    }
    this.query = "";
    this.activeIndex = -1;
    this.focusSearchAfterRender();
  }

  handleBack() {
    this.browseStack = this.browseStack.slice(0, -1);
    this.objectInfo = null;
    this.query = "";
    this.activeIndex = -1;
    this.focusSearchAfterRender();
  }

  handleBreadcrumb(event) {
    const depth = Number(
      event.detail?.depth ?? event.currentTarget?.dataset?.depth
    );
    this.browseStack = this.browseStack.slice(0, depth);
    this.objectInfo = null;
    this.query = "";
    this.activeIndex = -1;
    this.focusSearchAfterRender();
  }

  handleManualSelect() {
    this.commitReference(this.manualReference, null);
  }

  handleLiteralSelect() {
    this.commitLiteral();
  }

  commitLiteral() {
    const raw = this.query.trim();
    const value = this.literalType === "Number" ? Number(raw) : this.query;
    if (this.literalType === "Number" && (!raw || !Number.isFinite(value))) {
      this.inputValidityMessage = `${this.label} requires a numeric value. Enter a number or select a Number resource.`;
      const input = this.template.querySelector("lightning-input");
      input?.setCustomValidity(this.validationMessage);
      input?.reportValidity();
      return;
    }
    this.inputValidityMessage = "";
    this.invalidateSelectionHydration();
    this._incomingValue = value;
    this._value = value;
    this._valueDataType = this.literalType;
    this.hasPendingEdit = false;
    this.isOpen = false;
    this.automaticOutputRefreshRequested = false;
    this.resetPopoverPosition();
    this.isEditing = false;
    this.browseStack = [];
    this.query = String(value);
    this.clearValidityAfterRender();
    this.dispatchResourceChange(value, null, this.literalType);
    if (this.propertyName) {
      this.dispatchEvent(
        createInputValueChangedEvent(this.propertyName, value, this.literalType)
      );
    }
  }

  handleClear(event) {
    event?.stopPropagation();
    this.clearCommittedValue(false);
  }

  clearCommittedValue(keepOpen) {
    const deletedValueDataType = this._valueDataType;
    this.invalidateSelectionHydration();
    this._incomingValue = null;
    this._value = null;
    this.inputValidityMessage = "";
    this.hasPendingEdit = false;
    this.query = "";
    this.isOpen = keepOpen;
    this.isEditing = keepOpen;
    this.automaticOutputRefreshRequested = keepOpen;
    this.activeIndex = -1;
    if (!keepOpen) {
      this.resetPopoverPosition();
      this.browseStack = [];
    }
    this.dispatchResourceChange(null, null, deletedValueDataType);
    if (this.propertyName) {
      this.dispatchEvent(
        createInputValueDeletedEvent(this.propertyName, deletedValueDataType)
      );
    }
  }

  handleClose() {
    this.closePicker();
  }

  handleResultsMouseDown(event) {
    // Native buttons take focus before their click event fires. Keep focus on
    // the search input so focusout doesn't remove the dropdown mid-click.
    if (event.target.closest("button")) {
      event.preventDefault();
    }
  }

  handleResultsClick() {
    this.pickerActivity += 1;
  }

  handleFocusOut(event) {
    if (this.ignoreNextFocusOut) {
      this.ignoreNextFocusOut = false;
      return;
    }
    if (focusRemainsInside(this.template, event.relatedTarget)) {
      return;
    }
    const activityAtBlur = this.pickerActivity;
    window.clearTimeout(this.focusOutTimer);
    // Browser click fires after focusout; defer closing until that click settles.
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.focusOutTimer = window.setTimeout(() => {
      const internalClickCompleted = activityAtBlur !== this.pickerActivity;
      if (this.isOpen && !internalClickCompleted) {
        this.closePicker();
      }
    }, 100);
  }

  focusSearchAfterRender() {
    Promise.resolve().then(() => {
      this.template.querySelector("lightning-input")?.focus();
    });
  }

  closePicker() {
    this.cancelRootResultsLoad();
    window.clearTimeout(this.focusOutTimer);
    this.focusOutTimer = null;
    if (this.hasPendingEdit) {
      const editedValue = this.query.trim();
      if (!editedValue) {
        this.handleClear();
        return;
      }
      if (/^\{![^{}]+\}$/.test(editedValue)) {
        this.commitReference(editedValue, null);
        return;
      }
      if (this.allowLiteral && !editedValue.startsWith("{!")) {
        this.commitLiteral();
        return;
      }
    }
    this.hasPendingEdit = false;
    this.isOpen = false;
    this.automaticOutputRefreshRequested = false;
    this.resetPopoverPosition();
    this.activeIndex = -1;
    if (this.hasValue && this.isReferenceValue) {
      this.isEditing = false;
      this.browseStack = [];
      this.objectInfo = null;
      this.syncQueryToValue();
    }
  }

  disconnectedCallback() {
    this.hydrationGeneration += 1;
    this.cancelRootResultsLoad();
    window.clearTimeout(this.focusOutTimer);
    window.clearTimeout(this.editTransitionTimer);
    this.viewportController.disconnect();
    window.removeEventListener("message", this.boundApexBridgeHandler);
    this.apexBridgeRequests.forEach((pending) => {
      window.clearTimeout(pending.timeoutId);
      pending.reject(new Error("The Apex type picker was closed."));
    });
    this.apexBridgeRequests.clear();
  }

  commitReference(reference, resource) {
    const normalized = toFlowReference(reference);
    if (!normalized) {
      return;
    }
    this.invalidateSelectionHydration();
    this._incomingValue = normalized;
    this._value = normalized;
    this.inputValidityMessage = "";
    const ancestors = resource?.browseAncestors || this.browseStack;
    const ancestorLabels = (ancestors || [])
      .map((item) => item.label)
      .filter(Boolean);
    const resourceLabel = resource?.searchLabel || resource?.label;
    const displayLabels = resourceLabel
      ? [...ancestorLabels, ...String(resourceLabel).split(" > ")]
      : [];
    this.selectedResourceSnapshot = resource
      ? {
          ...resource,
          reference: normalized,
          displayLabels,
          browseAncestors: (ancestors || []).map((node) => ({ ...node }))
        }
      : null;
    this._valueDataType = "reference";
    this.hasPendingEdit = false;
    this.isOpen = false;
    this.automaticOutputRefreshRequested = false;
    this.resetPopoverPosition();
    this.isEditing = false;
    this.browseStack = [];
    this.query = resource?.label || normalized;
    this.clearValidityAfterRender();
    this.dispatchResourceChange(normalized, resource, "reference");
    if (this.propertyName) {
      this.dispatchEvent(
        createInputValueChangedEvent(this.propertyName, normalized, "reference")
      );
    }
  }

  clearValidityAfterRender() {
    Promise.resolve().then(() => {
      const input = this.template.querySelector("lightning-input");
      if (input) {
        input.setCustomValidity(this.validationMessage);
        input.reportValidity();
      }
    });
  }

  dispatchResourceChange(newValue, resource, newValueDataType) {
    this.dispatchEvent(
      new CustomEvent("resourcechange", {
        bubbles: false,
        composed: false,
        detail: {
          name: this.propertyName,
          newValue,
          newValueDataType,
          resource
        }
      })
    );
  }

  @api
  setCustomValidity(message) {
    this.customValidityMessage = message || "";
  }

  @api
  get validationMessage() {
    if (this.customValidityMessage) {
      return this.customValidityMessage;
    }
    if (this.inputValidityMessage) {
      return this.inputValidityMessage;
    }
    const literalError = this.committedLiteralValidationMessage;
    if (literalError) {
      return literalError;
    }
    const globalFieldError = this.selectedGlobalFieldValidationMessage;
    if (globalFieldError) {
      return globalFieldError;
    }
    const resourceError = this.selectedResourceValidationMessage;
    if (resourceError) {
      return resourceError;
    }
    return this.required && !this.hasValue ? `${this.label} is required.` : "";
  }

  get committedLiteralValidationMessage() {
    if (
      this.isReferenceValue ||
      !this.hasValue ||
      this.literalType !== "Number"
    ) {
      return "";
    }
    const raw = String(this._value).trim();
    return raw && Number.isFinite(Number(raw))
      ? ""
      : `${this.label} requires a numeric value. Enter a number or select a Number resource.`;
  }

  get selectedResourceValidationMessage() {
    if (!this.isReferenceValue || !this.hasValue) {
      return "";
    }
    const resource =
      (this.selectedResourceSnapshot?.reference === this._value
        ? this.selectedResourceSnapshot
        : null) ||
      this.selectedReferenceDescriptor ||
      this.selectedResource;
    return buildResourceCompatibilityError(resource, {
      acceptedTypes: this.acceptedTypes,
      collection: this.collection,
      inputLabel: this.label,
      resourceLabel: this.selectedPrimary,
      allowLiteral: this.allowLiteral
    });
  }

  get selectedGlobalFieldValidationMessage() {
    if (!this.isReferenceValue || !this.hasValue || !this.objectInfo?.fields) {
      return "";
    }
    const segments = fromFlowReference(this._value).split(".").filter(Boolean);
    if (segments.length !== 2) {
      return "";
    }
    const container = GLOBAL_CONTAINERS.find(
      (item) => item.namespace === segments[0] && item.objectType
    );
    const field = container ? this.objectInfo.fields[segments[1]] : null;
    if (!field?.compound) {
      return "";
    }
    return `${container.label} > ${field.label || field.apiName} is a compound field that Flow can't use directly here. Select one of its scalar fields instead, or create a compatible Flow formula.`;
  }

  get showSelectedValidationMessage() {
    return this.showSelectedState && Boolean(this.validationMessage);
  }

  @api
  reportValidity() {
    const input = this.template.querySelector("lightning-input");
    if (input) {
      input.setCustomValidity(this.validationMessage);
      const reported = input.reportValidity();
      return (
        !this.validationMessage && (typeof reported !== "boolean" || reported)
      );
    }
    return !this.validationMessage;
  }
}
