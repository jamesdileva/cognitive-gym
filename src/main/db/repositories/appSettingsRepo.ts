import type { GymDatabase } from '../database';

/** Generic key/value persistence for app-level settings (engine choice, UI prefs). */
export function createAppSettingsRepo(db: GymDatabase) {
  return {
    get(key: string): string | undefined {
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined;
      return row?.value;
    },

    set(key: string, value: string): void {
      db.prepare(
        `
        INSERT INTO app_settings (key, value) VALUES (?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value
        `
      ).run(key, value);
    },

    delete(key: string): boolean {
      return db.prepare('DELETE FROM app_settings WHERE key = ?').run(key).changes > 0;
    }
  };
}

export type AppSettingsRepo = ReturnType<typeof createAppSettingsRepo>;
