import { useRef, useState } from "react";
import { Minus, Plus, LocateFixed, ExternalLink } from "lucide-react";
import { encounters, type Game } from "../lib/game";
import { chapterLore, homerLink, mapStops, projectMap, type MapStop } from "../lib/odyssey";
import { landPaths } from "../lib/map-land";

const stopFor = (id: string) => mapStops.find(stop => stop.chapters.includes(id))!;
const point = (stop: MapStop) => projectMap(stop.lon, stop.lat);
function leg(a: MapStop, b: MapStop) {
  const [x, y] = point(a), [endX, endY] = point(b);
  if (a.id === "cicones" && b.id === "lotus") {
    const turns = [[25, 38.5], [24, 35.6], [20, 34.5], [15, 34]].map(([lon, lat]) => projectMap(lon, lat));
    return `M${x},${y} ${turns.map(p => `L${p}`).join(" ")} L${endX},${endY}`;
  }
  if (a.id === "underworld" && b.id === "sirens") {
    const circe = point(stopFor("circe"));
    return `M${x},${y} Q${(x + circe[0]) / 2},${y + 95} ${circe} L${endX},${endY}`;
  }
  return `M${x},${y} Q${(x + endX) / 2},${Math.max(y, endY) + Math.min(65, Math.abs(endX - x) * .15)} ${endX},${endY}`;
}

export function VoyageMap({ game }: { game: Game }) {
  const currentId = game.route[game.index];
  const [selectedId, setSelectedId] = useState(stopFor(currentId).id);
  const [chapter, setChapter] = useState(currentId);
  const [zoom, setZoom] = useState(1);
  const chartRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const selected = mapStops.find(stop => stop.id === selectedId)!;
  const activeChapter = selected.chapters.includes(chapter) ? chapter : selected.chapters[0];
  const lore = chapterLore[activeChapter];
  const entry = game.log.find(item => item.encounterId === activeChapter);
  const actualStops = [mapStops[0], ...game.route.map(stopFor)].filter((stop, i, all) => i === 0 || stop.id !== all[i - 1].id);
  const visited = new Set(["troy", ...game.log.map(item => stopFor(item.encounterId).id)]);
  const currentStop = stopFor(currentId);
  function choose(stop: MapStop) {
    setSelectedId(stop.id);
    setChapter(stop.chapters.includes(currentId) ? currentId : stop.chapters[0]);
  }
  function showCurrent() {
    choose(currentStop);
    setZoom(1);
    requestAnimationFrame(() => {
      const chart = chartRef.current;
      if (!chart) return;
      const [x, y] = point(currentStop);
      chart.scrollTo({ left: x / 1200 * chart.scrollWidth - chart.clientWidth / 2, top: y / 710 * chart.scrollHeight - chart.clientHeight / 2 });
    });
  }
  const status = selected.id === "troy" ? "THE DEPARTURE"
    : activeChapter === currentId ? game.finished ? "YOUR VOYAGE ENDED HERE" : entry ? "DECISION RECORDED" : "YOU ARE HERE"
      : entry ? "IN YOUR CAPTAIN’S LOG"
        : game.route.includes(activeChapter) ? "AHEAD ON YOUR ROUTE" : "HOMER’S ROUTE · NOT VISITED";

  return (
    <div className="voyage-atlas">
      <div className="atlas-toolbar">
        <span>A Mediterranean reading of the Odyssey</span>
        <div className="atlas-tools">
          <button type="button" aria-label="Zoom out on the voyage map" disabled={zoom === 1} onClick={() => setZoom(Math.max(1, zoom - .5))}><Minus size={17} /></button>
          <span aria-live="polite">{zoom * 100}%</span>
          <button type="button" aria-label="Zoom in on the voyage map" disabled={zoom === 2} onClick={() => setZoom(Math.min(2, zoom + .5))}><Plus size={17} /></button>
          <button type="button" onClick={showCurrent}><LocateFixed size={16} /> Current shore</button>
        </div>
      </div>
      <div className="atlas-layout">
        <div>
          <div className="atlas-scroll" ref={chartRef} tabIndex={0} role="region" aria-label="Mediterranean voyage chart. Scroll when zoomed. Select a shore to read its story.">
            <svg viewBox="0 0 1200 710" className="atlas-chart" style={{ width: `${zoom * 100}%` }} aria-label="Mediterranean coastlines with Odysseus’s route from Troy to Ithaca">
              <defs>
                <pattern id="atlas-grid" width="150" height="118.333" patternUnits="userSpaceOnUse"><path d="M150 0H0V118.333" fill="none" stroke="#b0c4b5" strokeOpacity=".1" strokeWidth="1" /></pattern>
                <radialGradient id="atlas-sea"><stop stopColor="#214b59" /><stop offset="1" stopColor="#102b3a" /></radialGradient>
                <pattern id="atlas-land" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#89967b" /><circle cx="2" cy="3" r=".7" fill="#435648" opacity=".35" /></pattern>
              </defs>
              <rect width="1200" height="710" fill="url(#atlas-sea)" />
              <rect width="1200" height="710" fill="url(#atlas-grid)" />
              <g className="atlas-coasts" aria-hidden="true">{landPaths.map((d, i) => <path d={d} key={i} />)}</g>
              <g className="atlas-geography" aria-hidden="true">
                <text x="140" y="160">EUROPE</text><text x="565" y="165" transform="rotate(30 565 165)">ITALY</text>
                <text x="863" y="260">GREECE</text><text x="1100" y="278">ANATOLIA</text>
                <text x="375" y="605">NORTH AFRICA</text><text x="640" y="590" className="atlas-sea-name">MEDITERRANEAN SEA</text>
                <text x="850" y="425" className="atlas-island-name">CRETE</text><text x="551" y="379" className="atlas-island-name">SICILY</text>
              </g>
              <g fill="none" aria-hidden="true">
                {mapStops.slice(1).map((stop, i) => <path className="atlas-legend-route" key={stop.id} d={leg(mapStops[i], stop)} />)}
                {actualStops.slice(1).map((stop, i) => <path className={`atlas-player-route ${visited.has(stop.id) || stop.id === currentStop.id ? "travelled" : ""}`} key={`${actualStops[i].id}-${stop.id}`} d={leg(actualStops[i], stop)} />)}
              </g>
              <g className="atlas-compass" transform="translate(1100 575)" aria-hidden="true">
                <circle r="45" /><path d="M0-35 8 0 0 35-8 0Z M-35 0 0-8 35 0 0 8Z" /><text y="-55">N</text><text y="70">S</text><text x="-61" y="5">W</text><text x="61" y="5">E</text>
              </g>
              {mapStops.map((stop, i) => {
                const [x, y] = point(stop);
                const isCurrent = currentStop.id === stop.id;
                return (
                  <g key={stop.id} transform={`translate(${x} ${y})`} role="button" tabIndex={0}
                    aria-label={`${stop.name}${isCurrent ? ", current shore" : ""}. Read story and source`}
                    aria-pressed={selectedId === stop.id}
                    className={`atlas-stop ${selectedId === stop.id ? "selected" : ""} ${isCurrent ? "current" : ""} ${visited.has(stop.id) ? "visited" : ""}`}
                    onClick={() => choose(stop)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(stop); } }}>
                    <circle r="21" className="atlas-hit" />
                    <path d={`M0,0 L${stop.label[0]},${stop.label[1]}`} className="atlas-leader" />
                    <circle r="12" className="atlas-marker" />
                    <text className="atlas-marker-number" y="4">{i === 0 ? "T" : i}</text>
                    <text className="atlas-port-name" x={stop.label[0]} y={stop.label[1] + (stop.label[1] < 0 ? -7 : 15)}>{stop.name}</text>
                    {isCurrent && <circle r="17" className="atlas-current-ring" />}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="atlas-key"><span><i className="key-gold" /> Your route</span><span><i className="key-dotted" /> Homer’s sequence</span><span><i className="key-ring" /> Current shore</span></div>
          <p className="atlas-map-note">Real coastlines. Legendary stops are approximate, and Oceanus is shown symbolically. Lines show narrative order, not proven sailing courses.</p>
        </div>
        <article className="atlas-detail" ref={detailRef} aria-live="polite">
          <span className="atlas-eyebrow">{status}</span>
          <h2>{selected.name}</h2>
          {selected.chapters.length > 1 && <div className="atlas-chapter-tabs" aria-label="Chapters at this shore">{selected.chapters.map(id => <button type="button" key={id} aria-pressed={activeChapter === id} onClick={() => setChapter(id)}>{id === "nausicaa" ? "Nausicaa" : id === "phaeacians" ? "The court" : id === "ithaca" ? "The hidden king" : "The reunion"}</button>)}</div>}
          <h3>In Homer’s Odyssey</h3>
          <p>{lore?.summary || "The Greeks take Troy through the wooden-horse stratagem. Odysseus leads his fleet toward Ithaca after ten years of war. The story’s difficult homecoming is still ahead."}</p>
          <a className="source-link" href={homerLink(lore?.book || 8)} target="_blank" rel="noreferrer">{lore?.reference || "Books 4 and 8"}<ExternalLink size={13} /></a>
          {entry && <div className="atlas-your-choice"><h3>Your voyage · +{entry.months} months</h3><p>{entry.outcome}</p></div>}
          <details className="atlas-location"><summary>About this location</summary><p>{selected.location}</p></details>
        </article>
      </div>
      <details className="atlas-index">
        <summary>Browse every chapter and source</summary>
        <ol>{mapStops.flatMap(stop => stop.chapters.map(id => <li key={id}><button type="button" onClick={() => { choose(stop); setChapter(id); detailRef.current?.scrollIntoView({ block: "nearest" }); }}><span>{encounters.find(e => e.id === id)?.place}</span><small>{game.log.some(e => e.encounterId === id) ? "Visited" : id === currentId ? "Current chapter" : game.route.includes(id) ? "Ahead" : "Alternate route"}</small></button></li>))}</ol>
      </details>
      <p className="atlas-credit">Coastline data: <a href="https://www.naturalearthdata.com/downloads/50m-physical-vectors/50m-land/" target="_blank" rel="noreferrer">Natural Earth</a>, public domain. Story: Homer, <i>Odyssey</i>, translated by Samuel Butler.</p>
    </div>
  );
}
