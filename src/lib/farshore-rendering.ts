import { useEffect, useState } from "react";

function useGameImage(path: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const asset = new Image(); let live = true;
    asset.onload = () => { if (live) setImage(asset); };
    asset.src = path;
    return () => { live = false; asset.onload = null; };
  }, [path]);
  return image;
}
export const useFarshoreAtlas = () => useGameImage("/art/farshore/trials-and-cast.png");
export const useFarshoreSprites = () => useGameImage("/art/farshore/odysseus-and-ship.png");
export function drawFarshoreSprite(c: CanvasRenderingContext2D, image: HTMLImageElement | null, index: number, x: number, y: number, width: number, height: number) {
  if (!image?.complete || !image.naturalWidth) return;
  const tw = image.naturalWidth / 2, th = image.naturalHeight / 2;
  c.drawImage(image, index % 2 * tw, Math.floor(index / 2) * th, tw, th, x, y, width, height);
}

// Draw a tile from the original FARSHORE atlas without changing collision geometry.
export function drawFarshoreTile(c: CanvasRenderingContext2D, image: HTMLImageElement | null, index: number, x: number, y: number, width: number, height: number, alpha = 1) {
  if (!image?.complete || !image.naturalWidth) return;
  const tw = image.naturalWidth / 4, th = image.naturalHeight / 3;
  const scale = Math.max(width / tw, height / th), sw = width / scale, sh = height / scale;
  c.save(); c.globalAlpha *= alpha;
  c.drawImage(image, index % 4 * tw + (tw - sw) / 2, Math.floor(index / 4) * th + (th - sh) / 2, sw, sh, x, y, width, height);
  c.restore();
}
