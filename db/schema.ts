import * as SQLite from 'expo-sqlite';

export const DATABASE_NAME = 'telecue.db';

export const initDatabase = async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

    await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS scripts (
      id INTEGER PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      font_family TEXT DEFAULT 'System',
      font_size INTEGER DEFAULT 3,
      margin INTEGER DEFAULT 20,
      speed INTEGER DEFAULT 3,
      is_mirrored_h INTEGER DEFAULT 0,
      is_mirrored_v INTEGER DEFAULT 0,
      mode TEXT DEFAULT 'phone',
      last_modified DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

    return db;
};
