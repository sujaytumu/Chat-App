import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBackToClose } from "../lib/useBackToClose";

// Full-screen viewer for a "view once" photo.
//
// What it does so the picture stays private:
//  - the photo is drawn onto a <canvas> (there is no <img> to long-press, drag or "Save image as"),
//    and its temporary in-memory address is thrown away straight after drawing;
//  - no download button, no zoom/gallery, no right-click, drag, select, copy or print;
//  - in the Android app the whole window is marked secure while this is open, so the system itself
//    blocks screenshots and screen recording and hides the picture in the recent-apps preview;
//  - in a browser, the picture is hidden the moment the tab/window loses focus or a screenshot
//    shortcut is pressed (PrintScreen, Win+Shift+S, Cmd+Shift+3/4/5).
// A browser can never fully stop a screenshot (or a photo of the screen); only the Android app can.

const secureScreen = () => (window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.PrivacyScreen : null);

const ViewOnceViewer = ({ src, onClose }) => {
  useBackToClose(!!src, onClose);

  const canvasRef = useRef(null);
  const coverTimer = useRef(null);
  const uncoverRef = useRef(() => {});
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState(false); // covered because focus was lost / a screenshot key was pressed

  // Draw the picture, then forget its address so it can't be fetched again.
  useEffect(() => {
    if (!src) return;
    let dead = false;
    const canvas = canvasRef.current;
    setReady(false);
    setFailed(false);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (dead) return;
      const c = canvas;
      if (!c) return;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      URL.revokeObjectURL(src);
      img.src = "";
      setReady(true);
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      if (!dead) setFailed(true);
    };
    img.src = src;
    return () => {
      dead = true;
      URL.revokeObjectURL(src);
      if (canvas) {
        canvas.width = 0; // wipe the pixels
        canvas.height = 0;
      }
    };
  }, [src]);

  // Android app: ask the system to block screenshots / screen recording while this is open.
  useEffect(() => {
    if (!src) return;
    const plugin = secureScreen();
    try {
      plugin?.enable?.()?.catch?.(() => {});
    } catch {
      /* older app build without the plugin */
    }
    return () => {
      try {
        plugin?.disable?.()?.catch?.(() => {});
      } catch {
        /* ignore */
      }
    };
  }, [src]);

  // Browser: hide the picture whenever the page isn't clearly in front, and on screenshot shortcuts.
  useEffect(() => {
    if (!src) return;
    const cover = (ms = 0) => {
      clearTimeout(coverTimer.current);
      setHidden(true);
      if (ms) {
        coverTimer.current = setTimeout(() => {
          if (document.visibilityState === "visible" && document.hasFocus()) setHidden(false);
        }, ms);
      }
    };
    // A focus / visible event is itself proof the page is back in front (document.hasFocus() can be
    // wrong inside an app WebView, so it is only used for the short timed cover above).
    const uncover = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(coverTimer.current);
        setHidden(false);
      }
    };
    const onVisibility = () => (document.visibilityState === "visible" ? uncover() : cover());
    const onBlur = () => cover();
    const onPageHide = () => cover();
    const onKeyDown = (e) => {
      const k = (e.key || "").toLowerCase();
      const meta = e.metaKey || e.ctrlKey;
      if (k === "printscreen" || (e.metaKey && e.shiftKey && ["3", "4", "5", "s"].includes(k)) || (e.metaKey && e.shiftKey && ["#", "$", "%"].includes(e.key))) {
        cover(2500);
        navigator.clipboard?.writeText?.("")?.catch?.(() => {});
      }
      if (meta && ["s", "p", "c", "x", "a", "u"].includes(k)) e.preventDefault(); // save / print / copy / view-source
      if (e.key === "Escape") onClose();
    };
    const onKeyUp = (e) => {
      if ((e.key || "").toLowerCase() === "printscreen") {
        cover(2500);
        navigator.clipboard?.writeText?.("")?.catch?.(() => {});
      }
    };
    uncoverRef.current = uncover;
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", uncover);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    const blockMenu = (e) => e.preventDefault();
    document.addEventListener("contextmenu", blockMenu, true);
    document.addEventListener("dragstart", blockMenu, true);
    document.addEventListener("copy", blockMenu, true);
    return () => {
      clearTimeout(coverTimer.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", uncover);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("contextmenu", blockMenu, true);
      document.removeEventListener("dragstart", blockMenu, true);
      document.removeEventListener("copy", blockMenu, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  if (!src) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] bg-black flex items-center justify-center select-none"
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
      onClick={() => (hidden ? uncoverRef.current() : onClose())} // a tap while covered brings the photo back
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* nothing at all is printed from here */}
      <style>{"@media print{body *{visibility:hidden!important}}"}</style>

      <div className="absolute top-0 inset-x-0 z-10 flex items-center gap-2 px-3 pt-[calc(10px+env(safe-area-inset-top))] pb-6 bg-gradient-to-b from-black/60 to-transparent">
        <span className="flex items-center gap-2 text-white/90 text-[13px] pl-1">
          <span className="size-[22px] shrink-0 rounded-full border-[1.5px] border-dashed border-current flex items-center justify-center text-[10.5px] font-semibold leading-none">1</span>
          View once
        </span>
        <span className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="size-10 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/60 text-white"
          aria-label="Close"
        >
          <X size={22} />
        </button>
      </div>

      <div className="w-full h-full flex items-center justify-center p-3" onClick={(e) => (hidden ? uncoverRef.current() : e.stopPropagation())}>
        {failed ? (
          <p className="text-white/80 text-[14px]">Couldn&apos;t show this photo</p>
        ) : (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="View once photo"
            onContextMenu={(e) => e.preventDefault()}
            className="max-w-full max-h-full object-contain pointer-events-none"
            style={{ visibility: hidden || !ready ? "hidden" : "visible", WebkitTouchCallout: "none" }}
          />
        )}
        {hidden && !failed && <p className="absolute text-white/70 text-[14px] px-8 text-center">Photo hidden — return to this screen to keep viewing</p>}
      </div>
    </div>,
    document.body
  );
};

export default ViewOnceViewer;
