import { LightningElement, api } from "lwc";
import {
  createInputValueChangedEvent,
  createInputValueDeletedEvent
} from "c/flowConfigEditorUtils";
import {
  buildPickerBreadcrumbs,
  createPopoverViewportController,
  createProgressiveRenderController,
  createPopoverState,
  positionAnchoredPopover,
  setPopoverHostActive
} from "c/flowConfigPopoverUtils";
import { listObjects } from "c/flowConfigSchemaService";
import {
  focusRemainsInside,
  inputEventValue,
  isActivationKey,
  nextActiveIndex
} from "c/flowConfigPickerInteraction";
import {
  filterPreparedObjects,
  prepareObjects,
  normalizeObjectDescriptor
} from "c/flowConfigObjectModel";

export default class FlowConfigObjectPicker extends LightningElement {
  @api label = "Object";
  @api propertyName;
  @api placeholder = "Search object label or API name…";
  @api fieldLevelHelp;
  @api required = false;
  @api maxResults = 200;
  _value = null;
  _availableObjectTypes = [];
  _queryableOnly = false;
  _showAll = false;
  objects = [];
  loadError;
  isLoading = true;
  query = "";
  isOpen = false;
  activeIndex = -1;
  visibleResultCount = null;
  matchingObjectsCache = null;
  customValidityMessage = "";
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

  connectedCallback() {
    this.loadObjects();
  }

  renderedCallback() {
    this.viewportController.setActive(this.isOpen);
    if (this.isOpen) {
      this.updatePopoverPosition();
    }
  }

  async loadObjects() {
    this.isLoading = true;
    try {
      this.objects = prepareObjects(await listObjects());
      this.matchingObjectsCache = null;
      this.loadError = null;
    } catch (error) {
      this.objects = [];
      this.loadError = error;
    } finally {
      this.isLoading = false;
    }
  }

  @api
  get value() {
    return this._value;
  }
  set value(value) {
    this._value = value || null;
    if (!this.isOpen) {
      this.query = this.selectedObject?.label || this._value || "";
    }
  }

  @api
  get availableObjectTypes() {
    return this._availableObjectTypes;
  }
  set availableObjectTypes(value) {
    const values = Array.isArray(value)
      ? value
      : String(value || "")
          .split(",")
          .map((item) => item.trim());
    this._availableObjectTypes = values.filter(
      (item) => item && item.toLowerCase() !== "all"
    );
    this.resetVisibleResults();
  }

  @api
  get queryableOnly() {
    return this._queryableOnly;
  }
  set queryableOnly(value) {
    this._queryableOnly = value === true || value === "true";
    this.resetVisibleResults();
  }

  @api
  get showAll() {
    return this._showAll;
  }
  set showAll(value) {
    this._showAll = value === true || value === "true";
    this.resetVisibleResults();
  }

  get allowedObjectNames() {
    return new Set(
      this._availableObjectTypes.map((item) => item.toLowerCase())
    );
  }

  get resultBatchSize() {
    return Math.max(1, Number(this.maxResults) || 200);
  }

  get matchingObjects() {
    if (!this.matchingObjectsCache) {
      this.matchingObjectsCache = filterPreparedObjects(this.objects, {
        query: this.query,
        allowedObjectNames: this.allowedObjectNames,
        queryableOnly: this._queryableOnly,
        showAll: this._showAll,
        maxResults: Math.max(1, this.objects.length)
      });
    }
    return this.matchingObjectsCache;
  }

  get filteredObjects() {
    const visibleResultCount = this.visibleResultCount || this.resultBatchSize;
    return this.matchingObjects
      .slice(0, visibleResultCount)
      .map((object, index) => ({
        ...object,
        key: object.apiName,
        iconName: "standard:record",
        meta: object.apiName,
        isSelected: object.apiName === this._value,
        optionClass:
          index === this.activeIndex ? "result result--active" : "result"
      }));
  }

  get objectGroups() {
    const standard = [];
    const custom = [];
    this.filteredObjects.forEach((object) => {
      (object.isCustom ? custom : standard).push(object);
    });
    return [
      { key: "standard", label: "Standard Objects", objects: standard },
      { key: "custom", label: "Custom Objects", objects: custom }
    ].filter((group) => group.objects.length);
  }

  get selectedObject() {
    const selected = this.objects.find(
      (object) => object.apiName === this._value
    );
    return selected ? normalizeObjectDescriptor(selected) : null;
  }

  get selectedLabel() {
    return this.selectedObject?.label || this._value;
  }

  get selectedMeta() {
    return this.selectedLabel !== this._value ? this._value : null;
  }

  get hasValue() {
    return Boolean(this._value);
  }

  get showSelectedState() {
    return this.hasValue && !this.isOpen;
  }

  get showResults() {
    return this.isOpen;
  }

  get hasHelpText() {
    return Boolean(this.fieldLevelHelp);
  }

  get hasResults() {
    return this.resultsReady && this.filteredObjects.length > 0;
  }

  get showResultsLoading() {
    return !this.resultsReady;
  }

  get breadcrumbItems() {
    return buildPickerBreadcrumbs("All Objects");
  }

  get noResultsMessage() {
    if (this.isLoading) {
      return "Loading available objects…";
    }
    if (this.loadError) {
      return "Objects could not be loaded.";
    }
    return "No objects match this search and filter.";
  }

  handleFocus() {
    const wasOpen = this.isOpen;
    this.isOpen = true;
    this.activeIndex = -1;
    if (this._value) {
      this.query = "";
    }
    this.resetVisibleResults();
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
    this.isOpen = true;
    this.activeIndex = -1;
    this.resetVisibleResults();
  }

  handleKeydown(event) {
    if (event.key === "Escape") {
      this.closePicker();
      return;
    }
    const nextIndex = nextActiveIndex(
      this.activeIndex,
      event.key,
      this.filteredObjects.length
    );
    if (nextIndex !== null) {
      event.preventDefault();
      this.activeIndex = nextIndex;
    } else if (event.key === "Enter" && this.activeIndex >= 0) {
      event.preventDefault();
      this.commitObject(this.filteredObjects[this.activeIndex]);
    }
  }

  handleEdit() {
    this.beginEditTransition();
    const wasOpen = this.isOpen;
    this.isOpen = true;
    this.query = "";
    this.activeIndex = -1;
    this.resetVisibleResults();
    if (!wasOpen) {
      this.scheduleResultsAfterPaint();
    }
    Promise.resolve().then(() => {
      this.template.querySelector("lightning-input")?.focus();
    });
  }

  handleSelectionKeydown(event) {
    if (isActivationKey(event.key)) {
      event.preventDefault();
      this.handleEdit();
    }
  }

  beginEditTransition() {
    this.ignoreNextFocusOut = true;
    this.holdBlurClose(1000);
    window.clearTimeout(this.editTransitionTimer);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.editTransitionTimer = window.setTimeout(() => {
      this.ignoreNextFocusOut = false;
      this.editTransitionTimer = null;
    }, 1000);
  }

  handleResultsMouseDown(event) {
    this.holdBlurClose(500);
    event.preventDefault();
  }

  holdBlurClose(duration) {
    this.suppressBlurClose = true;
    window.clearTimeout(this.interactionResetTimer);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.interactionResetTimer = window.setTimeout(() => {
      this.suppressBlurClose = false;
      this.interactionResetTimer = null;
    }, duration);
  }

  handleResultsClick() {
    window.clearTimeout(this.interactionResetTimer);
    this.interactionResetTimer = null;
    this.suppressBlurClose = false;
  }

  handleSelect(event) {
    const apiName = event.currentTarget.dataset.apiName;
    this.commitObject(
      this.filteredObjects.find((object) => object.apiName === apiName)
    );
  }

  handleShowAllToggle(event) {
    event.stopPropagation();
    this._showAll = Boolean(event.detail?.checked);
    this.activeIndex = -1;
    this.resetVisibleResults();
    this.popoverState = createPopoverState();
    this.dispatchEvent(
      new CustomEvent("filterchange", {
        detail: { showAll: this._showAll }
      })
    );
  }

  handleResultsScroll(event) {
    const scrollArea = event.currentTarget;
    const distanceFromBottom =
      scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight;
    const visibleResultCount = this.visibleResultCount || this.resultBatchSize;
    if (
      distanceFromBottom <= 24 &&
      visibleResultCount < this.matchingObjects.length
    ) {
      this.visibleResultCount = visibleResultCount + this.resultBatchSize;
    }
  }

  resetVisibleResults() {
    this.visibleResultCount = null;
    this.matchingObjectsCache = null;
  }

  commitObject(object) {
    if (!object) {
      return;
    }
    this._value = object.apiName;
    this.query = object.label || object.apiName;
    this.isOpen = false;
    this.activeIndex = -1;
    this.resetPopoverPosition();
    this.clearValidityAfterRender();
    if (this.propertyName) {
      this.dispatchEvent(
        createInputValueChangedEvent(this.propertyName, this._value, "String")
      );
    }
    this.dispatchObjectChange(object);
  }

  handleClear(event) {
    event?.stopPropagation();
    this._value = null;
    this.query = "";
    this.isOpen = false;
    this.activeIndex = -1;
    this.resetPopoverPosition();
    if (this.propertyName) {
      this.dispatchEvent(createInputValueDeletedEvent(this.propertyName));
    }
    this.dispatchObjectChange(null);
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

  dispatchObjectChange(object) {
    this.dispatchEvent(
      new CustomEvent("objectchange", {
        detail: {
          name: this.propertyName,
          newValue: this._value,
          newValueDataType: "String",
          object,
          objectType: this._value
        }
      })
    );
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
    if (
      this.suppressBlurClose ||
      focusRemainsInside(this.template, event.relatedTarget)
    ) {
      return;
    }
    window.clearTimeout(this.focusOutTimer);
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
    this.isOpen = false;
    this.progressiveResultsController.cancel();
    this.resultsReady = true;
    this.activeIndex = -1;
    this.query = this.selectedLabel || this._value || "";
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
    this.viewportController.disconnect();
    this.progressiveResultsController.cancel();
    window.clearTimeout(this.interactionResetTimer);
    window.clearTimeout(this.focusOutTimer);
    window.clearTimeout(this.editTransitionTimer);
    this.resetPopoverPosition();
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
    return this.required && !this.hasValue ? `${this.label} is required.` : "";
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
      return typeof reported === "boolean" ? reported : !this.validationMessage;
    }
    return !this.validationMessage;
  }
}
