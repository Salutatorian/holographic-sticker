"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { DownloadIcon, SparklesIcon, XIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type {
  StickerExportQuality,
  StickerViewerExportApi,
} from "@/components/collectibles/StickerViewer3D";
import { Button } from "@/components/ui/button";
import type { Collectible } from "@/lib/collectibles";
import {
  bakeLogoStickerClient,
  type ClientBakeResult,
} from "@/lib/collectibles/client-bake-logo";
import { cn } from "@/lib/utils";

const StickerViewer3D = dynamic(
  () =>
    import("@/components/collectibles/StickerViewer3D").then(
      (mod) => mod.StickerViewer3D,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[320px] items-center justify-center text-[11px] uppercase tracking-[0.16em] text-white/40 sm:min-h-[420px]">
        Loading 3D…
      </div>
    ),
  },
);

type CollectibleTryItProps = {
  open: boolean;
  onClose: () => void;
};

const QUALITY_OPTIONS: { id: StickerExportQuality; label: string }[] = [
  { id: "1x", label: "1×" },
  { id: "2x", label: "2×" },
  { id: "3x", label: "3×" },
];

export function CollectibleTryIt({ open, onClose }: CollectibleTryItProps) {
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const exportApiRef = useRef<StickerViewerExportApi | null>(null);
  const bakeRef = useRef<ClientBakeResult | null>(null);

  const [bake, setBake] = useState<ClientBakeResult | null>(null);
  const [fileName, setFileName] = useState("Your sticker");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [quality, setQuality] = useState<StickerExportQuality>("2x");
  const [lightSession, setLightSession] = useState(0);

  const revokeBake = useCallback(() => {
    bakeRef.current?.revoke();
    bakeRef.current = null;
    setBake(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    revokeBake();
    setStatus(null);
    setBusy(false);
    setExporting(false);
  }, [open, revokeBake]);

  useEffect(() => {
    return () => {
      bakeRef.current?.revoke();
    };
  }, []);

  const collectible = useMemo<Collectible>(
    () => ({
      id: "try-it-local",
      title: fileName,
      subtitle: "Local demo — not saved",
      year: String(new Date().getFullYear()),
      backgroundColor: "#000000",
      modelPath: "",
      finishLabel: "Holo Foil",
    }),
    [fileName],
  );

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setStatus("Please choose an image (PNG, JPG, or WebP).");
      return;
    }

    setBusy(true);
    setStatus("Working in your browser… nothing is uploaded.");
    revokeBake();

    try {
      const title = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
      setFileName(title.trim() || "Your sticker");
      const result = await bakeLogoStickerClient(file, {
        onProgress: (message) => setStatus(message),
      });
      bakeRef.current = result;
      setBake(result);
      setLightSession((n) => n + 1);
      setStatus("Ready — drag to spin. Export uses a fixed pretty light.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not process that image.",
      );
    } finally {
      setBusy(false);
    }
  };

  const onExport = async () => {
    if (!exportApiRef.current) return;
    setExporting(true);
    setStatus("Exporting front view with hero lighting…");
    try {
      await exportApiRef.current.exportPng(quality);
      setStatus(`Saved PNG at ${quality} — still only on your device.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Export failed. Try again.",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/88 p-3 sm:p-8"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Try your own holographic sticker"
            className="relative flex h-full max-h-[920px] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl"
            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">
                  Local playground
                </p>
                <h2 className="truncate text-[16px] font-medium text-white">
                  Try it here
                </h2>
                <p className="mt-0.5 text-[12px] text-white/45">
                  Runs in your browser only. We never save your photo.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-white/70 hover:bg-white/10 hover:text-white"
                onClick={onClose}
                aria-label="Close"
              >
                <XIcon className="size-4" />
              </Button>
            </header>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="relative min-h-[320px] bg-black sm:min-h-[420px]">
                {bake ? (
                  <StickerViewer3D
                    collectible={collectible}
                    clientAssets={bake}
                    lightSession={lightSession}
                    exportApiRef={exportApiRef}
                    hideSettings={false}
                    className="h-full min-h-[320px] sm:min-h-[420px]"
                  />
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => inputRef.current?.click()}
                    className={cn(
                      "flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-3 px-6 text-center sm:min-h-[420px]",
                      "text-white/55 transition hover:bg-white/[0.03] hover:text-white/75",
                      busy && "pointer-events-none opacity-60",
                    )}
                  >
                    <SparklesIcon className="size-8 opacity-70" />
                    <span className="text-[15px] font-medium text-white/80">
                      {busy ? "Baking holo maps…" : "Drop or choose any photo"}
                    </span>
                    <span className="max-w-sm text-[12px] leading-relaxed text-white/40">
                      Logo-style cutout with padding. PNG / JPG / WebP. Stays on
                      this device.
                    </span>
                  </button>
                )}
              </div>

              <aside className="flex flex-col gap-4 border-t border-white/10 p-4 lg:border-l lg:border-t-0">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void processFile(file);
                  }}
                />

                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || exporting}
                  className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                  onClick={() => inputRef.current?.click()}
                >
                  {bake ? "Choose another photo" : "Choose a photo"}
                </Button>

                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">
                    Export quality
                  </p>
                  <div className="mt-2 flex gap-2">
                    {QUALITY_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        disabled={!bake || busy || exporting}
                        onClick={() => setQuality(option.id)}
                        className={cn(
                          "flex-1 rounded-lg border px-2 py-1.5 text-[12px] transition",
                          quality === option.id
                            ? "border-white/35 bg-white/15 text-white"
                            : "border-white/10 text-white/55 hover:border-white/20",
                          (!bake || busy || exporting) && "opacity-40",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-white/35">
                    Front view, hero light (never blinding). Higher = larger PNG.
                  </p>
                </div>

                <Button
                  type="button"
                  disabled={!bake || busy || exporting}
                  onClick={() => void onExport()}
                  className="gap-2"
                >
                  <DownloadIcon className="size-4" />
                  {exporting ? "Exporting…" : "Export PNG"}
                </Button>

                {status ? (
                  <p className="text-[12px] leading-relaxed text-white/50">
                    {status}
                  </p>
                ) : null}

                <p className="mt-auto text-[11px] leading-relaxed text-white/30">
                  Demo only — not published to the gallery and not stored on our
                  servers.
                </p>
              </aside>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
