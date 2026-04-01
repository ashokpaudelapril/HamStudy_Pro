import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'node:path'

let cachedDb: Database.Database | null = null
const DB_FILENAME = 'hamstudy-pro.sqlite'

// TASK: Create (and reuse) a single SQLite connection for the app lifetime.
// HOW CODE SOLVES: Lazily opens a better-sqlite3 database at Electron's `userData`
//                   directory, enables WAL mode for better concurrency, and
//                   caches the connection to avoid repeated open/close overhead.
export function getDb(): Database.Database {
  if (cachedDb) return cachedDb

  const dbPath = join(app.getPath('userData'), DB_FILENAME)
  const db = new Database(dbPath)

  // These PRAGMAs improve concurrency and reduce locking issues.
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')

  cachedDb = db
  return db
}

