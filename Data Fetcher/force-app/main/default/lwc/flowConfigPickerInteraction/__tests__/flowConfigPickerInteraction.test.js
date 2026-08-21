import {
  focusRemainsInside,
  inputEventValue,
  isActivationKey,
  nextActiveIndex
} from "c/flowConfigPickerInteraction";

describe("flowConfigPickerInteraction", () => {
  it("reads Lightning and native input events", () => {
    expect(inputEventValue({ detail: { value: "lightning" } })).toBe(
      "lightning"
    );
    expect(inputEventValue({ currentTarget: { value: "native" } })).toBe(
      "native"
    );
  });

  it("bounds keyboard navigation consistently", () => {
    expect(nextActiveIndex(-1, "ArrowDown", 2)).toBe(0);
    expect(nextActiveIndex(1, "ArrowDown", 2)).toBe(1);
    expect(nextActiveIndex(0, "ArrowUp", 2)).toBe(0);
    expect(nextActiveIndex(0, "Enter", 2)).toBeNull();
  });

  it("recognizes activation and internal focus transitions", () => {
    const inside = {};
    expect(isActivationKey("Enter")).toBe(true);
    expect(isActivationKey(" ")).toBe(true);
    expect(
      focusRemainsInside({ contains: (node) => node === inside }, inside)
    ).toBe(true);
  });
});
