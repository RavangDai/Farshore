import type { CaptainEmotion } from "@/lib/character-performance";

/** Small pixel features sit over the original portrait, preserving its painted silhouette. */
export function CaptainPortrait({ emotion }: { emotion: CaptainEmotion }) {
  return (
    <div className="captain-performance" data-emotion={emotion}>
      <div className="captain-gesture" key={emotion}>
        <div className="portrait captain-portrait" role="img" aria-label={`Odysseus, ${emotion}`}>
          <svg className="captain-face" viewBox="0 0 280 280" aria-hidden="true" shapeRendering="crispEdges">
            <g className="captain-brows" fill="#38251a">
              <path className="brow-near" d="M126 65h7v-3h12v2h8v4h-15v1h-12z" />
              <path className="brow-far" d="M164 64h9v2h7v4h-8v-2h-8z" />
            </g>
            <g className="captain-blink" fill="#a5744b">
              <path d="M131 71h16v5h-16z M167 72h11v4h-11z" />
              <path fill="#563821" d="M132 74h14v2h-14z M168 74h10v2h-10z" />
            </g>
            <g className="captain-mouth">
              <path fill="#352019" d="M150 110h17v3h5v6h-5v3h-14v-3h-4z" />
              <path fill="#ca9569" d="M153 110h13v2h-13z" />
              <path fill="#9e6950" d="M155 119h10v2h-10z" />
            </g>
          </svg>
        </div>
      </div>
      <span className="captain-emote" aria-hidden="true">
        {emotion === "thoughtful" ? "···" : emotion === "defiant" || emotion === "wary" ? "!" : emotion === "curious" ? "?" : "✦"}
      </span>
    </div>
  );
}
