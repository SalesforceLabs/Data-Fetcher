import { LightningElement, api, wire } from "lwc";
import { getObjectInfo } from "lightning/uiObjectInfoApi";
import {
  createInputValueChangedEvent,
  createInputValueDeletedEvent,
  flowDataTypeForField,
  iconForFlowDataType,
  isFieldTypeAccepted,
  relationshipTargetsForField
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
  focusRemainsInside,
  inputEventValue,
  isActivationKey,
  nextActiveIndex
} from "c/flowConfigPickerInteraction";
import { buildResourceCompatibilityError } from "c/flowConfigResourceModel";

export default class FlowConfigFieldPicker extends LightningElement {
  @api label = "Field";
  @api propertyName;
  @api objectApiName;
  @api placeholder = "Search field label, API name, or type…";
  @api fieldLevelHelp;
  @api required = false;
  @api acceptedTypes = "";
  @api maxResults = 100;
  @api maxRelationshipDepth = 5;
  @api modeToggleLabel;
  @api modeToggleChecked = false;

  _value = null;
  _values = [];
  _multiple = false;
  _sortable = true;
  objectInfoCache = {};
  objectInfoError;
  browseStack = [];
  fieldDescriptorCache = {};
  selectedHydrationGeneration = 0;
  selectedHydrationKeys = new Set();
  selectedHydrationPending = true;
  query = "";
  isOpen = false;
  activeIndex = -1;
  visibleResultCount = null;
  allFieldsCache = null;
  relationshipFieldsCache = null;
  customValidityMessage = "";
  draggedFieldIndex = -1;
  dragOverFieldIndex = -1;
  reorderAnnouncement = "";
  suppressBlurClose = false;
  interactionResetTimer;
  focusOutTimer;
  ignoreNextFocusOut = false;
  editTransitionTimer;
  popoverStyle = "";
  popoverState = createPopoverState();
  boundViewportHandler;
  resultsReady = true;
  progressiveResultsController;
  viewportController;

  constructor() {
    super();
    this.boundViewportHandler = this.handleViewportChange.bind(this);
    this.viewportController = createPopoverViewportController(
      this.boundViewportHandler
    );
    this.progressiveResultsController = createProgressiveRenderController(
      () => {
        if (this.isOpen) {
          this.resultsReady = true;
        }
      }
    );
  }

  renderedCallback() {
    this.viewportController.setActive(this.isOpen);
    if (this.isOpen) {
      this.updatePopoverPosition();
    }
    if (this.selectedHydrationPending) {
      this.selectedHydrationPending = false;
      this.hydrateSelectedPaths();
    }
  }

  @api
  get multiple() {
    return this._multiple;
  }
  set multiple(value) {
    this._multiple = value === true || value === "true";
    this.setInternalValue(this._value);
  }

  @api
  get sortable() {
    return this._sortable;
  }
  set sortable(value) {
    this._sortable = value !== false && value !== "false";
  }

  @api
  get value() {
    return this._value;
  }
  set value(value) {
    this.setInternalValue(value);
  }

  setInternalValue(value) {
    this.selectedHydrationGeneration += 1;
    this.selectedHydrationKeys = new Set();
    this.selectedHydrationPending = true;
    if (this._multiple) {
      this._values = this.parseValues(value);
      this._value = this._values.length ? JSON.stringify(this._values) : null;
    } else {
      this._value = value || null;
      this._values = this._value ? [this._value] : [];
    }
    if (!this.isOpen) {
      this.query = this._multiple
        ? ""
        : this.selectedField?.label || this._value || "";
    }
  }

  parseValues(value) {
    if (Array.isArray(value)) {
      return [...new Set(value.filter(Boolean))];
    }
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.filter(Boolean))];
      }
    } catch {
      // Accept a comma-separated value as a migration convenience.
    }
    return [
      ...new Set(
        String(value)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      )
    ];
  }

  get currentObjectApiName() {
    return this.browseStack.length
      ? this.browseStack[this.browseStack.length - 1].objectApiName
      : this.objectApiName;
  }

  get currentPath() {
    return this.browseStack.length
      ? this.browseStack[this.browseStack.length - 1].path
      : "";
  }

  get objectInfo() {
    return this.objectInfoCache[this.currentObjectApiName] || null;
  }

  @wire(getObjectInfo, { objectApiName: "$currentObjectApiName" })
  wiredObjectInfo({ data, error }) {
    if (data) {
      this.objectInfoCache = {
        ...this.objectInfoCache,
        [this.currentObjectApiName]: data
      };
      this.selectedHydrationPending = true;
    }
    this.objectInfoError = error || null;
    if (!this.isOpen && !this._multiple) {
      this.query = this.selectedField?.label || this._value || "";
    }
  }

  get allFields() {
    if (
      this.allFieldsCache?.objectInfo === this.objectInfo &&
      this.allFieldsCache.path === this.currentPath
    ) {
      return this.allFieldsCache.value;
    }
    const value = Object.values(this.objectInfo?.fields || {})
      .map((field) => {
        const path = this.currentPath
          ? `${this.currentPath}.${field.apiName}`
          : field.apiName;
        return {
          apiName: field.apiName,
          path,
          label: field.label || field.apiName,
          dataType: field.dataType || "",
          iconName: iconForFlowDataType({
            dataType: flowDataTypeForField(field.dataType),
            sourceDataType: field.dataType
          }),
          relationshipName: field.relationshipName || "",
          searchText: [
            field.label,
            field.apiName,
            field.dataType,
            field.relationshipName,
            path
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
        };
      })
      .sort((left, right) => left.label.localeCompare(right.label));
    this.allFieldsCache = {
      objectInfo: this.objectInfo,
      path: this.currentPath,
      value
    };
    return value;
  }

  get relationshipFields() {
    if (this.browseStack.length >= Number(this.maxRelationshipDepth || 5)) {
      return [];
    }
    const query = this.query.trim().toLowerCase();
    return this.allRelationshipFields
      .filter(
        (field) =>
          field.objectApiName && (!query || field.searchText.includes(query))
      )
      .map((field, index) => {
        const isActive = index === this.activeIndex;
        return {
          ...field,
          isActive,
          optionClass: `result${isActive ? " result--active" : ""}`
        };
      });
  }

  get allRelationshipFields() {
    if (
      this.relationshipFieldsCache?.objectInfo === this.objectInfo &&
      this.relationshipFieldsCache.path === this.currentPath
    ) {
      return this.relationshipFieldsCache.value;
    }
    const value = Object.values(this.objectInfo?.fields || {})
      .flatMap((field) =>
        relationshipTargetsForField(field).map((target) => {
          const relationshipPath = this.currentPath
            ? `${this.currentPath}.${field.relationshipName}`
            : field.relationshipName;
          const label = field.relationshipName || field.label || field.apiName;
          const targetApiName = target.objectApiName;
          const targetSuffix =
            field.referenceToInfos.length > 1 ? ` (${target.objectLabel})` : "";
          return {
            id: `relationship-${relationshipPath}-${targetApiName}`.replace(
              /[^a-zA-Z0-9_-]/g,
              "-"
            ),
            key: `${relationshipPath}:${targetApiName}`,
            label: `${label}${targetSuffix}`,
            apiName: field.apiName,
            path: relationshipPath,
            objectApiName: targetApiName,
            meta: `${target.objectLabel || targetApiName} relationship`,
            iconName: iconForFlowDataType({ isRelationship: true }),
            searchText: [
              label,
              field.label,
              field.apiName,
              relationshipPath,
              target.objectLabel,
              targetApiName
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
          };
        })
      )
      .filter((field) => field.objectApiName)
      .sort((left, right) => left.label.localeCompare(right.label));
    this.relationshipFieldsCache = {
      objectInfo: this.objectInfo,
      path: this.currentPath,
      value
    };
    return value;
  }

  get matchingFields() {
    const query = this.query.trim().toLowerCase();
    return this.allFields.filter((field) => {
      const typeMatches = isFieldTypeAccepted(
        field.dataType,
        this.acceptedTypes
      );
      return typeMatches && (!query || field.searchText.includes(query));
    });
  }

  get filteredFields() {
    const visibleResultCount =
      this.visibleResultCount || Number(this.maxResults) || 100;
    return this.matchingFields
      .slice(0, visibleResultCount)
      .map((field, index) => {
        const isSelected = this._values.includes(field.path);
        const isActive =
          index + this.relationshipFields.length === this.activeIndex;
        return {
          ...field,
          id: `field-${field.path.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
          optionClass: [
            "result",
            isActive ? "result--active" : "",
            isSelected ? "result--selected" : ""
          ]
            .filter(Boolean)
            .join(" "),
          isActive,
          isSelected
        };
      });
  }

  get selectedField() {
    return this.descriptorForPath(this._value);
  }

  get selectedFields() {
    return this._values.map(
      (path) =>
        this.descriptorForPath(path) || {
          apiName: path,
          path,
          label: path.split(".").pop(),
          dataType: ""
        }
    );
  }

  descriptorForPath(path) {
    if (!path) {
      return null;
    }
    return (
      this.allFields.find((field) => field.path === path) ||
      this.fieldDescriptorCache[path] ||
      null
    );
  }

  async hydrateSelectedPaths() {
    if (!this.objectApiName) {
      return;
    }
    const generation = this.selectedHydrationGeneration;
    const objectApiName = this.objectApiName;
    const paths = this._values.filter(
      (path) =>
        path.includes(".") &&
        !this.fieldDescriptorCache[path] &&
        !this.selectedHydrationKeys.has(`${objectApiName}:${path}`)
    );
    paths.forEach((path) =>
      this.hydrateSelectedPath(path, objectApiName, generation)
    );
  }

  async hydrateSelectedPath(path, objectApiName, generation) {
    const key = `${objectApiName}:${path}`;
    this.selectedHydrationKeys.add(key);
    try {
      const descriptor = await describeRecordPath(objectApiName, path);
      if (
        generation !== this.selectedHydrationGeneration ||
        objectApiName !== this.objectApiName ||
        !this._values.includes(path)
      ) {
        return;
      }
      if (!descriptor?.dataType) {
        return;
      }
      const sourceDataType = descriptor.sourceDataType || descriptor.dataType;
      this.fieldDescriptorCache = {
        ...this.fieldDescriptorCache,
        [path]: {
          ...descriptor,
          apiName: descriptor.name || path.split(".").pop(),
          path,
          label:
            descriptor.labels?.[descriptor.labels.length - 1] ||
            descriptor.label ||
            path.split(".").pop(),
          dataType: sourceDataType,
          iconName: iconForFlowDataType({
            dataType: flowDataTypeForField(sourceDataType),
            sourceDataType
          })
        }
      };
    } catch {
      // The saved API path remains usable when schema metadata is unavailable.
    }
  }

  get showSelectedFields() {
    return this._multiple && this.hasValue;
  }

  get showRemoveAction() {
    return this.hasValue && !this._multiple;
  }

  get showOrderingControls() {
    return this._sortable;
  }

  get orderedFields() {
    const lastIndex = this.selectedFields.length - 1;
    return this.selectedFields.map((field, index) => ({
      ...field,
      id: `selected-${(field.path || field.apiName).replace(/[^a-zA-Z0-9_-]/g, "-")}`,
      index,
      position: index + 1,
      title: [field.label, field.path || field.apiName, field.dataType]
        .filter(Boolean)
        .join(" · "),
      isFirst: index === 0,
      isLast: index === lastIndex,
      isDraggable: lastIndex > 0,
      dragClass: `drag-handle${lastIndex > 0 ? "" : " drag-handle--disabled"}`,
      dragLabel: `Drag ${field.label} to reorder`,
      moveUpLabel: `Move ${field.label} up`,
      moveDownLabel: `Move ${field.label} down`,
      removeLabel: `Remove ${field.label}`,
      orderClass: `selected-field${index === this.dragOverFieldIndex ? " selected-field--drag-over" : ""}`
    }));
  }

  get selectedPrimary() {
    if (this._multiple) {
      return `${this._values.length} field${this._values.length === 1 ? "" : "s"}`;
    }
    return this.selectedField?.label || this._value;
  }

  get selectedMeta() {
    if (this._multiple) {
      return this.selectedFields.map((field) => field.label).join(", ");
    }
    const field = this.selectedField;
    return field?.path || field?.apiName || "";
  }

  get selectedTitle() {
    const fieldDetails = this.selectedFields
      .map((field) =>
        [field.label, field.apiName, field.dataType].filter(Boolean).join(" · ")
      )
      .join(", ");
    return fieldDetails || this._value || "";
  }

  get selectedIconName() {
    return this._multiple
      ? "utility:multi_select_checkbox"
      : iconForFlowDataType({
          dataType: flowDataTypeForField(this.selectedField?.dataType),
          sourceDataType: this.selectedField?.dataType
        });
  }

  get effectivePlaceholder() {
    return this.isDisabled
      ? "Select a record collection first"
      : this.placeholder;
  }

  get hasValue() {
    return this._values.length > 0;
  }

  get hasResults() {
    return this.resultsReady && this.filteredFields.length > 0;
  }

  get showSelectedState() {
    return this.hasValue && !this.isOpen && !this.isDisabled;
  }

  get hasHelpText() {
    return Boolean(this.fieldLevelHelp);
  }

  get resultHeading() {
    const selected = this._multiple ? ` · ${this._values.length} selected` : "";
    return `${this.currentObjectApiName} fields (${this.filteredFields.length})${selected}`;
  }

  get breadcrumbItems() {
    return buildPickerBreadcrumbs("All Fields", this.browseStack);
  }

  get effectiveModeToggleLabel() {
    return this.browseStack.length ? null : this.modeToggleLabel;
  }

  get hasRelationships() {
    return this.resultsReady && this.relationshipFields.length > 0;
  }

  get hasAnyResults() {
    return this.hasRelationships || this.hasResults;
  }

  get showNoResults() {
    return this.resultsReady && !this.hasAnyResults;
  }

  get showResultsLoading() {
    return !this.resultsReady;
  }

  get isDisabled() {
    return !this.objectApiName;
  }

  get removeLabel() {
    return this._multiple ? "Clear all fields" : "Remove current selection";
  }

  get noResultsMessage() {
    if (!this.objectApiName) {
      return "Choose a record resource or object first.";
    }
    if (this.objectInfoError) {
      return `Fields for ${this.currentObjectApiName} could not be loaded.`;
    }
    if (!this.objectInfo) {
      return `Loading ${this.currentObjectApiName} fields…`;
    }
    return "No fields match this search and filter.";
  }

  handleFocus() {
    if (this.isDisabled) {
      return;
    }
    const wasOpen = this.isOpen;
    this.isOpen = true;
    this.activeIndex = -1;
    this.resetVisibleResults();
    if (!this._multiple && this._value) {
      this.query = "";
    }
    if (!wasOpen) {
      this.scheduleResultsAfterPaint();
    }
  }

  scheduleResultsAfterPaint() {
    this.resultsReady = false;
    this.progressiveResultsController.schedule();
  }

  @api
  openPicker() {
    this.handleFocus();
    Promise.resolve().then(() => {
      this.template.querySelector("lightning-input")?.focus();
    });
  }

  handleSearch(event) {
    this.query = inputEventValue(event);
    this.isOpen = !this.isDisabled;
    this.activeIndex = -1;
    this.resetVisibleResults();
  }

  handleResultsScroll(event) {
    const scrollArea = event.currentTarget;
    const distanceFromBottom =
      scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
    const batchSize = Number(this.maxResults) || 100;
    const visibleResultCount = this.visibleResultCount || batchSize;
    if (
      distanceFromBottom <= 24 &&
      visibleResultCount < this.matchingFields.length
    ) {
      this.visibleResultCount = visibleResultCount + batchSize;
    }
  }

  resetVisibleResults() {
    this.visibleResultCount = null;
  }

  handleKeydown(event) {
    const optionCount =
      this.relationshipFields.length + this.filteredFields.length;
    if (event.key === "Escape") {
      this.closePicker();
      return;
    }
    const nextIndex = nextActiveIndex(this.activeIndex, event.key, optionCount);
    if (nextIndex !== null) {
      event.preventDefault();
      this.activeIndex = nextIndex;
    } else if (event.key === "Enter" && this.activeIndex >= 0) {
      event.preventDefault();
      const relationship = this.relationshipFields[this.activeIndex];
      if (relationship) {
        this.browseRelationship(relationship);
        return;
      }
      const field =
        this.filteredFields[this.activeIndex - this.relationshipFields.length];
      if (field) {
        this.commitField(field.path, field);
      }
    }
  }

  handleEdit() {
    if (this.isDisabled) {
      return;
    }
    this.beginEditTransition();
    const wasOpen = this.isOpen;
    this.isOpen = true;
    this.query = "";
    this.activeIndex = -1;
    if (!wasOpen) {
      this.scheduleResultsAfterPaint();
    }
    Promise.resolve().then(() => {
      this.template.querySelector("lightning-input")?.focus();
    });
  }

  handleSelectionMouseDown(event) {
    if (event.target.closest(".selection__clear")) {
      return;
    }
    // Mousedown can blur the selected pill before its click opens the editor.
    this.beginEditTransition();
  }

  beginEditTransition() {
    this.ignoreNextFocusOut = true;
    this.holdBlurClose(1000);
    window.clearTimeout(this.editTransitionTimer);
    // Safety release for browsers that don't emit a transition focusout.
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.editTransitionTimer = window.setTimeout(() => {
      this.ignoreNextFocusOut = false;
      this.editTransitionTimer = null;
    }, 1000);
  }

  handleSelectionKeydown(event) {
    if (isActivationKey(event.key)) {
      event.preventDefault();
      this.handleEdit();
    }
  }

  handleResultsMouseDown(event) {
    // Keep the search input focused while interacting with the popup. Native
    // drag handles must receive mousedown so the browser can begin dragging.
    this.holdBlurClose(500);
    if (!event.target.closest(".drag-handle")) {
      event.preventDefault();
    }
  }

  holdBlurClose(duration) {
    this.suppressBlurClose = true;
    window.clearTimeout(this.interactionResetTimer);
    // Clear the guard if a browser cancels the click, drag, or focus sequence.
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.interactionResetTimer = window.setTimeout(() => {
      this.suppressBlurClose = false;
      this.interactionResetTimer = null;
    }, duration);
  }

  handleResultsClick() {
    this.releaseResultsInteraction();
  }

  releaseResultsInteraction() {
    window.clearTimeout(this.interactionResetTimer);
    this.interactionResetTimer = null;
    this.suppressBlurClose = false;
  }

  handleSelect(event) {
    const path = event.currentTarget.dataset.apiName;
    const field = this.allFields.find((item) => item.path === path) || null;
    this.commitField(path, field);
  }

  handleBrowseRelationship(event) {
    const key = event.currentTarget.dataset.key;
    const relationship = this.relationshipFields.find(
      (item) => item.key === key
    );
    this.browseRelationship(relationship);
  }

  browseRelationship(relationship) {
    if (!relationship) {
      return;
    }
    this.browseStack = [
      ...this.browseStack,
      {
        path: relationship.path,
        label: relationship.label,
        objectApiName: relationship.objectApiName
      }
    ];
    this.query = "";
    this.activeIndex = -1;
    this.resetVisibleResults();
    this.objectInfoError = null;
    this.popoverState = createPopoverState();
  }

  handleBreadcrumb(event) {
    const depth = Number(
      event.detail?.depth ?? event.currentTarget?.dataset?.depth
    );
    this.browseStack = this.browseStack.slice(0, depth);
    this.query = "";
    this.activeIndex = -1;
    this.resetVisibleResults();
    this.objectInfoError = null;
    this.popoverState = createPopoverState();
  }

  handleMoveUp(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.moveField(index, index - 1);
  }

  handleMoveDown(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.moveField(index, index + 1);
  }

  handleOrderedRemove(event) {
    const apiName = event.currentTarget.dataset.apiName;
    const field = this.descriptorForPath(apiName) || null;
    this.commitField(apiName, field);
  }

  handleOrderDragStart(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (this._values.length < 2 || !Number.isInteger(index)) {
      event.preventDefault();
      return;
    }
    this.beginDragInteraction();
    this.draggedFieldIndex = index;
    this.dragOverFieldIndex = -1;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    }
  }

  handleDragHandleKeydown(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveField(index, index - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveField(index, index + 1);
    }
  }

  handleOrderDragOver(event) {
    if (this.draggedFieldIndex < 0) {
      return;
    }
    event.preventDefault();
    const index = Number(event.currentTarget.dataset.index);
    if (Number.isInteger(index) && index !== this.dragOverFieldIndex) {
      this.dragOverFieldIndex = index;
    }
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  handleOrderDrop(event) {
    event.preventDefault();
    const targetIndex = Number(event.currentTarget.dataset.index);
    let sourceIndex = this.draggedFieldIndex;
    if (sourceIndex < 0 && event.dataTransfer) {
      sourceIndex = Number(event.dataTransfer.getData("text/plain"));
    }
    this.moveField(sourceIndex, targetIndex);
    this.resetDragState();
    this.finishDragInteraction();
  }

  handleOrderDragEnd() {
    this.resetDragState();
    this.finishDragInteraction();
  }

  beginDragInteraction() {
    this.suppressBlurClose = true;
    window.clearTimeout(this.interactionResetTimer);
    this.interactionResetTimer = null;
  }

  finishDragInteraction() {
    // Dragend can emit a final targetless blur. Hold the guard while focus is
    // returned to the stable search input, then restore outside-click closing.
    this.holdBlurClose(500);
    Promise.resolve().then(() => {
      this.template.querySelector("lightning-input")?.focus();
    });
  }

  resetDragState() {
    this.draggedFieldIndex = -1;
    this.dragOverFieldIndex = -1;
  }

  moveField(fromIndex, toIndex) {
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= this._values.length ||
      toIndex >= this._values.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const nextValues = [...this._values];
    const [movedField] = nextValues.splice(fromIndex, 1);
    nextValues.splice(toIndex, 0, movedField);
    this._values = nextValues;
    this._value = JSON.stringify(nextValues);
    this.query = "";
    const field = this.descriptorForPath(movedField) || null;
    this.reorderAnnouncement = `${field?.label || movedField} moved to position ${toIndex + 1}.`;
    this.dispatchCurrentValue(field);
  }

  commitField(apiName, field) {
    if (field) {
      this.fieldDescriptorCache = {
        ...this.fieldDescriptorCache,
        [apiName]: { ...field, path: apiName }
      };
    }
    if (this._multiple) {
      this._values = this._values.includes(apiName)
        ? this._values.filter((value) => value !== apiName)
        : [...this._values, apiName];
      this._value = this._values.length ? JSON.stringify(this._values) : null;
      this.query = "";
      this.isOpen = true;
    } else {
      this._values = [apiName];
      this._value = apiName;
      this.query = field?.label || apiName;
      this.isOpen = false;
      this.browseStack = [];
      this.resetPopoverPosition();
    }
    this.clearValidityAfterRender();
    this.dispatchCurrentValue(field);
  }

  dispatchCurrentValue(field) {
    if (this.propertyName) {
      this.dispatchEvent(
        this._value
          ? createInputValueChangedEvent(
              this.propertyName,
              this._value,
              "String"
            )
          : createInputValueDeletedEvent(this.propertyName)
      );
    }
    this.dispatchFieldChange(this._value, field);
  }

  clearValidityAfterRender() {
    Promise.resolve().then(() => {
      const input = this.template.querySelector("lightning-input");
      if (input) {
        input.setCustomValidity("");
        input.reportValidity();
      }
    });
  }

  handleClear(event) {
    this.clearSelection(event, false);
  }

  handleClearAll(event) {
    this.clearSelection(event, true);
  }

  clearSelection(event, keepOpen) {
    event?.stopPropagation();
    this._value = null;
    this._values = [];
    this.query = "";
    this.isOpen = keepOpen;
    if (!keepOpen) {
      this.browseStack = [];
      this.resetPopoverPosition();
    }
    if (this.propertyName) {
      this.dispatchEvent(createInputValueDeletedEvent(this.propertyName));
    }
    this.dispatchFieldChange(null, null);
  }

  handleClose() {
    this.closePicker();
  }

  handleFocusOut(event) {
    if (this.ignoreNextFocusOut) {
      this.ignoreNextFocusOut = false;
      window.clearTimeout(this.editTransitionTimer);
      this.editTransitionTimer = null;
      return;
    }
    if (this.suppressBlurClose) {
      return;
    }
    if (focusRemainsInside(this.template, event.relatedTarget)) {
      return;
    }
    window.clearTimeout(this.focusOutTimer);
    // Flow Builder can retarget focus across synthetic shadow boundaries.
    // Defer only genuine outside blurs so their pointer sequence can settle.
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.focusOutTimer = window.setTimeout(() => {
      if (this.isOpen && !this.suppressBlurClose) {
        this.closePicker();
      }
    }, 100);
  }

  closePicker() {
    window.clearTimeout(this.focusOutTimer);
    this.focusOutTimer = null;
    this.ignoreNextFocusOut = false;
    window.clearTimeout(this.editTransitionTimer);
    this.editTransitionTimer = null;
    this.isOpen = false;
    this.progressiveResultsController.cancel();
    this.resultsReady = true;
    this.browseStack = [];
    this.activeIndex = -1;
    this.query = this._multiple
      ? ""
      : this.selectedField?.label || this._value || "";
    this.resetPopoverPosition();
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
      actions: this.template.querySelector(".selected-fields"),
      currentStyle: this.popoverStyle,
      state: this.popoverState
    });
    this.popoverState = positioned.state;
    this.popoverStyle = positioned.style;
  }

  resetPopoverPosition() {
    this.popoverStyle = "";
    this.popoverState = createPopoverState();
    setPopoverHostActive(this.template?.host, false);
  }

  disconnectedCallback() {
    this.selectedHydrationGeneration += 1;
    this.viewportController.disconnect();
    this.progressiveResultsController.cancel();
    window.clearTimeout(this.interactionResetTimer);
    window.clearTimeout(this.focusOutTimer);
    window.clearTimeout(this.editTransitionTimer);
    this.resetPopoverPosition();
  }

  dispatchFieldChange(newValue, field) {
    this.dispatchEvent(
      new CustomEvent("fieldchange", {
        detail: {
          name: this.propertyName,
          newValue,
          newValueDataType: "String",
          field,
          selectedValues: [...this._values],
          selectedFields: this.selectedFields
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
    const fieldError = this.selectedFieldValidationMessage;
    if (fieldError) {
      return fieldError;
    }
    return this.required && !this.hasValue ? `${this.label} is required.` : "";
  }

  get selectedFieldValidationMessage() {
    if (!this.hasValue || !this.acceptedTypes) {
      return "";
    }
    const incompatibleFields = this.selectedFields.filter(
      (field) =>
        field.dataType &&
        !isFieldTypeAccepted(field.dataType, this.acceptedTypes)
    );
    if (!incompatibleFields.length) {
      return "";
    }
    const field = incompatibleFields[0];
    const message = buildResourceCompatibilityError(
      {
        ...field,
        dataType: flowDataTypeForField(field.dataType),
        isCollection: false
      },
      {
        acceptedTypes: this.acceptedTypes,
        inputLabel: this.label,
        resourceLabel:
          field.path && field.path !== field.label
            ? `${field.label} (${field.path})`
            : field.label,
        selectionKind: "field"
      }
    );
    const additionalCount = incompatibleFields.length - 1;
    return additionalCount
      ? `${message} ${additionalCount} additional selected field${additionalCount === 1 ? " is" : "s are"} incompatible.`
      : message;
  }

  get showSelectedValidationMessage() {
    return this.showSelectedState && Boolean(this.validationMessage);
  }

  @api
  reportValidity() {
    const input = this.template.querySelector("lightning-input");
    if (input) {
      input.setCustomValidity(this.validationMessage);
      return input.reportValidity();
    }
    return !this.validationMessage;
  }
}
