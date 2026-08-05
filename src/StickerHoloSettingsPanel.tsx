"use client";

import type { ReactNode } from "react";
import { Settings2Icon, RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BackdropColorField } from "@/components/collectibles/sticker/BackdropColorField";
import {
  DEFAULT_HOLO_PLAY_SETTINGS,
  HOLO_PATTERN_MODES,
  type HoloPlaySettings,
} from "@/components/collectibles/sticker/holoSettings";

type StickerHoloSettingsPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: HoloPlaySettings;
  onChange: (next: HoloPlaySettings) => void;
  onRerollLight: () => void;
  className?: string;
};

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1">
      <span className="text-[10px] uppercase tracking-[0.12em] text-white/50">
        {label}
      </span>
      <span className="text-[10px] tabular-nums text-white/40">
        {value.toFixed(step < 0.1 ? 2 : step < 1 ? 2 : 0)}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="col-span-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
      />
    </label>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/35">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function StickerHoloSettingsPanel({
  open,
  onOpenChange,
  settings,
  onChange,
  onRerollLight,
  className,
}: StickerHoloSettingsPanelProps) {
  const patch = (partial: Partial<HoloPlaySettings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div
      className={cn(
        "pointer-events-none absolute right-3 top-3 z-30 flex flex-col items-end gap-2",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close foil settings" : "Open foil settings"}
        onClick={() => onOpenChange(!open)}
        className="pointer-events-auto inline-flex size-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white/75 backdrop-blur-md transition hover:border-white/30 hover:text-white"
      >
        <Settings2Icon className="size-3.5" />
      </button>

      {open ? (
        <div className="pointer-events-auto max-h-[min(70dvh,520px)] w-[min(100vw-1.5rem,220px)] overflow-y-auto rounded-2xl border border-white/12 bg-black/70 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-white/80">Play</p>
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_HOLO_PLAY_SETTINGS })}
              className="text-[9px] uppercase tracking-[0.14em] text-white/40 transition hover:text-white/70"
            >
              Reset
            </button>
          </div>

          <div className="space-y-3">
            <Section title="Scene">
              <BackdropColorField
                value={settings.background}
                onChange={(background) => patch({ background })}
              />
              <label className="grid gap-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-white/50">
                  Interaction
                </span>
                <select
                  value={settings.interaction}
                  onChange={(event) =>
                    patch({
                      interaction: event.target
                        .value as typeof settings.interaction,
                    })
                  }
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[11px] text-white/85 outline-none"
                >
                  <option value="orbit" className="bg-black">
                    Orbit 360°
                  </option>
                  <option value="follow" className="bg-black">
                    Follow pointer
                  </option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-[10px] uppercase tracking-[0.12em] text-white/50">
                  Auto sway
                </span>
                <input
                  type="checkbox"
                  checked={settings.autoSway}
                  onChange={(event) =>
                    patch({ autoSway: event.target.checked })
                  }
                  className="size-3.5 accent-white"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-[10px] uppercase tracking-[0.12em] text-white/50">
                  Mirror back
                </span>
                <input
                  type="checkbox"
                  checked={settings.mirrorBack}
                  onChange={(event) =>
                    patch({ mirrorBack: event.target.checked })
                  }
                  className="size-3.5 accent-white"
                />
              </label>
              <SliderRow
                label="Sway speed"
                value={settings.swaySpeed}
                min={0}
                max={2.5}
                step={0.05}
                onChange={(swaySpeed) => patch({ swaySpeed })}
              />
              <button
                type="button"
                onClick={onRerollLight}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2 py-1.5 text-[9px] uppercase tracking-[0.14em] text-white/65 transition hover:border-white/30 hover:text-white"
              >
                <RotateCcwIcon className="size-3" />
                Reroll light
              </button>
            </Section>

            <Section title="Pattern">
              <label className="grid gap-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-white/50">
                  Motif
                </span>
                <select
                  value={settings.pattern}
                  onChange={(event) =>
                    patch({
                      pattern: event.target.value as typeof settings.pattern,
                    })
                  }
                  className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[11px] text-white/85 outline-none"
                >
                  {HOLO_PATTERN_MODES.map((mode) => (
                    <option key={mode.id} value={mode.id} className="bg-black">
                      {mode.label}
                    </option>
                  ))}
                </select>
              </label>
              <SliderRow
                label="Scale"
                value={settings.patternScale}
                min={0.35}
                max={2.4}
                step={0.05}
                onChange={(patternScale) => patch({ patternScale })}
              />
              <SliderRow
                label="Density"
                value={settings.patternDensity}
                min={0.25}
                max={2.4}
                step={0.05}
                onChange={(patternDensity) => patch({ patternDensity })}
              />
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <SliderRow
                    label="Seed"
                    value={settings.patternSeed}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(patternSeed) => patch({ patternSeed })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => patch({ patternSeed: Math.random() })}
                  className="mb-0.5 shrink-0 rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-white/65 transition hover:border-white/30 hover:text-white"
                >
                  Shuffle
                </button>
              </div>
            </Section>

            <Section title="Foil">
              <SliderRow
                label="Foil intensity"
                value={settings.foilIntensity}
                min={0.2}
                max={2.4}
                step={0.05}
                onChange={(foilIntensity) => patch({ foilIntensity })}
              />
              <SliderRow
                label="Color pop"
                value={settings.colorPop}
                min={0.4}
                max={2.4}
                step={0.05}
                onChange={(colorPop) => patch({ colorPop })}
              />
              <SliderRow
                label="Spectrum spin"
                value={settings.spectrumSpin}
                min={0}
                max={1}
                step={0.01}
                onChange={(spectrumSpin) => patch({ spectrumSpin })}
              />
              <SliderRow
                label="Tilt chase"
                value={settings.tiltChase}
                min={0.2}
                max={3}
                step={0.05}
                onChange={(tiltChase) => patch({ tiltChase })}
              />
              <SliderRow
                label="Edge fire"
                value={settings.edgeFire}
                min={0}
                max={1.8}
                step={0.05}
                onChange={(edgeFire) => patch({ edgeFire })}
              />
              <SliderRow
                label="Web fill"
                value={settings.webFill}
                min={0}
                max={0.6}
                step={0.02}
                onChange={(webFill) => patch({ webFill })}
              />
            </Section>

            <Section title="Shine">
              <SliderRow
                label="Sparkle"
                value={settings.sparkle}
                min={0}
                max={2.5}
                step={0.05}
                onChange={(sparkle) => patch({ sparkle })}
              />
              <SliderRow
                label="Glare"
                value={settings.glare}
                min={0}
                max={2.5}
                step={0.05}
                onChange={(glare) => patch({ glare })}
              />
              <SliderRow
                label="Bloom"
                value={settings.bloom}
                min={0}
                max={2.5}
                step={0.05}
                onChange={(bloom) => patch({ bloom })}
              />
              <SliderRow
                label="Clearcoat"
                value={settings.clearcoat}
                min={0}
                max={1}
                step={0.02}
                onChange={(clearcoat) => patch({ clearcoat })}
              />
              <SliderRow
                label="Roughness"
                value={settings.roughness}
                min={0.05}
                max={0.85}
                step={0.01}
                onChange={(roughness) => patch({ roughness })}
              />
              <SliderRow
                label="Metalness"
                value={settings.metalness}
                min={0}
                max={1}
                step={0.02}
                onChange={(metalness) => patch({ metalness })}
              />
              <SliderRow
                label="Env glow"
                value={settings.envGlow}
                min={0}
                max={1.8}
                step={0.05}
                onChange={(envGlow) => patch({ envGlow })}
              />
            </Section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
