"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { BackButton } from "@/components/BackButton";
import { CollectibleGallery } from "@/components/collectibles/CollectibleGallery";
import { useTryItCountdown } from "@/components/collectibles/TryItCountdown";
import type { Collectible } from "@/lib/collectibles";

const CollectibleBuildGuide = dynamic(
  () =>
    import("@/components/collectibles/CollectibleBuildGuide").then(
      (mod) => mod.CollectibleBuildGuide,
    ),
  { ssr: false },
);

const CollectibleTryIt = dynamic(
  () =>
    import("@/components/collectibles/CollectibleTryIt").then(
      (mod) => mod.CollectibleTryIt,
    ),
  { ssr: false },
);

type CollectiblesPageContentProps = {
  items: Collectible[];
};

export function CollectiblesPageContent({
  items,
}: CollectiblesPageContentProps) {
  const [guideOpen, setGuideOpen] = useState(false);
  const [tryItOpen, setTryItOpen] = useState(false);
  const { unlocked, label } = useTryItCountdown();

  return (
    <main className="min-h-dvh bg-[#fdfcf9] text-foreground dark:bg-[#101010] dark:text-white">
      <div className="mx-auto w-full max-w-[1380px] px-5 pb-28 pt-10 sm:px-8 lg:px-12">
        <BackButton href="/" />

        <header className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Collectibles</h1>
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="mt-2 max-w-xl text-left text-[14px] leading-relaxed text-foreground/50 underline decoration-foreground/20 underline-offset-4 transition hover:text-foreground/75 hover:decoration-foreground/40"
            >
              How we built this holographic sticker — open-source walkthrough with
              copyable code
            </button>
          </div>

          {unlocked ? (
            <button
              type="button"
              onClick={() => setTryItOpen(true)}
              className="inline-flex items-baseline gap-2 text-left text-[13px] text-foreground/55 transition hover:text-foreground"
              aria-label={`Try it here, ${label} remaining`}
            >
              <span className="underline decoration-foreground/25 underline-offset-4">
                Try it here
              </span>
              <span className="font-mono text-[12px] tabular-nums text-foreground/40">
                {label}
              </span>
            </button>
          ) : null}
        </header>

        <div className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="text-[15px] font-medium tracking-tight">All drops</h2>
            <p className="text-[12px] text-foreground/40">
              {items.length} {items.length === 1 ? "piece" : "pieces"}
            </p>
          </div>
          <CollectibleGallery items={items} />
        </div>
      </div>

      <CollectibleBuildGuide
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
      {unlocked ? (
        <CollectibleTryIt open={tryItOpen} onClose={() => setTryItOpen(false)} />
      ) : null}
    </main>
  );
}
