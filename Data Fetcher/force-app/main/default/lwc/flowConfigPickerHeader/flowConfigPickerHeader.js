import { LightningElement, api } from "lwc";

export default class FlowConfigPickerHeader extends LightningElement {
  @api items = [];
  @api locationLabel = "Picker location";
  @api closeLabel = "Close picker";
  @api modeToggleLabel;
  @api modeToggleChecked = false;

  get showModeToggle() {
    return Boolean(this.modeToggleLabel);
  }

  get modeToggleTrackClass() {
    return `mode-toggle__track${this.modeToggleChecked ? " mode-toggle__track--checked" : ""}`;
  }

  handleNavigate(event) {
    this.dispatchEvent(
      new CustomEvent("navigate", {
        bubbles: true,
        composed: true,
        detail: { depth: Number(event.currentTarget.dataset.depth) }
      })
    );
  }

  handleClose() {
    this.dispatchEvent(
      new CustomEvent("close", { bubbles: true, composed: true })
    );
  }

  handleModeToggle() {
    this.dispatchEvent(
      new CustomEvent("modetoggle", {
        bubbles: true,
        composed: true,
        detail: { checked: !this.modeToggleChecked }
      })
    );
  }
}
