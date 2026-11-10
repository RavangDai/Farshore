import { Compass, Leaf, Eye, Wind, FlaskConical, Music, Waves, Sailboat, Target } from "lucide-react";
import { trials, type TrialId } from "../../lib/arcade/arcade";

const glyphs = [Leaf, Eye, Wind, FlaskConical, Music, Waves, Sailboat, Target];
export function TrialGlyph({ id, size = 24 }: { id: TrialId; size?: number }) { const Icon = glyphs[trials.findIndex(t => t.id === id)] || Compass; return <Icon size={size} strokeWidth={1.5}/>; }
