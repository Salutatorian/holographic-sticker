"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { XIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import type { Collectible } from "@/lib/collectibles";
import { cn } from "@/lib/utils";

const StickerViewer3D = dynamic(
  () =>
    import("@/components/collectibles/StickerViewer3D").then(
      (mod) => mod.StickerViewer3D,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">
          Loading 3D…
        </p>
      </div>
    ),
  },
);

type CollectibleLightboxProps = {
  item: Collectible | null;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
};

function parseHex(hex: string) {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return { r: 0, g: 0, b: 0 };
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** White ink on dark chrome, black ink on light chrome. */
function contrastInk(background: string) {
  const { r, g, b } = parseHex(background);
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.62 ? "#0a0a0a" : "#ffffff";
}

export function CollectibleLightbox({
  item,
  onClose,
  onNext,
  onPrevious,
}: CollectibleLightboxProps) {
  const reduceMotion = useReducedMotion();
  const [lightSession, setLightSession] = useState(0);
  const [chromeBg, setChromeBg] = useState("#000000");
  const wasOpen = useRef(false);

  useEffect(() => {
    if (item && !wasOpen.current) {
      setLightSession((n) => n + 1);
      setChromeBg("#000000");
    }
    wasOpen.current = Boolean(item);
  }, [item]);

  const onBackgroundChange = useCallback((hex: string) => {
    setChromeBg(hex);
  }, []);

  const ink = useMemo(() => contrastInk(chromeBg), [chromeBg]);
  const inkMuted = ink === "#ffffff" ? "rgba(255,255,255,0.7)" : "rgba(10,10,10,0.65)";
  const borderSoft =
    ink === "#ffffff" ? "rgba(255,255,255,0.15)" : "rgba(10,10,10,0.18)";
  const hoverFill =
    ink === "#ffffff" ? "hover:bg-white/10" : "hover:bg-black/10";

  return (
    <AnimatePresence>
      {item ? (
        <motion.div
          key={`${item.id}-${lightSession}`}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/88 p-3 sm:p-8"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={item.title}
        >
          <motion.div
            className="relative flex h-[min(90dvh,960px)] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] shadow-2xl"
            style={{
              backgroundColor: chromeBg,
              border: `1px solid ${borderSoft}`,
            }}
            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="flex items-center justify-between gap-4 px-5 pb-2 pt-5 sm:px-6"
              style={{ backgroundColor: chromeBg }}
            >
              <h2
                className="text-[17px] font-medium"
                style={{ color: ink }}
              >
                {item.title}
              </h2>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Close"
                className={cn(hoverFill)}
                style={{ color: inkMuted }}
                onClick={onClose}
              >
                <XIcon className="size-4" />
              </Button>
            </div>

            <div
              className="relative min-h-0 flex-1"
              style={{ backgroundColor: chromeBg }}
            >
              <StickerViewer3D
                key={`${item.id}-${lightSession}`}
                collectible={item}
                lightSession={lightSession}
                onBackgroundChange={onBackgroundChange}
                className="absolute inset-0"
              />
            </div>

            <div
              className="flex items-center justify-end px-5 py-3 sm:px-6"
              style={{ backgroundColor: chromeBg }}
            >
              <ButtonGroup>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="Previous collectible"
                  className={cn("bg-transparent", hoverFill)}
                  style={{ color: ink, borderColor: borderSoft }}
                  onClick={onPrevious}
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="Next collectible"
                  className={cn("bg-transparent", hoverFill)}
                  style={{ color: ink, borderColor: borderSoft }}
                  onClick={onNext}
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              </ButtonGroup>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
