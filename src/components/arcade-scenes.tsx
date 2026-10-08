import { markerPosition, visibleCue, type Round } from "../lib/legacy-arcade";

// Interactive scenery is code-native: projectile positions and sight positions
// use the exact simulation clock and targets used by collision/timing checks.
export function Ship({ small = false, rowing = 0, damaged = false, bound = false }: { small?: boolean; rowing?: number; damaged?: boolean; bound?: boolean }) {
  const oar = Math.sin(rowing * Math.PI) * 11;
  return <svg className={small ? "a-ship small" : "a-ship"} viewBox="0 0 220 160" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="#092634" d="M15 129h184l-19 16H36Z"/>
    <path fill="#e7d4a2" d="M104 15h7v102h-7z"/>
    <path fill="#f2e5bb" d="m100 24-61 60h61zm17 0v60h61Z"/>
    <path fill="#c9b586" d="M50 73h50v11H39zm67-49 16 60h45Z"/>
    <path fill="#a85749" d="M117 24h12l22 60h-18Z"/>
    <path d="m110 18 70 90M102 26 29 109" stroke="#afad89" strokeWidth="2"/>
    {bound && <g><path fill="#ddb582" d="M103 60h12v13h-12Z"/><path fill="#825548" d="M100 72h18v27h-18Z"/><path d="M98 78h23m-23 9h23" stroke="#dac79c" strokeWidth="3"/><path fill="#3e5860" d="M101 99h7v10h-7zm11 0h7v10h-7Z"/></g>}
    <path fill="#b85f3e" d="M19 105h174l20-14-8 26-35 27H47L19 105Z"/>
    <path fill={damaged ? "#653831" : "#85412e"} d="M28 121h165l-23 23H47Z"/>
    <path fill="#e1ae64" d="M21 105h167v7H25zm155 12 26-7-10 16h-23Z"/>
    <path d="M40 129h135m-121 9h102" stroke="#b57040" strokeWidth="3"/>
    {[0, 1, 2, 3, 4].map(i => <g key={i}>
      <path fill="#e8bc83" d={`M${49 + i * 24} 92h9v9h-9z`}/>
      <path fill={i % 2 ? "#9e6748" : "#668a8c"} d={`M${45 + i * 24} 101h16v12h-16z`}/>
      <path d={`M${51 + i * 24} 114l${-20 + oar} 30`} stroke="#e2b075" strokeWidth="4"/>
      <path d={`M${29 + i * 24 + oar} 142h12v5H${29 + i * 24 + oar}z`} fill="#ad7650"/>
    </g>)}
    <path d="M7 151h40m8 5h64m14-5h67" stroke="#9be5dd" strokeWidth="3" opacity=".75"/>
  </svg>;
}

function Sea({ clock, still }: { clock: number; still: boolean }) {
  const offset = still ? 0 : clock / 70 % 180;
  return <g><path fill="#123c49" d="M0 210h1000v290H0Z"/><path fill="#195464" d="M0 275h1000v225H0Z"/>
    {Array.from({ length: 6 }, (_, row) => <g key={row} opacity={.15 + row * .04} transform={`translate(${row % 2 ? offset - 180 : -offset},0)`}>
      {Array.from({ length: 8 }, (_, col) => <path key={col} d={`M${col * 180 - 40} ${260 + row * 41}h48l9-5h21l9 5h34`} fill="none" stroke="#94d4cc" strokeWidth={row > 3 ? 3 : 2}/>)}</g>)}
  </g>;
}

export function CyclopsScene({ round, still }: { round: Round; still: boolean }) {
  const volleys = round.targets.map((t, i) => ({ ...t, i, p: (round.elapsed - t.start) / round.warning })).filter(t => t.locked && !round.resolved.includes(t.i) && t.p >= 0 && t.p <= 1);
  const danger = volleys.flatMap(t => t.blocked);
  const last = round.resolved.at(-1), impact = last === undefined ? null : round.targets[last];
  const splash = impact ? Math.max(0, 1 - (round.elapsed - impact.at) / 550) : 0;
  const hurt = last !== undefined && round.judgments[last] === "hit" && splash > 0;
  const arm = volleys.length ? -18 + volleys[0].p * 40 : -12;
  return <div className={"a-arena a-cyclops-arena" + (hurt ? " a-hull-hit" : "")}>
    <svg className="a-world" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="coast-sky" x2="0" y2="1"><stop stopColor="#1c4855"/><stop offset="1" stopColor="#bb976a"/></linearGradient></defs>
      <path fill="url(#coast-sky)" opacity=".72" d="M0 0h1000v245H0Z"/>
      <path fill="#2a4246" d="M0 156 81 133l70 25 77-48 67 40 94-63 81 62 86-33 72 31 75-35 113 61 76-36 113 28v84H0Z"/>
      <path fill="#51615a" d="M0 185 128 171l61 24 161-27 76 30 159-28 106 16 115-20 194 31v56H0Z"/>
      <path fill="#7d715a" d="m330 176 38-64 91-26 95 4 69 42 45 44-30 67H350Z"/>
      <g className="a-cyclops-body">
        <path fill="#755041" d="m408 119-46 17-38 69 61 13 17-48 6 76h176l-5-83 21 44 44-23-41-55-55-21Z"/>
        <path fill="#bb855e" d="m418 113-27 17 25 70h139l25-67-34-20Z"/>
        <path fill="#503d35" d="m418 150-7 96h173l-28-92-26 47h-55Z"/>
        <path fill="#6e5740" d="m475 123 24 10-24 72h-40Z"/>
        <path fill="#b47b56" d="M446 53h87l16 33-9 63-45 26-47-31-13-58Z"/>
        <path fill="#392e2b" d="m440 52 15-19h65l23 22 8 38-19-22-16-12h-51l-24 30Z"/>
        <path fill="#50372d" d="m447 117 22 13h47l25-16-10 35-35 25-38-27Z"/>
        <path fill="#f4d195" d="M462 78h64v22h-64z"/><path fill="#c58d37" d="M488 78h19v22h-19z"/><path fill="#172d2c" d="M494 80h8v18h-8z"/>
        <path d="m460 72 32-6 37 7m-44 39h20" fill="none" stroke="#674335" strokeWidth="7"/>
        <g transform={`rotate(${arm} 592 145)`}><path fill="#b47b56" d="m574 129 64-35 51-6 16 34-50 6-42 44Z"/><path fill="#c99b75" d="m676 87 31 3 11 24-16 15-27-9Z"/></g>
      </g>
      <Sea clock={round.elapsed} still={still}/>
      {[0, 1, 2].map(lane => <g key={lane}>
        <path d={`M${lane * 333 + 10} 237h313v248h-313Z`} fill={danger.includes(lane) ? "#d96b5040" : "#071e2920"}/>
        <path d={`M${lane * 333} 238v242`} stroke="#b2dbcc" strokeWidth="2" strokeDasharray="4 14" opacity=".35"/>
        {danger.includes(lane) && <><path d={`m${lane * 333 + 140} 279 26-25 26 25m-26-25v58`} fill="none" stroke="#ffb596" strokeWidth="7"/><ellipse cx={lane * 333 + 166} cy="425" rx="90" ry="17" fill="#f4856640" stroke="#ffb596" strokeWidth="3"/></>}
        {danger.length === 2 && !danger.includes(lane) && <ellipse cx={lane * 333 + 166} cy="425" rx="90" ry="17" fill="#74d1be20" stroke="#9de4c0" strokeWidth="3"/>}
      </g>)}
      {volleys.flatMap(t => t.blocked.map(lane => {
        const p = t.p, x = 670 + (lane * 333 + 166 - 670) * p, y = 115 + 300 * p - Math.sin(p * Math.PI) * 65;
        return <g key={`${t.i}-${lane}`} transform={`translate(${x} ${y}) rotate(${p * 230})`}>
          <path d="m-31-22-24-31m8 12-20-7" stroke="#ead0a1" strokeWidth="4" opacity=".5"/>
          <path d="m-29-22 36-13 28 22-3 31-27 17-33-15Z" fill="#ba9976" stroke="#51483e" strokeWidth="4"/>
          <path d="m-29-22 36-13 11 16-22 7-17 26Z" fill="#ddc49b"/>
          <path d="m8 0 20 15-23 16-10-13Z" fill="#867660"/>
        </g>;
      }))}
      {impact && splash > 0 && impact.blocked.map(lane => <g key={lane} opacity={splash}>
        <ellipse cx={lane * 333 + 166} cy="431" rx={45 + (1 - splash) * 80} ry={12 + (1 - splash) * 12} fill="none" stroke={hurt ? "#ffd0a3" : "#b3eee0"} strokeWidth="5"/>
        {[-1, 0, 1].map(n => <path key={n} d={`M${lane * 333 + 166 + n * 31} 417l${n * 23} ${-40 * splash}`} stroke="#c2f0e4" strokeWidth="6"/>)}
      </g>)}
    </svg>
    <div className="a-battle-ship" style={{ left: `${(round.lane + .5) * 100 / 3}%` }}><Ship rowing={still ? 0 : round.elapsed / 550} damaged={hurt}/></div>
    <div className="a-water-labels">{["LEFT", "CENTER", "RIGHT"].map((name, lane) => <span key={name} className={danger.includes(lane) ? "danger" : danger.length === 2 ? "safe" : ""}>{danger.includes(lane) ? "! INCOMING" : danger.length === 2 ? "OPEN WATER" : name}</span>)}</div>
  </div>;
}

function Siren({ x, flip = false }: { x: number; flip?: boolean }) {
  return <g transform={`translate(${x} 110) scale(${flip ? -1 : 1} 1)`}>
    <path fill="#384a54" d="m-59 100 15-55 35-21 34 13 34 66Z"/>
    <path fill="#b9c7bd" d="m-22 23 10-26h25l14 29 9 43h-61Z"/>
    <path fill="#ead4b2" d="M-10-22h24v29h-24z"/>
    <path fill="#686c7c" d="m-15-19 8-19h21l9 20-6 29-9-26-13-3-10 19Z"/>
    <path d="m-17 18-29 25-24-12m92-13 25 26 20-13" fill="none" stroke="#ddd0b1" strokeWidth="7"/>
    <path fill="#6b8590" d="m-20 59-21 44h79L24 59Z"/>
  </g>;
}

export function SirensScene({ round, still }: { round: Round; still: boolean }) {
  const index = visibleCue(round), target = index >= 0 ? round.targets[index] : null;
  const position = target ? markerPosition(round, target) : 0;
  const goodStroke = round.judgments[index] === "good" && round.elapsed - round.feedbackAt < 650;
  const pull = goodStroke ? (round.elapsed - round.feedbackAt) / 300 : still ? 0 : round.elapsed / 1500;
  return <div className="a-arena a-sirens-arena">
    <svg className="a-world" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="song-sky" x2="0" y2="1"><stop stopColor="#142639"/><stop offset="1" stopColor="#796987"/></linearGradient></defs>
      <path fill="url(#song-sky)" opacity=".85" d="M0 0h1000v260H0Z"/>
      <circle cx="702" cy="80" r="36" fill="#ebd5b2" opacity=".8"/>
      <path fill="#263b49" d="M0 165 110 132l59 38 92-23 58 58 107-24 89 34 84-33 72 29 69-46 110 32 74-47 80 19v97H0Z"/>
      <Sea clock={round.elapsed} still={still}/>
      <path fill="#3f5157" d="M0 187 61 138l68 24 34 93 57 89-74 90H0zm1000 0-61-49-68 24-34 93-57 89 74 90h146Z"/>
      <path fill="#70817a" d="m0 187 61-49 68 24-24 32-73 12Zm1000 0-61-49-68 24 24 32 73 12Z"/>
      <Siren x={113}/><Siren x={890} flip/>
      {[0, 1, 2].map(i => <g key={i} opacity={.12 + .14 * (1 - position)}>
        <path d={`M${185 + i * 27} 125q${35 + i * 22} 39 0 80M${815 - i * 27} 125q${-35 - i * 22} 39 0 80`} stroke="#d3b5e6" fill="none" strokeWidth="3"/>
      </g>)}
      <path d="M299 363q201 42 402 0" stroke="#90d9d2" strokeWidth="5" fill="none" opacity={goodStroke ? .8 : .2}/>
      {goodStroke && [0, 1, 2, 3].map(i => <path key={i} d={`m${320 + i * 110} 356-18-17m18 17 12-23`} stroke="#d2f1dd" strokeWidth="4"/>)}
    </svg>
    <div className="a-rowing-ship"><Ship rowing={pull} bound/></div>
    <span className="a-arena-caption">{round.plan.source === "ai" ? "THEIR SONG CHANGES. KEEP YOUR RHYTHM." : "KEEP THE OARS TOGETHER. PASS THE SIRENS."}</span>
  </div>;
}

export function BowScene({ round }: { round: Round }) {
  const index = visibleCue(round), target = index >= 0 ? round.targets[index] : null;
  const p = target ? markerPosition(round, target) : .5;
  const zone = target ? markerPosition(round, target, target.at) : .5;
  const aim = 180 + p * 640, opening = 180 + zone * 640;
  const judgment = round.judgments[index], age = round.elapsed - round.feedbackAt;
  const flight = judgment && judgment !== "miss" && age < 650 ? Math.min(1, age / 320) : null;
  const shotAim = target ? 180 + markerPosition(round, target, round.feedbackAt) * 640 : aim;
  const halfGap = target ? Math.abs(markerPosition(round, target, target.at + round.window) - markerPosition(round, target, target.at - round.window)) * 320 : 24;
  const aligned = target && !judgment && Math.abs(round.elapsed - target.at) <= round.window;
  return <div className="a-arena a-bow-arena">
    <svg className="a-world" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="hall-light" x2="0" y2="1"><stop stopColor="#7d735d"/><stop offset="1" stopColor="#263e47"/></linearGradient></defs>
      <path fill="url(#hall-light)" d="M0 0h1000v500H0Z"/>
      <path d="M70 0h860v305H70Z" fill="#384b4d"/>
      {[0, 1, 2, 3, 4].map(i => <g key={i}>
        <path d={`M${82 + i * 177} 0h34v305h-34Z`} fill="#c0a77c"/>
        <path d={`M${90 + i * 177} 0h9v300h-9Z`} fill="#dbbf89"/>
        <path d={`M${70 + i * 177} 24h58v15h-58zm0 249h58v23h-58Z`} fill="#967e62"/>
        <path d={`M${120 + i * 177} 244V99q55-65 109 0v145Z`} fill="#172f39"/>
      </g>)}
      <path fill="#9e8a66" d="M0 296h1000v24H0Z"/><path fill="#4c5956" d="M0 320h1000v180H0Z"/>
      {[0, 1, 2, 3, 4, 5, 6].map(i => <path key={i} d={`M500 312 ${i * 190 - 130} 500`} stroke="#8e8b70" strokeWidth="2" opacity=".5"/>)}
      <path d="M0 365h1000M0 427h1000" stroke="#8e8b70" strokeWidth="2" opacity=".4"/>
      {[0, 1].map(i => <g key={i} transform={`translate(${i ? 925 : 75} 200)`}><path fill="#a86f3c" d="M-10 0h20v100h-20Z"/><path fill="#efd08d" d="m-14 0 7-28 9 12 9-25 10 41Z"/><path fill="#d17c42" d="m-8 0 8-13 6 13Z"/></g>)}
      <g transform={`translate(${opening} 238)`}>
        {Array.from({ length: 12 }, (_, i) => <g key={i} opacity={.3 + i * .06} transform={`translate(0 ${-i * 4}) scale(${1 - i * .035})`}>
          <path d="M-64 66V-43h9V66M64 66V-43h-9V66" stroke="#455356" strokeWidth="5"/>
          <path d="M-70-45h42v32h-42ZM28-45h42v32H28Z" fill="#96a7a1" stroke="#e2d7b4" strokeWidth="2"/>
        </g>)}
        <rect x={-halfGap} y="-37" width={halfGap * 2} height="62" fill="#eaca7730" stroke="#f2cf82" strokeWidth="3"/>
        {judgment === "good" && age < 600 && <path d="m-43-30-24-17m20 48-25 6m115-35 24-17m-20 48 25 6" stroke="#f8df9b" strokeWidth="4" opacity={1 - age / 600}/>}
      </g>
      {!judgment && <g transform={`translate(${aim} 235)`} stroke={aligned ? "#ffe0a0" : "#d0eee2"} fill="none" strokeWidth="3"><circle r="20"/><path d="M-32 0h18m28 0h18M0-32v18m0 28v18"/></g>}
      <g transform="translate(500 432)">
        <path d="M-158-36q158-110 316 0" fill="none" stroke="#cf9f5f" strokeWidth="13"/>
        <path d="m-158-36 158 31 158-31" fill="none" stroke="#eddbb1" strokeWidth="3"/>
        <path fill="#a86a43" d="M-12-44h24v51h-24Z"/><path fill="#e0b083" d="M-24-6h48v38h-48Z"/>
        <path fill="#406e77" d="M-19 26h38v42h-38Z"/>
        {flight === null && <path d={`M0 0 0-80m0 0-7 14m7-14 7 14`} stroke="#f5e0b1" strokeWidth="3"/>}
      </g>
      {flight !== null && <g transform={`translate(${500 + (shotAim - 500) * flight} ${432 - flight * 194}) scale(${1 - flight * .45})`}><path d="M0 32V-29m0 0-7 14m7-14 7 14m-2 33 10 17m-6-17-10 17" stroke="#f4e1b4" strokeWidth="4"/></g>}
    </svg>
    <span className="a-arena-caption">TWELVE AXES. ONE CLEAN OPENING.</span>
  </div>;
}
