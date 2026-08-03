export type Collectible = {
  id: string;
  title: string;
  subtitle: string;
  year: string;
  /**
   * Optional gallery thumbnail override.
   * Defaults to `${modelPath}/preview.webp` (baked from 360 viewer maps).
   */
  thumbnail?: string;
  backgroundColor: string;
  /**
   * Public folder with WebGL assets:
   * front-body.png, mask.png, holo-mask.png, holo-spectrum.png, contour.json, preview.webp
   */
  modelPath: string;
  /** Single finish label shown in the viewer. */
  finishLabel?: string;
};

/**
 * Collectible holographic stickers / art drops.
 * Managed in Admin → Collectibles; this list is the offline / seed fallback.
 */
export const COLLECTIBLES: Collectible[] = [
  {
    id: "amazing-spiderman",
    title: "Amazing Spider-Man",
    subtitle: "Holographic mask die-cut",
    year: "2026",
    backgroundColor: "#000000",
    modelPath: "/collectibles/amazing-spiderman/webgl",
    finishLabel: "Holo Foil",
  },
];

export function getCollectibleThumbnail(item: Collectible) {
  return item.thumbnail ?? `${item.modelPath}/preview.webp`;
}

export function getCollectible(id: string) {
  return COLLECTIBLES.find((item) => item.id === id);
}
