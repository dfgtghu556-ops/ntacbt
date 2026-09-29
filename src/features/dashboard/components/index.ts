/**
 * Dashboard components, extracted from the route.
 *
 * `src/routes/app.index.tsx` was a single 1,532-line file holding the page and
 * all nineteen of its sub-components. Every "present this better" change meant
 * editing a file that big, where a mistake anywhere breaks the whole page.
 *
 * The extraction is a pure move — no behaviour change — verified by the
 * dashboard tests that already existed. The route is now composition and data
 * loading; the pieces live here.
 */
export { SurvivalScoreRing } from "./SurvivalScoreRing";
export { SurvivalMission } from "./SurvivalMission";
export { DualLane } from "./DualLane";
export { RankPredictor } from "./RankPredictor";
export { LaneCard } from "./LaneCard";
export { StreakCard } from "./StreakCard";
export { MicroDrillPanel } from "./MicroDrillPanel";
export { WellnessStrip } from "./WellnessStrip";
export { ProgressCard } from "./ProgressCard";
export { StatCard } from "./StatCard";
export { QuickAction } from "./QuickAction";
export { Panel } from "./Panel";
export { InsightCard } from "./InsightCard";
export { TrustLine } from "./TrustLine";
export { EmptyPanel } from "./EmptyPanel";
export { LoadingCards } from "./LoadingCards";
export { AwardsCard } from "./AwardsCard";
export { DppCard } from "./DppCard";
export { TodayStrip } from "./TodayStrip";
