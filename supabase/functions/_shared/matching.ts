import type {
  Fruit,
  FruitAttributes,
  FruitPreferences,
  NumberRange,
  ShineFactor,
} from "./generateFruit.ts";

export type MatchOutcome = "strong_match" | "best_available" | "no_match";
export type PreferenceField = keyof FruitPreferences;

export interface MatchDetail {
  field: PreferenceField;
  score: number;
  weight: number;
  matched: boolean;
  reason: string;
}

export interface DirectionScore {
  score: number;
  achievedWeight: number;
  totalWeight: number;
  details: MatchDetail[];
}

export interface RankedMatch<TFruit extends Fruit = Fruit> {
  candidate: TFruit;
  candidateId: string | null;
  requesterScore: number;
  candidateScore: number;
  mutualScore: number;
  outcome: MatchOutcome;
  breakdown: {
    requester: MatchDetail[];
    candidate: MatchDetail[];
  };
  blockers: string[];
  highlights: string[];
}

const FIELD_WEIGHTS: Record<PreferenceField, number> = {
  size: 1,
  weight: 1,
  hasStem: 1,
  hasLeaf: 1,
  hasWorm: 3,
  shineFactor: 1,
  hasChemicals: 2,
};

const FIELD_LABELS: Record<PreferenceField, string> = {
  size: "size",
  weight: "weight",
  hasStem: "stem",
  hasLeaf: "leaf",
  hasWorm: "worm status",
  shineFactor: "shine",
  hasChemicals: "chemical treatment",
};

const SHINE_ORDER: Record<ShineFactor, number> = {
  dull: 0,
  neutral: 1,
  shiny: 2,
  extraShiny: 3,
};

const RANGE_TOLERANCE: Record<"size" | "weight", number> = {
  size: 4,
  weight: 80,
};

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function formatBoolean(value: boolean): string {
  return value ? "yes" : "no";
}

function describeRange(field: "size" | "weight", range: NumberRange): string {
  const unit = field === "weight" ? "g" : " units";
  if (range.min !== undefined && range.max !== undefined) {
    return `${range.min}-${range.max}${unit}`;
  }

  if (range.min !== undefined) {
    return `at least ${range.min}${unit}`;
  }

  if (range.max !== undefined) {
    return `at most ${range.max}${unit}`;
  }

  return "any value";
}

function scoreBoolean(
  field: Exclude<PreferenceField, "size" | "weight" | "shineFactor">,
  expected: boolean,
  actual: boolean | null,
): MatchDetail {
  if (actual === null) {
    return {
      field,
      score: 0.45,
      weight: FIELD_WEIGHTS[field],
      matched: false,
      reason: `${FIELD_LABELS[field]} is unknown.`,
    };
  }

  const matched = expected === actual;
  return {
    field,
    score: matched ? 1 : 0,
    weight: FIELD_WEIGHTS[field],
    matched,
    reason: matched
      ? `Wanted ${FIELD_LABELS[field]} ${formatBoolean(expected)} and got it.`
      : `Wanted ${FIELD_LABELS[field]} ${formatBoolean(expected)}, but it was ${formatBoolean(actual)}.`,
  };
}

function scoreRange(
  field: "size" | "weight",
  range: NumberRange,
  actual: number | null,
): MatchDetail {
  if (actual === null) {
    return {
      field,
      score: 0.45,
      weight: FIELD_WEIGHTS[field],
      matched: false,
      reason: `${FIELD_LABELS[field]} is unknown.`,
    };
  }

  const { min, max } = range;
  const inRange = (min === undefined || actual >= min)
    && (max === undefined || actual <= max);

  if (inRange) {
    return {
      field,
      score: 1,
      weight: FIELD_WEIGHTS[field],
      matched: true,
      reason: `${FIELD_LABELS[field]} landed inside the preferred range (${describeRange(field, range)}).`,
    };
  }

  const lowerDistance = min !== undefined && actual < min ? min - actual : 0;
  const upperDistance = max !== undefined && actual > max ? actual - max : 0;
  const outsideDistance = Math.max(lowerDistance, upperDistance);
  const tolerance = RANGE_TOLERANCE[field];
  const score = clamp(1 - outsideDistance / tolerance);

  return {
    field,
    score: roundScore(score),
    weight: FIELD_WEIGHTS[field],
    matched: false,
    reason: `${FIELD_LABELS[field]} missed the preferred range (${describeRange(field, range)}) by ${roundScore(outsideDistance)}${field === "weight" ? "g" : " units"}.`,
  };
}

function scoreShinePreference(
  expected: ShineFactor | ShineFactor[],
  actual: ShineFactor | null,
): MatchDetail {
  if (actual === null) {
    return {
      field: "shineFactor",
      score: 0.45,
      weight: FIELD_WEIGHTS.shineFactor,
      matched: false,
      reason: "Shine level is unknown.",
    };
  }

  const accepted = Array.isArray(expected) ? expected : [expected];
  if (accepted.includes(actual)) {
    return {
      field: "shineFactor",
      score: 1,
      weight: FIELD_WEIGHTS.shineFactor,
      matched: true,
      reason: `Shine preference matched (${actual}).`,
    };
  }

  const nearestDistance = Math.min(
    ...accepted.map((value) => Math.abs(SHINE_ORDER[value] - SHINE_ORDER[actual])),
  );
  const score = nearestDistance === 1 ? 0.65 : 0.15;

  return {
    field: "shineFactor",
    score,
    weight: FIELD_WEIGHTS.shineFactor,
    matched: false,
    reason: `Shine preference wanted ${accepted.join(" or ")}, but candidate was ${actual}.`,
  };
}

export function scorePreferencesAgainstAttributes(
  preferences: FruitPreferences,
  attributes: FruitAttributes,
): DirectionScore {
  const details: MatchDetail[] = [];

  if (preferences.size) {
    details.push(scoreRange("size", preferences.size, attributes.size));
  }

  if (preferences.weight) {
    details.push(scoreRange("weight", preferences.weight, attributes.weight));
  }

  if (preferences.hasStem !== undefined) {
    details.push(scoreBoolean("hasStem", preferences.hasStem, attributes.hasStem));
  }

  if (preferences.hasLeaf !== undefined) {
    details.push(scoreBoolean("hasLeaf", preferences.hasLeaf, attributes.hasLeaf));
  }

  if (preferences.hasWorm !== undefined) {
    details.push(scoreBoolean("hasWorm", preferences.hasWorm, attributes.hasWorm));
  }

  if (preferences.hasChemicals !== undefined) {
    details.push(
      scoreBoolean("hasChemicals", preferences.hasChemicals, attributes.hasChemicals),
    );
  }

  if (preferences.shineFactor !== undefined) {
    details.push(scoreShinePreference(preferences.shineFactor, attributes.shineFactor));
  }

  if (details.length === 0) {
    return {
      score: 1,
      achievedWeight: 0,
      totalWeight: 0,
      details: [],
    };
  }

  const achievedWeight = details.reduce(
    (sum, detail) => sum + detail.score * detail.weight,
    0,
  );
  const totalWeight = details.reduce((sum, detail) => sum + detail.weight, 0);

  return {
    score: roundScore(achievedWeight / totalWeight),
    achievedWeight: roundScore(achievedWeight),
    totalWeight,
    details,
  };
}

export function harmonicMean(left: number, right: number): number {
  if (left <= 0 || right <= 0) {
    return 0;
  }

  return roundScore((2 * left * right) / (left + right));
}

export function outcomeForScore(score: number): MatchOutcome {
  if (score >= 0.85) {
    return "strong_match";
  }

  if (score >= 0.65) {
    return "best_available";
  }

  return "no_match";
}

function buildHighlights(details: MatchDetail[]): string[] {
  return details
    .filter((detail) => detail.score >= 0.65)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((detail) => detail.reason);
}

function buildBlockers(details: MatchDetail[]): string[] {
  return details
    .filter((detail) => detail.score <= 0.2 && detail.weight >= 2)
    .map((detail) => detail.reason);
}

export function scoreFruitPair<TFruit extends Fruit & { id?: string }>(
  requester: Fruit,
  candidate: TFruit,
): RankedMatch<TFruit> {
  const requesterSide = scorePreferencesAgainstAttributes(
    requester.preferences,
    candidate.attributes,
  );
  const candidateSide = scorePreferencesAgainstAttributes(
    candidate.preferences,
    requester.attributes,
  );

  const mutualScore = harmonicMean(requesterSide.score, candidateSide.score);
  const blockers = [
    ...buildBlockers(requesterSide.details),
    ...buildBlockers(candidateSide.details),
  ];

  return {
    candidate,
    candidateId: candidate.id ?? null,
    requesterScore: requesterSide.score,
    candidateScore: candidateSide.score,
    mutualScore,
    outcome: outcomeForScore(mutualScore),
    breakdown: {
      requester: requesterSide.details,
      candidate: candidateSide.details,
    },
    blockers,
    highlights: [
      ...buildHighlights(requesterSide.details),
      ...buildHighlights(candidateSide.details),
    ].slice(0, 5),
  };
}

export function rankFruitMatches<TFruit extends Fruit & { id?: string }>(
  requester: Fruit,
  candidates: TFruit[],
): RankedMatch<TFruit>[] {
  return candidates
    .map((candidate) => scoreFruitPair(requester, candidate))
    .sort((left, right) =>
      right.mutualScore - left.mutualScore
      || right.requesterScore - left.requesterScore
      || right.candidateScore - left.candidateScore
      || left.blockers.length - right.blockers.length
    );
}

export function buildDeterministicNarrative(
  requester: Fruit,
  rankedMatches: RankedMatch[],
): string {
  const bestMatch = rankedMatches[0];
  const counterpartType = requester.type === "apple" ? "orange" : "apple";

  if (!bestMatch) {
    return `I searched the ${counterpartType} orchard, but I could not find anyone to compare against yet.`;
  }

  const bestScore = Math.round(bestMatch.mutualScore * 100);
  const lead = bestMatch.outcome === "strong_match"
    ? `I found a strong ${counterpartType} match with a mutual score of ${bestScore}%.`
    : bestMatch.outcome === "best_available"
    ? `I found the best available ${counterpartType} with a mutual score of ${bestScore}%.`
    : `I found the closest ${counterpartType}, but it is more of a near-miss at ${bestScore}%.`;

  const why = bestMatch.highlights.length > 0
    ? `The strongest signals were: ${bestMatch.highlights.join(" ")}`
    : "There were not many explicit shared preferences to work from.";

  const blockers = bestMatch.blockers.length > 0
    ? `The main friction points were: ${bestMatch.blockers.join(" ")}`
    : "There were no major dealbreakers in the top pairing.";

  return `${lead} ${why} ${blockers}`;
}
