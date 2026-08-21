import { createElement } from "lwc";
import FlowConfigPickerHeader from "c/flowConfigPickerHeader";

const ITEMS = [
  {
    key: "root",
    label: "All Resources",
    depth: 0,
    showSeparator: false,
    isCurrent: false
  },
  {
    key: "account",
    label: "Account",
    depth: 1,
    showSeparator: true,
    isCurrent: true
  }
];

describe("c-flow-config-picker-header", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders shared breadcrumbs and dispatches navigation", () => {
    const element = createElement("c-flow-config-picker-header", {
      is: FlowConfigPickerHeader
    });
    element.items = ITEMS;
    const navigate = jest.fn();
    element.addEventListener("navigate", navigate);
    document.body.appendChild(element);

    element.shadowRoot.querySelector(".breadcrumb-link").click();

    expect(
      element.shadowRoot.querySelector(".breadcrumb-current").textContent
    ).toBe("Account");
    expect(navigate.mock.calls[0][0].detail).toEqual({ depth: 0 });
  });

  it("dispatches a shared close event", () => {
    const element = createElement("c-flow-config-picker-header", {
      is: FlowConfigPickerHeader
    });
    element.items = ITEMS;
    const close = jest.fn();
    element.addEventListener("close", close);
    document.body.appendChild(element);

    element.shadowRoot.querySelector("lightning-button-icon").click();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("renders an accessible mode switch and dispatches its next state", () => {
    const element = createElement("c-flow-config-picker-header", {
      is: FlowConfigPickerHeader
    });
    element.items = ITEMS;
    element.modeToggleLabel = "Custom value";
    element.modeToggleChecked = false;
    const modeToggle = jest.fn();
    element.addEventListener("modetoggle", modeToggle);
    document.body.appendChild(element);

    const toggle = element.shadowRoot.querySelector('[role="switch"]');
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    toggle.click();

    expect(modeToggle.mock.calls[0][0].detail).toEqual({ checked: true });
  });
});
