"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const PRESETS = [
  "#000000",
  "#0b0b0f",
  "#14141c",
  "#1a1025",
  "#0c1a2e",
  "#0f1f18",
  "#2a0f14",
  "#1c1917",
  "#3f3f46",
  "#f5f5f5",
] as const;

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((v) => clampByte(v).toString(16).padStart(2, "0"))
      .join("")
  );
}

type BackdropColorFieldProps = {
  value: string;
  onChange: (hex: string) => void;
};

export function BackdropColorField({
  value,
  onChange,
}: BackdropColorFieldProps) {
  const rgb = useMemo(
    () => hexToRgb(value) ?? { r: 0, g: 0, b: 0 },
    [value],
  );
  const [hexDraft, setHexDraft] = useState(value);

  useEffect(() => {
    setHexDraft(value);
  }, [value]);

  const commitHex = (raw: string) => {
    const normalized = raw.startsWith("#") ? raw : `#${raw}`;
    const parsed = hexToRgb(normalized);
    if (!parsed) {
      setHexDraft(value);
      return;
    }
    const next = rgbToHex(parsed.r, parsed.g, parsed.b);
    setHexDraft(next);
    onChange(next);
  };

  const setChannel = (channel: "r" | "g" | "b", amount: number) => {
    const next = { ...rgb, [channel]: clampByte(amount) };
    onChange(rgbToHex(next.r, next.g, next.b));
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.12em] text-white/50">
          Backdrop
        </span>
        <div
          className="size-6 rounded-md border border-white/20 shadow-inner"
          style={{ backgroundColor: value }}
          title={value}
        />
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {PRESETS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Backdrop ${swatch}`}
            onClick={() => onChange(swatch)}
            className={cn(
              "h-6 rounded-md border transition",
              value.toLowerCase() === swatch
                ? "border-white/70 ring-1 ring-white/40"
                : "border-white/15 hover:border-white/35",
            )}
            style={{ backgroundColor: swatch }}
          />
        ))}
      </div>

      <label className="flex items-center gap-2">
        <span className="w-7 text-[9px] uppercase tracking-[0.12em] text-white/40">
          Hex
        </span>
        <input
          type="text"
          value={hexDraft}
          spellCheck={false}
          onChange={(event) => setHexDraft(event.target.value)}
          onBlur={() => commitHex(hexDraft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 rounded-md border border-white/12 bg-white/5 px-2 py-1 font-mono text-[11px] text-white/80 outline-none focus:border-white/30"
        />
      </label>

      {(
        [
          ["R", "r"],
          ["G", "g"],
          ["B", "b"],
        ] as const
      ).map(([label, key]) => (
        <label
          key={key}
          className="grid grid-cols-[1rem_1fr_2rem] items-center gap-2"
        >
          <span className="text-[9px] uppercase tracking-[0.12em] text-white/40">
            {label}
          </span>
          <input
            type="range"
            min={0}
            max={255}
            step={1}
            value={rgb[key]}
            onChange={(event) => setChannel(key, Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
          />
          <span className="text-right text-[10px] tabular-nums text-white/40">
            {rgb[key]}
          </span>
        </label>
      ))}
    </div>
  );
}
