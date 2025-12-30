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
      plain_text TEXT,
      html_content TEXT,
      font_family TEXT DEFAULT 'System',
      font_size INTEGER DEFAULT 3,
      margin INTEGER DEFAULT 20,
      speed INTEGER DEFAULT 1,
      is_mirrored_h INTEGER DEFAULT 0,
      is_mirrored_v INTEGER DEFAULT 0,
      mode TEXT DEFAULT 'phone',
      last_modified DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: Add columns if they usually don't exist in old installs
  try {
    const result = await db.getAllAsync('PRAGMA table_info(scripts)');
    const columns = (result as any[]).map(c => c.name);

    if (!columns.includes('plain_text')) {
      await db.execAsync('ALTER TABLE scripts ADD COLUMN plain_text TEXT');
    }
    if (!columns.includes('html_content')) {
      await db.execAsync('ALTER TABLE scripts ADD COLUMN html_content TEXT');
    }
  } catch (e) {
    console.log("Migration check failed or columns exist:", e);
  }

  return db;
};
