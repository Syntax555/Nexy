import type { NexyData } from "../domain/index.js";

let pendingData: Promise<NexyData> | undefined;

/**
 * Keeps the full rules/content payload out of the first application chunk.
 * The promise is cached so navigation and rerenders never fetch or parse it twice.
 */
export function loadNexyData(): Promise<NexyData> {
  pendingData ??= import("../generated/nexy-data.json").then(
    ({ default: generatedData }) => generatedData as unknown as NexyData
  );
  return pendingData;
}
