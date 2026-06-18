(() => {
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function viewportBox() {
    const viewport = window.visualViewport;

    return {
      left: viewport?.offsetLeft ?? 0,
      top: viewport?.offsetTop ?? 0,
      width: viewport?.width ?? document.documentElement.clientWidth,
      height: viewport?.height ?? window.innerHeight
    };
  }

  function position(trigger, floating, options = {}) {
    if (!trigger?.isConnected || !floating) return false;

    const viewport = viewportBox();
    const margin = viewport.width <= 640 ? (options.mobileMargin ?? 12) : (options.margin ?? 18);
    const gap = options.gap ?? 12;
    const minWidth = options.minWidth ?? 220;
    const maxWidth = options.maxWidth ?? 420;

    floating.style.setProperty("--tooltip-left", "0px");
    floating.style.setProperty("--tooltip-top", "0px");
    floating.style.setProperty("--tooltip-arrow-left", "50%");
    floating.style.maxWidth = `${Math.min(maxWidth, Math.max(minWidth, viewport.width - (margin * 2)))}px`;
    floating.dataset.placement = "above";

    const anchorRect = trigger.getBoundingClientRect();
    const floatingRect = floating.getBoundingClientRect();
    const minLeft = viewport.left + margin;
    const minTop = viewport.top + margin;
    const maxLeft = Math.max(minLeft, viewport.left + viewport.width - floatingRect.width - margin);
    const maxTop = Math.max(minTop, viewport.top + viewport.height - floatingRect.height - margin);
    const anchorCenter = anchorRect.left + (anchorRect.width / 2);
    const left = clamp(anchorCenter - (floatingRect.width / 2), minLeft, maxLeft);
    const spaceAbove = anchorRect.top - minTop;
    const spaceBelow = viewport.top + viewport.height - anchorRect.bottom - margin;
    const placement = spaceAbove >= floatingRect.height + gap || spaceAbove >= spaceBelow ? "above" : "below";
    const naturalTop = placement === "above"
      ? anchorRect.top - floatingRect.height - gap
      : anchorRect.bottom + gap;
    const top = clamp(naturalTop, minTop, maxTop);
    const arrowLeft = clamp(anchorCenter - left, 16, Math.max(16, floatingRect.width - 16));

    floating.dataset.placement = placement;
    floating.style.setProperty("--tooltip-left", `${Math.round(left)}px`);
    floating.style.setProperty("--tooltip-top", `${Math.round(top)}px`);
    floating.style.setProperty("--tooltip-arrow-left", `${Math.round(arrowLeft)}px`);

    return true;
  }

  window.NexyFloating = { position };
})();
