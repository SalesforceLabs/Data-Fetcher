import {
  createPopoverViewportController,
  createProgressiveRenderController,
  createPopoverState,
  positionAnchoredPopover
} from "c/flowConfigPopoverUtils";

function elementWithRect(rect, scrollHeight = 0) {
  return {
    scrollHeight,
    getBoundingClientRect: () => rect
  };
}

describe("flowConfigPopoverUtils", () => {
  it("opens above the anchor and grows for a wrapped breadcrumb header", () => {
    const anchor = elementWithRect({
      left: 100,
      top: 600,
      bottom: 640,
      width: 400
    });
    const popover = elementWithRect({ width: 0 });
    const header = elementWithRect({ height: 72 }, 72);
    const scrollArea = elementWithRect({}, 500);

    const positioned = positionAnchoredPopover({
      anchor,
      popover,
      header,
      scrollArea,
      viewportWidth: 1000,
      viewportHeight: 700
    });

    expect(positioned.state.openAbove).toBe(true);
    expect(positioned.style).toContain("height:416px");
    expect(positioned.style).toContain("top:180px");
  });

  it("adds an actions panel above the normal results height when space permits", () => {
    const positioned = positionAnchoredPopover({
      anchor: elementWithRect({
        left: 100,
        top: 700,
        bottom: 740,
        width: 400
      }),
      popover: elementWithRect({ width: 0 }),
      header: elementWithRect({ height: 36 }, 36),
      scrollArea: elementWithRect({}, 500),
      actions: elementWithRect({ height: 160 }, 160),
      viewportWidth: 1000,
      viewportHeight: 900
    });

    expect(positioned.state.openAbove).toBe(true);
    expect(positioned.style).toContain("height:540px");
    expect(positioned.style).toContain("top:156px");
  });

  it("still clamps an expanded actions panel to available viewport space", () => {
    const positioned = positionAnchoredPopover({
      anchor: elementWithRect({
        left: 100,
        top: 430,
        bottom: 470,
        width: 400
      }),
      popover: elementWithRect({ width: 0 }),
      header: elementWithRect({ height: 36 }, 36),
      scrollArea: elementWithRect({}, 500),
      actions: elementWithRect({ height: 160 }, 160),
      viewportWidth: 1000,
      viewportHeight: 600
    });

    expect(positioned.state.openAbove).toBe(true);
    expect(positioned.style).toContain("height:422px");
    expect(positioned.style).toContain("top:8px");
  });

  it("corrects fixed positioning inside a transformed Flow Builder panel", () => {
    const anchor = elementWithRect({
      left: 300,
      top: 500,
      bottom: 540,
      width: 320
    });
    const header = elementWithRect({ height: 36 }, 36);
    const scrollArea = elementWithRect({}, 200);
    const initial = positionAnchoredPopover({
      anchor,
      popover: elementWithRect({ width: 0 }),
      header,
      scrollArea,
      viewportWidth: 1000,
      viewportHeight: 800,
      state: createPopoverState()
    });
    const renderedInTransformedPanel = elementWithRect({
      left: 40,
      top: 30,
      width: 300
    });

    const corrected = positionAnchoredPopover({
      anchor,
      popover: renderedInTransformedPanel,
      header,
      scrollArea,
      viewportWidth: 1000,
      viewportHeight: 800,
      currentStyle: initial.style,
      state: initial.state
    });

    expect(corrected.style).toBe("");
    expect(corrected.state.correctionPasses).toBe(1);
    expect(corrected.state.correctionX).not.toBe(0);
    expect(corrected.state.correctionY).not.toBe(0);
    expect(corrected.state.widthCorrection).toBe(20);
  });

  it("listens only while active and coalesces viewport work by frame", () => {
    const frames = [];
    window.requestAnimationFrame = jest.fn((callback) => {
      frames.push(callback);
      return frames.length;
    });
    window.cancelAnimationFrame = jest.fn();
    const handler = jest.fn();
    const controller = createPopoverViewportController(handler);

    window.dispatchEvent(new CustomEvent("resize"));
    expect(frames).toHaveLength(0);
    controller.setActive(true);
    window.dispatchEvent(new CustomEvent("resize"));
    window.dispatchEvent(new CustomEvent("scroll"));
    expect(frames).toHaveLength(1);
    frames.shift()();
    expect(handler).toHaveBeenCalledTimes(1);

    controller.disconnect();
    window.dispatchEvent(new CustomEvent("resize"));
    expect(frames).toHaveLength(0);
  });

  it("waits two frames before deriving picker results", () => {
    const frames = [];
    window.requestAnimationFrame = jest.fn((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const onReady = jest.fn();
    const controller = createProgressiveRenderController(onReady);

    controller.schedule();
    expect(onReady).not.toHaveBeenCalled();
    frames.shift()();
    expect(onReady).not.toHaveBeenCalled();
    frames.shift()();
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});
