import type { NexyData } from "../domain/index.js";
import generatedData from "../generated/nexy-data.json";

/**
 * Build-time validated content. The cast is intentionally isolated here so
 * every application and engine consumer receives the strict domain model.
 */
export const nexyData = generatedData as unknown as NexyData;
