// Sample-mode response time per AI surface, in ms. Live calls measured 4–22 s; these are shorter
// but long enough that the staged reasoning reads like a real interaction.
export const SAMPLE_DELAY_MS = { explain: 3800, agenda: 6200, coach: 7400 } as const;
