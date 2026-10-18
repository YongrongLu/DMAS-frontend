"use client";

import { useEffect, useSyncExternalStore, type PointerEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const RESIZE_HANDLES = [
  { direction: "North", edge: "n" },
  { direction: "South", edge: "s" },
  { direction: "East", edge: "e" },
  { direction: "West", edge: "w" },
  { direction: "NorthEast", edge: "ne" },
  { direction: "NorthWest", edge: "nw" },
  { direction: "SouthEast", edge: "se" },
  { direction: "SouthWest", edge: "sw" },
] as const;

type ResizeDirection = (typeof RESIZE_HANDLES)[number]["direction"];

const subscribeToPlatform = () => () => {};
const customResizeAvailable = () => isTauri() && !/Macintosh|Mac OS X/.test(navigator.userAgent);

export function startWindowDrag(event: PointerEvent<HTMLElement>) {
  if (!isTauri() || event.defaultPrevented || event.button !== 0 || !event.isPrimary) return;
  const target = event.target;
  if (target instanceof Element && target.closest("button, a, input, textarea, select, [role='button'], [contenteditable='true']")) return;

  event.preventDefault();
  void getCurrentWindow().startDragging().catch((error: unknown) => {
    console.error("Unable to move the desktop window:", error);
  });
}

export function startBackgroundWindowDrag(event: PointerEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  // Only blank surfaces and explicit handles move the window. Text, files,
  // tool cards and controls retain their normal pointer/selection behavior.
  if (!target.matches("[data-window-drag-region]") && !target.closest("[data-window-drag-handle]")) return;
  const bounds = target.getBoundingClientRect();
  if (target.scrollHeight > target.clientHeight && event.clientX >= bounds.right - 10) return;
  if (target.scrollWidth > target.clientWidth && event.clientY >= bounds.bottom - 10) return;
  startWindowDrag(event);
}

export function WindowResizeHandles() {
  // macOS uses its native resize areas; Tao's resize-drag API is unsupported there.
  const customResize = useSyncExternalStore(subscribeToPlatform, customResizeAvailable, () => false);

  useEffect(() => {
    const desktop = isTauri();
    if (desktop) document.documentElement.dataset.desktop = "true";
  }, []);

  function startResize(event: PointerEvent<HTMLDivElement>, direction: ResizeDirection) {
    if (event.button !== 0 || !event.isPrimary || !isTauri()) return;
    event.preventDefault();
    event.stopPropagation();
    void getCurrentWindow().startResizeDragging(direction).catch((error: unknown) => {
      console.error("Unable to resize the desktop window:", error);
    });
  }

  if (!customResize) return null;

  return (
    <div className="window-resize-handles" aria-hidden="true">
      {RESIZE_HANDLES.map(({ direction, edge }) => (
        <div
          key={direction}
          className={`window-resize-handle window-resize-${edge}`}
          data-window-resize={direction}
          onPointerDown={(event) => startResize(event, direction)}
        />
      ))}
    </div>
  );
}
