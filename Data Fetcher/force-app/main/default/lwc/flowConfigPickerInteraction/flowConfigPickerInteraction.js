export function inputEventValue(event) {
  return event?.detail?.value ?? event?.currentTarget?.value ?? "";
}

export function nextActiveIndex(currentIndex, key, optionCount) {
  if (!optionCount || !["ArrowDown", "ArrowUp"].includes(key)) {
    return null;
  }
  if (key === "ArrowDown") {
    return Math.min(currentIndex + 1, optionCount - 1);
  }
  return Math.max(currentIndex - 1, 0);
}

export function isActivationKey(key) {
  return key === "Enter" || key === " ";
}

export function focusRemainsInside(template, relatedTarget) {
  return Boolean(relatedTarget && template?.contains(relatedTarget));
}
