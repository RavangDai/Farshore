import type { CSSProperties } from "react";

/** Separate water from the painted shore, then move small currents over its surface. */
export function SceneWater({ tile, title = false }: { tile?: number; title?: boolean }) {
  return (
    <div className={`scene-water ${title ? "title-water" : `water-tile-${tile}`}`} aria-hidden="true"
      style={tile === undefined ? undefined : { "--water-art-position": `${(tile % 3) * 50}% ${Math.floor(tile / 3) * 100}%` } as CSSProperties}>
      <div className="water-region">
        {!title && <div className="water-paint" />}
        <div className="water-reflection" />
        {[0, 1, 2].map((layer) => (
          <svg key={layer} className={`water-current current-${layer}`} viewBox="0 0 1200 240" preserveAspectRatio="none" shapeRendering="crispEdges">
            <g fill="none" stroke="currentColor" strokeWidth={layer === 2 ? 2 : 1}>
              {Array.from({ length: 18 }, (_, i) => {
                const x = (i * 173 + layer * 59) % 1120;
                const y = 12 + ((i * 37) % 210);
                const w = 16 + (i % 5) * 13;
                return <path key={i} d={`M${x} ${y}h${w * .35}v-2h${w * .4}v2h${w * .25} M${x + 120} ${y + 7}h${w * .45}`} />;
              })}
            </g>
          </svg>
        ))}
        <div className="water-foam foam-one" />
        <div className="water-foam foam-two" />
      </div>
      <div className="scene-breeze"><i /><i /><i /></div>
    </div>
  );
}
