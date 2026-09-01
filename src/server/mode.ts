export const APP_MODES = ['demo', 'live', 'native', 'truth-only'] as const;
export type AppMode = (typeof APP_MODES)[number];

export function resolveMode(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AppMode {
  const value = environment.VILLAGE_MODE ?? 'demo';
  if ((APP_MODES as readonly string[]).includes(value)) return value as AppMode;
  throw new Error(`VILLAGE_MODE must be one of: ${APP_MODES.join(', ')}`);
}
