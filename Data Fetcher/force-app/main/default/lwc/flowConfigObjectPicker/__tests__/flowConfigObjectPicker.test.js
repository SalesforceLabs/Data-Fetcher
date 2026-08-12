import { createElement } from "lwc";
import describeObjects from "@salesforce/apex/FlowConfigApexTypeController.describeObjects";
import FlowConfigObjectPicker from "c/flowConfigObjectPicker";
import { clearObjectCache } from "c/flowConfigSchemaService";
import { installImmediateAnimationFrames } from "../../../../../../test-utils/pickerTestUtils";

jest.mock(
  "@salesforce/apex/FlowConfigApexTypeController.describeObjects",
  () => ({ __esModule: true, default: jest.fn() }),
  { virtual: true }
);

const OBJECTS = [
  {
    apiName: "Account",
    label: "Account",
    labelPlural: "Accounts",
    isCustom: false,
    isQueryable: true,
    isSearchable: true
  },
  {
    apiName: "Contact",
    label: "Contact",
    labelPlural: "Contacts",
    isCustom: false,
    isQueryable: true,
    isSearchable: true
  },
  {
    apiName: "Widget__c",
    label: "Widget",
    labelPlural: "Widgets",
    isCustom: true,
    isQueryable: true
  },
  {
    apiName: "ActivityHistory",
    label: "Activity History",
    labelPlural: "Activity History",
    isCustom: false,
    isQueryable: true
  },
  {
    apiName: "AppointmentInvitationFeed",
    label: "__MISSING LABEL__ PropertyFile - val Label",
    isCustom: false,
    isQueryable: true
  }
];

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

async function createPicker(properties = {}) {
  describeObjects.mockResolvedValueOnce(OBJECTS);
  const element = createElement("c-flow-config-object-picker", {
    is: FlowConfigObjectPicker
  });
  Object.assign(element, properties);
  document.body.appendChild(element);
  await flushPromises();
  return element;
}

function searchInput(element) {
  return element.shadowRoot.querySelector("lightning-input");
}

describe("flowConfigObjectPicker", () => {
  beforeEach(() => {
    installImmediateAnimationFrames();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    clearObjectCache();
    jest.clearAllMocks();
  });

  it("restores a saved API name as a labeled selection", async () => {
    const element = await createPicker({ value: "Account" });

    expect(
      element.shadowRoot.querySelector(".selection__label").textContent
    ).toBe("Account");
    expect(element.shadowRoot.querySelector(".selection__meta")).toBeNull();
  });

  it("searches labels and API names in standard and custom groups", async () => {
    const element = await createPicker();
    searchInput(element).dispatchEvent(new CustomEvent("focus"));
    searchInput(element).dispatchEvent(
      new CustomEvent("change", { detail: { value: "widget" } })
    );
    await flushPromises();

    const headings = [
      ...element.shadowRoot.querySelectorAll(".object-group__title")
    ].map((node) => node.textContent);
    expect(headings).toEqual(["Custom Objects"]);
    expect(element.shadowRoot.querySelector(".result__label").textContent).toBe(
      "Widget"
    );
  });

  it("filters to allowed and queryable objects", async () => {
    const element = await createPicker({
      availableObjectTypes: "Account, ActivityHistory",
      queryableOnly: true
    });
    searchInput(element).dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    const options = [...element.shadowRoot.querySelectorAll(".result")];
    expect(options).toHaveLength(1);
    expect(options[0].dataset.apiName).toBe("Account");
  });

  it("shows normal objects by default and reveals all objects from the header toggle", async () => {
    const element = await createPicker();
    const filterHandler = jest.fn();
    element.addEventListener("filterchange", filterHandler);
    searchInput(element).dispatchEvent(new CustomEvent("focus"));
    await flushPromises();

    expect(
      [...element.shadowRoot.querySelectorAll(".result")].map(
        (option) => option.dataset.apiName
      )
    ).toEqual(["Account", "Contact", "Widget__c"]);

    const header = element.shadowRoot.querySelector(
      "c-flow-config-picker-header"
    );
    expect(header.modeToggleLabel).toBe("Show all objects");
    header.dispatchEvent(
      new CustomEvent("modetoggle", { detail: { checked: true } })
    );
    await flushPromises();

    expect(
      [...element.shadowRoot.querySelectorAll(".result")].map(
        (option) => option.dataset.apiName
      )
    ).toEqual([
      "Account",
      "ActivityHistory",
      "AppointmentInvitationFeed",
      "Contact",
      "Widget__c"
    ]);
    expect(
      element.shadowRoot.querySelector(
        '[data-api-name="AppointmentInvitationFeed"] .result__label'
      ).textContent
    ).toBe("AppointmentInvitationFeed");
    expect(filterHandler.mock.calls[0][0].detail).toEqual({ showAll: true });
  });

  it("loads another result batch when scrolled to the bottom", async () => {
    const manyObjects = Array.from({ length: 5 }, (_, index) => ({
      apiName: `Object${index}`,
      label: `Object ${index}`,
      isSearchable: true,
      isQueryable: true
    }));
    describeObjects.mockReset();
    describeObjects.mockResolvedValueOnce(manyObjects);
    const element = createElement("c-flow-config-object-picker", {
      is: FlowConfigObjectPicker
    });
    element.maxResults = 2;
    document.body.appendChild(element);
    await flushPromises();

    searchInput(element).dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    expect(element.shadowRoot.querySelectorAll(".result")).toHaveLength(2);

    const scrollArea = element.shadowRoot.querySelector(".results__scroll");
    Object.defineProperties(scrollArea, {
      scrollHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 100 }
    });
    scrollArea.dispatchEvent(new CustomEvent("scroll"));
    await flushPromises();

    expect(element.shadowRoot.querySelectorAll(".result")).toHaveLength(4);
  });

  it("persists a selection and emits object metadata", async () => {
    const element = await createPicker({ propertyName: "objectName" });
    const configurationHandler = jest.fn();
    const objectHandler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      configurationHandler
    );
    element.addEventListener("objectchange", objectHandler);

    searchInput(element).dispatchEvent(new CustomEvent("focus"));
    await flushPromises();
    const contact = element.shadowRoot.querySelector(
      '[data-api-name="Contact"]'
    );
    contact.click();
    await flushPromises();

    expect(configurationHandler.mock.calls[0][0].detail).toEqual({
      name: "objectName",
      newValue: "Contact",
      newValueDataType: "String"
    });
    expect(objectHandler.mock.calls[0][0].detail).toMatchObject({
      name: "objectName",
      newValue: "Contact",
      objectType: "Contact",
      object: { label: "Contact" }
    });
  });

  it("clears through the standard Flow event contract", async () => {
    const element = await createPicker({
      propertyName: "objectName",
      value: "Account"
    });
    const configurationHandler = jest.fn();
    const objectHandler = jest.fn();
    element.addEventListener(
      "configuration_editor_input_value_changed",
      configurationHandler
    );
    element.addEventListener("objectchange", objectHandler);

    element.shadowRoot.querySelector(".selection__clear").click();

    expect(configurationHandler.mock.calls[0][0].detail).toEqual({
      name: "objectName",
      newValue: null,
      newValueDataType: "String"
    });
    expect(objectHandler.mock.calls[0][0].detail).toMatchObject({
      newValue: null,
      objectType: null,
      object: null
    });
  });

  it("reports required validity for an empty selection", async () => {
    const element = await createPicker({
      label: "Object Name",
      required: true
    });
    expect(element.validationMessage).toBe("Object Name is required.");
    expect(element.reportValidity()).toBe(false);
  });
});
