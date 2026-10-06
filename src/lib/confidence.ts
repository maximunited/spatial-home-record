export const CONFIDENCE_STATES = [
  "confirmed",
  "supported",
  "estimated",
  "unknown",
  "conflicted",
] as const;

export type ConfidenceState = (typeof CONFIDENCE_STATES)[number];

export function isConfidenceState(value: unknown): value is ConfidenceState {
  return (
    typeof value === "string" &&
    (CONFIDENCE_STATES as readonly string[]).includes(value)
  );
}

export function assertConfidenceState(value: unknown): ConfidenceState {
  if (!isConfidenceState(value)) {
    throw new Error(`Invalid confidence state: ${String(value)}`);
  }
  return value;
}
