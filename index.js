import { app, ipcMain, BrowserWindow, nativeImage, Tray, Menu } from "electron";
import { statSync, existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { readFile } from "node:fs/promises";
import keytar from "keytar";
import https from "node:https";
import { execFile, spawn } from "node:child_process";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
let cachedDb = null;
const DB_FILENAME = "hamstudy-pro.sqlite";
function getDb() {
  if (cachedDb) return cachedDb;
  const dbPath = join(app.getPath("userData"), DB_FILENAME);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  cachedDb = db;
  return db;
}
const XP_THRESHOLDS = [0, 500, 1200, 2200, 3500, 5e3];
const XP_LEVEL_TITLES = ["Novice", "Technician", "General", "Advanced", "Extra", "Elmer"];
const BADGE_DEFINITIONS = [
  { id: "first-correct", title: "First Step", description: "Get your first correct answer.", icon: "⭐" },
  { id: "century-club", title: "Century Club", description: "Answer 100 questions correctly.", icon: "🎯" },
  { id: "quiz-master", title: "Quiz Master", description: "Answer 500 questions correctly.", icon: "🏆" },
  { id: "week-warrior", title: "Week Warrior", description: "Maintain a 7-day study streak.", icon: "🔥" },
  { id: "fortnight-faithful", title: "Fortnight Faithful", description: "Maintain a 14-day study streak.", icon: "⚡" },
  { id: "monthly-master", title: "Monthly Master", description: "Maintain a 30-day study streak.", icon: "🌟" },
  { id: "perfect-exam", title: "Perfect Score", description: "Score 100% on a full exam simulation.", icon: "💯" },
  { id: "xp-pioneer", title: "XP Pioneer", description: "Reach 1,000 total XP.", icon: "🚀" },
  { id: "challenge-champion", title: "Challenge Champion", description: "Complete your first daily challenge.", icon: "🎖️" }
];
function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
function deriveMasteryState(attempts, accuracyPct) {
  if (attempts === 0) return "unseen";
  if (attempts >= 8 && accuracyPct >= 90) return "mastered";
  if (attempts >= 3 && accuracyPct >= 70) return "known";
  return "learning";
}
function sanitizeDailyGoalMinutes(value) {
  if (!Number.isFinite(value)) {
    return 20;
  }
  return Math.min(180, Math.max(5, Math.round(value)));
}
function sanitizeVisualTheme(value) {
  if (value === "signal-lab" || value === "field-manual" || value === "ocean-chart") {
    return value;
  }
  return "ocean-chart";
}
function sanitizeVoiceRate(value) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(2, Math.max(0.5, Number(value.toFixed(2))));
}
function ensureQuestionReviewColumns(db) {
  const columnRows = db.prepare(`PRAGMA table_info(questions)`).all();
  const columnNames = new Set(columnRows.map((row) => row.name));
  if (!columnNames.has("starred")) {
    db.exec(`ALTER TABLE questions ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`);
  }
  if (!columnNames.has("flagged")) {
    db.exec(`ALTER TABLE questions ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0`);
  }
}
function ensureUserSettingsColumns(db) {
  const columnRows = db.prepare(`PRAGMA table_info(user_settings)`).all();
  const columnNames = new Set(columnRows.map((row) => row.name));
  if (!columnNames.has("visual_theme")) {
    db.exec(`ALTER TABLE user_settings ADD COLUMN visual_theme TEXT NOT NULL DEFAULT 'ocean-chart'`);
  }
  if (!columnNames.has("voice_id")) {
    db.exec(`ALTER TABLE user_settings ADD COLUMN voice_id TEXT`);
  }
  if (!columnNames.has("voice_rate")) {
    db.exec(`ALTER TABLE user_settings ADD COLUMN voice_rate REAL NOT NULL DEFAULT 1.0`);
  }
}
function questionToDbRow(q) {
  return {
    id: q.id,
    exam_tier: q.examTier,
    sub_element: q.subElement,
    group_id: q.groupId,
    question_text: q.questionText,
    answers: JSON.stringify(q.answers),
    correct_index: q.correctIndex,
    refs: q.refs,
    hint_cache: null,
    explanation_cache: null,
    mnemonic: null,
    why_wrong_cache: null
  };
}
function mapDbQuestionRow(row) {
  return {
    id: row.id,
    examTier: row.exam_tier,
    subElement: row.sub_element,
    groupId: row.group_id,
    questionText: row.question_text,
    answers: JSON.parse(row.answers),
    correctIndex: row.correct_index,
    refs: row.refs,
    hint: row.hint_cache ?? void 0,
    explanation: row.explanation_cache ?? void 0,
    mnemonic: row.mnemonic ?? void 0,
    // TASK: Deserialize per-answer wrong-choice explanations from the DB TEXT column.
    // HOW CODE SOLVES: why_wrong_cache stores a JSON array; parse it back to string[]
    //                  so ExplanationPanel can index into it by answer position.
    whyWrong: row.why_wrong_cache ? JSON.parse(row.why_wrong_cache) : void 0,
    starred: Boolean(row.starred ?? 0),
    flagged: Boolean(row.flagged ?? 0)
  };
}
function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      exam_tier TEXT NOT NULL,
      sub_element TEXT NOT NULL,
      group_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      answers TEXT NOT NULL,
      correct_index INTEGER NOT NULL,
      refs TEXT NOT NULL,
      hint_cache TEXT,
      explanation_cache TEXT,
      mnemonic TEXT,
      why_wrong_cache TEXT,
      starred INTEGER NOT NULL DEFAULT 0,
      flagged INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_questions_exam_tier ON questions(exam_tier);
    CREATE INDEX IF NOT EXISTS idx_questions_sub_element ON questions(sub_element);
    CREATE INDEX IF NOT EXISTS idx_questions_group_id ON questions(group_id);

    CREATE TABLE IF NOT EXISTS user_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id TEXT NOT NULL,
      selected_index INTEGER NOT NULL,
      is_correct INTEGER NOT NULL,
      time_taken_ms INTEGER NOT NULL,
      answered_at TEXT NOT NULL,
      session_id TEXT NOT NULL,
      FOREIGN KEY(question_id) REFERENCES questions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_answers_question_id ON user_answers(question_id);
    CREATE INDEX IF NOT EXISTS idx_user_answers_answered_at ON user_answers(answered_at);
    CREATE INDEX IF NOT EXISTS idx_user_answers_session_id ON user_answers(session_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      mode TEXT NOT NULL,
      exam_tier TEXT NOT NULL,
      score INTEGER NOT NULL,
      total_questions INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

    CREATE TABLE IF NOT EXISTS srs_cards (
      question_id TEXT PRIMARY KEY,
      interval INTEGER NOT NULL,
      ease_factor REAL NOT NULL,
      next_review TEXT NOT NULL,
      repetitions INTEGER NOT NULL,
      FOREIGN KEY(question_id) REFERENCES questions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_srs_cards_next_review ON srs_cards(next_review);

    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      theme TEXT NOT NULL,
      visual_theme TEXT NOT NULL DEFAULT 'ocean-chart',
      daily_goal_minutes INTEGER NOT NULL,
      ai_provider TEXT,
      text_size TEXT NOT NULL,
      voice_id TEXT,
      voice_rate REAL NOT NULL DEFAULT 1.0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_challenge_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      learning_day TEXT NOT NULL UNIQUE,
      completed_at TEXT NOT NULL,
      challenge_target INTEGER NOT NULL,
      bonus_xp INTEGER NOT NULL,
      answers_at_completion INTEGER NOT NULL,
      streak_days_at_completion INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_daily_challenge_events_completed_at
      ON daily_challenge_events(completed_at DESC);

    CREATE TABLE IF NOT EXISTS chat_history (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      provider TEXT NOT NULL,
      question_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(question_id) REFERENCES questions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_chat_history_created_at
      ON chat_history(created_at DESC);

    CREATE TABLE IF NOT EXISTS user_mnemonics (
      question_id TEXT PRIMARY KEY,
      mnemonic TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(question_id) REFERENCES questions(id)
    );
  `);
  ensureQuestionReviewColumns(db);
  ensureUserSettingsColumns(db);
  try {
    db.exec("ALTER TABLE questions ADD COLUMN why_wrong_cache TEXT");
  } catch {
  }
}
function getQuestionsCount(db) {
  const row = db.prepare("SELECT COUNT(*) as count FROM questions").get();
  return row.count;
}
function seedQuestions(db, questions) {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO questions (
      id, exam_tier, sub_element, group_id, question_text,
      answers, correct_index, refs, hint_cache, explanation_cache, mnemonic, why_wrong_cache
    ) VALUES (
      @id, @exam_tier, @sub_element, @group_id, @question_text,
      @answers, @correct_index, @refs, @hint_cache, @explanation_cache, @mnemonic, @why_wrong_cache
    );
  `);
  const transaction = db.transaction((rows) => {
    for (const q of rows) {
      insertStmt.run(questionToDbRow(q));
    }
  });
  transaction(questions);
}
function getQuestionPool(db, tier) {
  const rows = db.prepare(
    `
      SELECT
        id,
        exam_tier,
        sub_element,
        group_id,
        question_text,
        answers,
        correct_index,
        refs,
        hint_cache,
        explanation_cache,
        mnemonic,
        why_wrong_cache,
        starred,
        flagged
      FROM questions
      WHERE exam_tier = ?
      ORDER BY id ASC
      `
  ).all(tier);
  return rows.map(mapDbQuestionRow);
}
function getQuestionById(db, questionId) {
  const row = db.prepare(
    `
      SELECT
        id,
        exam_tier,
        sub_element,
        group_id,
        question_text,
        answers,
        correct_index,
        refs,
        hint_cache,
        explanation_cache,
        mnemonic,
        why_wrong_cache,
        starred,
        flagged
      FROM questions
      WHERE id = ?
      LIMIT 1
      `
  ).get(questionId);
  return row ? mapDbQuestionRow(row) : null;
}
function searchQuestions(db, filter) {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const term = `%${filter.query.trim()}%`;
  const baseSelect = `
    SELECT
      id,
      exam_tier,
      sub_element,
      group_id,
      question_text,
      answers,
      correct_index,
      refs,
      hint_cache,
      explanation_cache,
      mnemonic,
      starred,
      flagged
    FROM questions
  `;
  const whereSearch = `
    (id LIKE @term OR question_text LIKE @term OR refs LIKE @term OR sub_element LIKE @term OR group_id LIKE @term)
  `;
  const rows = filter.tier ? db.prepare(
    `${baseSelect} WHERE exam_tier = @tier AND ${whereSearch} ORDER BY id ASC LIMIT @limit`
  ).all({ term, tier: filter.tier, limit }) : db.prepare(`${baseSelect} WHERE ${whereSearch} ORDER BY id ASC LIMIT @limit`).all({ term, limit });
  return rows.map(mapDbQuestionRow);
}
function getWeakAreaQuestionPool(db, filter) {
  const limit = Math.min(Math.max(filter.limit ?? 35, 1), 100);
  const recentAnswers = Math.min(Math.max(filter.recentAnswers ?? 200, 20), 2e3);
  const weakSubElements = Math.min(Math.max(filter.weakSubElements ?? 4, 1), 12);
  const rows = db.prepare(
    `
      WITH recent AS (
        SELECT ua.is_correct, q.sub_element
        FROM user_answers ua
        JOIN questions q ON q.id = ua.question_id
        WHERE q.exam_tier = @tier
        ORDER BY ua.answered_at DESC
        LIMIT @recent_answers
      ),
      weak AS (
        SELECT
          sub_element,
          AVG(is_correct * 1.0) AS accuracy,
          COUNT(*) AS attempts
        FROM recent
        GROUP BY sub_element
        ORDER BY accuracy ASC, attempts DESC
        LIMIT @weak_sub_elements
      )
      SELECT
        q.id,
        q.exam_tier,
        q.sub_element,
        q.group_id,
        q.question_text,
        q.answers,
        q.correct_index,
        q.refs,
        q.hint_cache,
        q.explanation_cache,
        q.mnemonic,
        q.why_wrong_cache,
        q.starred,
        q.flagged
      FROM questions q
      WHERE q.exam_tier = @tier
        AND (
          (SELECT COUNT(*) FROM weak) = 0
          OR q.sub_element IN (SELECT sub_element FROM weak)
        )
      ORDER BY q.id ASC
      LIMIT @limit
      `
  ).all({
    tier: filter.tier,
    recent_answers: recentAnswers,
    weak_sub_elements: weakSubElements,
    limit
  });
  return rows.map(mapDbQuestionRow);
}
function getCustomQuizQuestionPool(db, filter) {
  const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
  const subElements = Array.from(
    new Set((filter.subElements ?? []).map((s) => s.trim()).filter((s) => s.length > 0))
  ).slice(0, 30);
  const subElementClause = subElements.length > 0 ? ` AND sub_element IN (${subElements.map(() => "?").join(", ")})` : "";
  const sql = `
    SELECT
      id,
      exam_tier,
      sub_element,
      group_id,
      question_text,
      answers,
      correct_index,
      refs,
      hint_cache,
      explanation_cache,
      mnemonic,
      starred,
      flagged
    FROM questions
    WHERE exam_tier = ?${subElementClause}
    ORDER BY RANDOM()
    LIMIT ?
  `;
  const params = [filter.tier, ...subElements, limit];
  const rows = db.prepare(sql).all(...params);
  return rows.map(mapDbQuestionRow);
}
function getQuestionBrowserRows(db, filter) {
  const limit = Math.min(Math.max(filter.limit ?? 500, 1), 1200);
  const params = { tier: filter.tier, limit };
  const whereParts = ["q.exam_tier = @tier"];
  const normalizedQuery = filter.query?.trim() ?? "";
  if (normalizedQuery.length > 0) {
    whereParts.push(
      "(q.id LIKE @term OR q.question_text LIKE @term OR q.refs LIKE @term OR q.sub_element LIKE @term OR q.group_id LIKE @term)"
    );
    params.term = `%${normalizedQuery}%`;
  }
  if (filter.subElement && filter.subElement !== "all") {
    whereParts.push("q.sub_element = @sub_element");
    params.sub_element = filter.subElement;
  }
  if (filter.starredOnly) {
    whereParts.push("q.starred = 1");
  }
  if (filter.flaggedOnly) {
    whereParts.push("q.flagged = 1");
  }
  const rows = db.prepare(
    `
      SELECT
        q.id,
        q.exam_tier,
        q.sub_element,
        q.group_id,
        q.question_text,
        q.refs,
        q.starred,
        q.flagged,
        COALESCE(stats.attempts, 0) AS attempts,
        COALESCE(stats.correct_answers, 0) AS correct_answers
      FROM questions q
      LEFT JOIN (
        SELECT
          question_id,
          COUNT(*) AS attempts,
          SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct_answers
        FROM user_answers
        GROUP BY question_id
      ) stats ON stats.question_id = q.id
      WHERE ${whereParts.join(" AND ")}
      ORDER BY q.id ASC
      LIMIT @limit
      `
  ).all(params);
  const mapped = rows.map((row) => {
    const accuracyPct = row.attempts > 0 ? Number((row.correct_answers / row.attempts * 100).toFixed(2)) : 0;
    const masteryState = deriveMasteryState(row.attempts, accuracyPct);
    return {
      id: row.id,
      examTier: row.exam_tier,
      subElement: row.sub_element,
      groupId: row.group_id,
      questionText: row.question_text,
      refs: row.refs,
      starred: Boolean(row.starred ?? 0),
      flagged: Boolean(row.flagged ?? 0),
      attempts: row.attempts,
      correctAnswers: row.correct_answers,
      accuracyPct,
      masteryState
    };
  });
  const masteryFilter = filter.mastery ?? "all";
  if (masteryFilter === "all") {
    return mapped;
  }
  return mapped.filter((row) => row.masteryState === masteryFilter);
}
function updateQuestionReviewState(db, input) {
  const starredValue = typeof input.starred === "boolean" ? input.starred ? 1 : 0 : null;
  const flaggedValue = typeof input.flagged === "boolean" ? input.flagged ? 1 : 0 : null;
  db.prepare(
    `
    UPDATE questions
    SET
      starred = COALESCE(@starred, starred),
      flagged = COALESCE(@flagged, flagged)
    WHERE id = @question_id
    `
  ).run({
    starred: starredValue,
    flagged: flaggedValue,
    question_id: input.questionId
  });
  const updated = getQuestionById(db, input.questionId);
  if (!updated) {
    throw new Error(`Question not found for id ${input.questionId}.`);
  }
  return updated;
}
function getQuestionBrowserDetail(db, filter) {
  const question = getQuestionById(db, filter.questionId);
  if (!question) {
    return null;
  }
  const recentLimit = Math.min(Math.max(filter.recentLimit ?? 8, 1), 25);
  const recentAnswers = db.prepare(
    `
      SELECT id, question_id, selected_index, is_correct, time_taken_ms, answered_at, session_id
      FROM user_answers
      WHERE question_id = ?
      ORDER BY answered_at DESC
      LIMIT ?
      `
  ).all(filter.questionId, recentLimit);
  const historySummaryRow = db.prepare(
    `
      SELECT
        COUNT(*) AS attempts,
        COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers,
        COALESCE(AVG(time_taken_ms), 0) AS avg_time_ms,
        MAX(answered_at) AS last_answered_at
      FROM user_answers
      WHERE question_id = ?
      `
  ).get(filter.questionId);
  const srsRow = db.prepare(
    `
      SELECT question_id, interval, ease_factor, next_review, repetitions
      FROM srs_cards
      WHERE question_id = ?
      LIMIT 1
      `
  ).get(filter.questionId);
  const historyAccuracy = historySummaryRow.attempts > 0 ? Number((historySummaryRow.correct_answers / historySummaryRow.attempts * 100).toFixed(2)) : 0;
  return {
    question,
    srsCard: srsRow ? {
      questionId: srsRow.question_id,
      interval: srsRow.interval,
      easeFactor: srsRow.ease_factor,
      nextReview: srsRow.next_review,
      repetitions: srsRow.repetitions
    } : null,
    historySummary: {
      attempts: historySummaryRow.attempts,
      correctAnswers: historySummaryRow.correct_answers,
      accuracyPct: historyAccuracy,
      averageTimeMs: Number(historySummaryRow.avg_time_ms.toFixed(2)),
      lastAnsweredAt: historySummaryRow.last_answered_at
    },
    recentAnswers: recentAnswers.map((row) => ({
      id: row.id,
      questionId: row.question_id,
      selectedIndex: row.selected_index,
      isCorrect: row.is_correct === 1,
      timeTakenMs: row.time_taken_ms,
      answeredAt: row.answered_at,
      sessionId: row.session_id
    }))
  };
}
function saveUserAnswer(db, input) {
  const answeredAt = input.answeredAt ?? (/* @__PURE__ */ new Date()).toISOString();
  const result = db.prepare(
    `
      INSERT INTO user_answers (
        question_id,
        selected_index,
        is_correct,
        time_taken_ms,
        answered_at,
        session_id
      ) VALUES (?, ?, ?, ?, ?, ?)
      `
  ).run(
    input.questionId,
    input.selectedIndex,
    input.isCorrect ? 1 : 0,
    input.timeTakenMs,
    answeredAt,
    input.sessionId
  );
  try {
    recordDailyChallengeCompletionIfNeeded(db, answeredAt);
  } catch {
  }
  return {
    id: Number(result.lastInsertRowid),
    questionId: input.questionId,
    selectedIndex: input.selectedIndex,
    isCorrect: input.isCorrect,
    timeTakenMs: input.timeTakenMs,
    answeredAt,
    sessionId: input.sessionId
  };
}
function recordDailyChallengeCompletionIfNeeded(db, answeredAtIso) {
  const dailyChallengeTarget = 10;
  const dailyChallengeBonusXp = 50;
  const streakGraceHours = 2;
  const learningTimeModifier = `-${streakGraceHours} hours`;
  const answeredAtDate = new Date(answeredAtIso);
  const normalizedAnsweredAt = Number.isNaN(answeredAtDate.getTime()) ? (/* @__PURE__ */ new Date()).toISOString() : answeredAtDate.toISOString();
  const learningDay = toLearningDayKey(new Date(normalizedAnsweredAt), streakGraceHours);
  const existing = db.prepare(
    `
      SELECT id
      FROM daily_challenge_events
      WHERE learning_day = ?
      LIMIT 1
      `
  ).get(learningDay);
  if (existing) {
    return;
  }
  const dayCountRow = db.prepare(
    `
      SELECT COUNT(*) AS answers
      FROM user_answers
      WHERE date(datetime(answered_at, ?)) = ?
      `
  ).get(learningTimeModifier, learningDay);
  if (dayCountRow.answers < dailyChallengeTarget) {
    return;
  }
  const activeDayRows = db.prepare(
    `
      SELECT DISTINCT date(datetime(answered_at, ?)) AS learning_day
      FROM user_answers
      WHERE datetime(answered_at) <= datetime(?)
      `
  ).all(learningTimeModifier, normalizedAnsweredAt);
  const activeDays = new Set(activeDayRows.map((row) => row.learning_day));
  const streakDaysAtCompletion = computeCurrentStreak(activeDays, learningDay);
  db.prepare(
    `
    INSERT INTO daily_challenge_events (
      learning_day,
      completed_at,
      challenge_target,
      bonus_xp,
      answers_at_completion,
      streak_days_at_completion
    ) VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run(
    learningDay,
    normalizedAnsweredAt,
    dailyChallengeTarget,
    dailyChallengeBonusXp,
    dayCountRow.answers,
    streakDaysAtCompletion
  );
}
function getProgressStats(db) {
  const row = db.prepare(
    `
      SELECT
        COUNT(*) AS total_answers,
        COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers,
        COUNT(DISTINCT question_id) AS unique_questions_answered
      FROM user_answers
      `
  ).get();
  const accuracyPct = row.total_answers > 0 ? Number((row.correct_answers / row.total_answers * 100).toFixed(2)) : 0;
  return {
    totalAnswers: row.total_answers,
    correctAnswers: row.correct_answers,
    accuracyPct,
    uniqueQuestionsAnswered: row.unique_questions_answered
  };
}
function getTierProgressStats(db) {
  const rows = db.prepare(
    `
      SELECT
        q.exam_tier,
        COUNT(ua.id) AS total_answers,
        COALESCE(SUM(CASE WHEN ua.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers,
        COUNT(DISTINCT ua.question_id) AS unique_questions_answered,
        COUNT(DISTINCT q.id) AS total_questions
      FROM questions q
      LEFT JOIN user_answers ua ON ua.question_id = q.id
      GROUP BY q.exam_tier
      ORDER BY q.exam_tier ASC
      `
  ).all();
  return rows.map((row) => {
    const accuracyPct = row.total_answers > 0 ? Number((row.correct_answers / row.total_answers * 100).toFixed(2)) : 0;
    const coveragePct = row.total_questions > 0 ? Number((row.unique_questions_answered / row.total_questions * 100).toFixed(2)) : 0;
    return {
      tier: row.exam_tier,
      totalAnswers: row.total_answers,
      correctAnswers: row.correct_answers,
      accuracyPct,
      uniqueQuestionsAnswered: row.unique_questions_answered,
      totalQuestions: row.total_questions,
      coveragePct
    };
  });
}
function toLearningDayKey(date, graceHours) {
  const shifted = new Date(date.getTime() - graceHours * 60 * 60 * 1e3);
  return shifted.toISOString().slice(0, 10);
}
function computeCurrentStreak(activeDays, todayKey) {
  if (activeDays.size === 0) {
    return 0;
  }
  let streak = 0;
  let cursor = /* @__PURE__ */ new Date(`${todayKey}T00:00:00.000Z`);
  while (true) {
    const cursorKey = cursor.toISOString().slice(0, 10);
    if (!activeDays.has(cursorKey)) {
      break;
    }
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1e3);
  }
  return streak;
}
function computeLongestStreak(dayKeys) {
  if (dayKeys.length === 0) {
    return 0;
  }
  const sorted = [...dayKeys].sort((a, b) => a.localeCompare(b));
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = (/* @__PURE__ */ new Date(`${sorted[i - 1]}T00:00:00.000Z`)).getTime();
    const next = (/* @__PURE__ */ new Date(`${sorted[i]}T00:00:00.000Z`)).getTime();
    const diffDays = Math.round((next - prev) / (24 * 60 * 60 * 1e3));
    if (diffDays === 1) {
      current += 1;
      if (current > longest) {
        longest = current;
      }
    } else {
      current = 1;
    }
  }
  return longest;
}
function resolveLevelByXp(totalXp) {
  let levelIndex = 0;
  for (let i = 0; i < XP_THRESHOLDS.length; i += 1) {
    if (totalXp >= XP_THRESHOLDS[i]) {
      levelIndex = i;
    }
  }
  return {
    levelIndex,
    levelTitle: XP_LEVEL_TITLES[levelIndex]
  };
}
function getUserProgressionSummary(db, filter) {
  const dailyChallengeTarget = 10;
  const dailyChallengeXpBonusValue = 50;
  const streakGraceHours = Math.min(Math.max(filter?.streakGraceHours ?? 2, 0), 6);
  const learningTimeModifier = `-${streakGraceHours} hours`;
  const statsRow = db.prepare(
    `
      SELECT
        COUNT(*) AS total_answers,
        COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers
      FROM user_answers
      `
  ).get();
  const dayRows = db.prepare(
    `
      SELECT datetime(answered_at, ?) AS learning_time, is_correct
      FROM user_answers
      ORDER BY answered_at DESC
      `
  ).all(learningTimeModifier);
  const todayKey = toLearningDayKey(/* @__PURE__ */ new Date(), streakGraceHours);
  const dayTotals = /* @__PURE__ */ new Map();
  for (const row of dayRows) {
    const dayKey = row.learning_time.slice(0, 10);
    const current = dayTotals.get(dayKey) ?? { answers: 0, correct: 0 };
    current.answers += 1;
    current.correct += row.is_correct === 1 ? 1 : 0;
    dayTotals.set(dayKey, current);
  }
  const activeDays = new Set(dayTotals.keys());
  const todayTotals = dayTotals.get(todayKey) ?? { answers: 0, correct: 0 };
  const currentStreakDays = computeCurrentStreak(activeDays, todayKey);
  const longestStreakDays = computeLongestStreak(Array.from(dayTotals.keys()));
  const dailyChallengeCompletedToday = todayTotals.answers >= dailyChallengeTarget;
  const dailyChallengeRemaining = Math.max(0, dailyChallengeTarget - todayTotals.answers);
  const dailyChallengeXpBonus = dailyChallengeCompletedToday ? dailyChallengeXpBonusValue : 0;
  const baseXp = statsRow.correct_answers * 10;
  const participationXp = (statsRow.total_answers - statsRow.correct_answers) * 2;
  const streakXp = currentStreakDays * 25;
  const totalXp = baseXp + participationXp + streakXp + dailyChallengeXpBonus;
  const { levelIndex, levelTitle } = resolveLevelByXp(totalXp);
  const nextThreshold = XP_THRESHOLDS[levelIndex + 1] ?? null;
  return {
    totalXp,
    levelIndex,
    levelTitle,
    xpToNextLevel: nextThreshold === null ? 0 : Math.max(0, nextThreshold - totalXp),
    nextLevelTitle: XP_LEVEL_TITLES[levelIndex + 1] ?? null,
    currentStreakDays,
    longestStreakDays,
    todaysAnswers: todayTotals.answers,
    todaysCorrectAnswers: todayTotals.correct,
    todaysAccuracyPct: todayTotals.answers > 0 ? Number((todayTotals.correct / todayTotals.answers * 100).toFixed(2)) : 0,
    dailyChallengeTarget,
    dailyChallengeCompletedToday,
    dailyChallengeRemaining,
    dailyChallengeXpBonus
  };
}
function getProgressionTrend(db, filter) {
  const days = Math.min(Math.max(filter?.days ?? 14, 7), 90);
  const streakGraceHours = Math.min(Math.max(filter?.streakGraceHours ?? 2, 0), 6);
  const tier = filter?.tier ?? "all";
  const learningTimeModifier = `-${streakGraceHours} hours`;
  const rows = tier === "all" ? db.prepare(
    `
            SELECT datetime(answered_at, ?) AS learning_time, is_correct
            FROM user_answers
            ORDER BY answered_at ASC, id ASC
            `
  ).all(learningTimeModifier) : db.prepare(
    `
            SELECT datetime(ua.answered_at, ?) AS learning_time, ua.is_correct
            FROM user_answers ua
            JOIN questions q ON q.id = ua.question_id
            WHERE q.exam_tier = ?
            ORDER BY ua.answered_at ASC, ua.id ASC
            `
  ).all(learningTimeModifier, tier);
  const byDay = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const dayKey = row.learning_time.slice(0, 10);
    const current = byDay.get(dayKey) ?? { answers: 0, correct: 0 };
    current.answers += 1;
    current.correct += row.is_correct === 1 ? 1 : 0;
    byDay.set(dayKey, current);
  }
  const today = toLearningDayKey(/* @__PURE__ */ new Date(), streakGraceHours);
  const endDate = /* @__PURE__ */ new Date(`${today}T00:00:00.000Z`);
  const startDate = new Date(endDate.getTime() - (days - 1) * 24 * 60 * 60 * 1e3);
  let cumulativeXp = 0;
  let streakDays = 0;
  let previousDayWasActive = false;
  const points = [];
  for (let i = 0; i < days; i += 1) {
    const cursor = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1e3);
    const dayKey = cursor.toISOString().slice(0, 10);
    const day = byDay.get(dayKey) ?? { answers: 0, correct: 0 };
    if (day.answers > 0) {
      streakDays = previousDayWasActive ? streakDays + 1 : 1;
      previousDayWasActive = true;
    } else {
      streakDays = 0;
      previousDayWasActive = false;
    }
    const dailyChallengeCompleted = day.answers >= 10;
    const dailyXp = day.correct * 10 + (day.answers - day.correct) * 2 + (day.answers > 0 ? streakDays * 25 : 0) + (dailyChallengeCompleted ? 50 : 0);
    cumulativeXp += dailyXp;
    const { levelIndex, levelTitle } = resolveLevelByXp(cumulativeXp);
    points.push({
      date: dayKey,
      totalXp: cumulativeXp,
      dailyXp,
      levelIndex,
      levelTitle,
      streakDays,
      answers: day.answers,
      correctAnswers: day.correct,
      dailyChallengeCompleted
    });
  }
  return { points };
}
function getDailyChallengeEvents(db, filter) {
  const limit = Math.min(Math.max(filter?.limit ?? 20, 1), 100);
  const rows = db.prepare(
    `
      SELECT
        id,
        learning_day,
        completed_at,
        challenge_target,
        bonus_xp,
        answers_at_completion,
        streak_days_at_completion
      FROM daily_challenge_events
      ORDER BY completed_at DESC, id DESC
      LIMIT ?
      `
  ).all(limit);
  return rows.map((row) => ({
    id: row.id,
    learningDay: row.learning_day,
    completedAt: row.completed_at,
    challengeTarget: row.challenge_target,
    bonusXp: row.bonus_xp,
    answersAtCompletion: row.answers_at_completion,
    streakDaysAtCompletion: row.streak_days_at_completion
  }));
}
function getAccuracyHeatmap(db, filter) {
  const tier = filter?.tier ?? "all";
  const minAttempts = Math.min(Math.max(filter?.minAttempts ?? 0, 0), 100);
  const limit = Math.min(Math.max(filter?.limit ?? 240, 1), 480);
  const rows = tier === "all" ? db.prepare(
    `
            SELECT
              q.exam_tier,
              q.sub_element,
              q.group_id,
              COUNT(ua.id) AS attempts,
              COALESCE(SUM(CASE WHEN ua.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers
            FROM questions q
            LEFT JOIN user_answers ua ON ua.question_id = q.id
            GROUP BY q.exam_tier, q.sub_element, q.group_id
            HAVING COUNT(ua.id) >= ?
            ORDER BY
              CASE WHEN COUNT(ua.id) = 0 THEN 0 ELSE (CAST(SUM(CASE WHEN ua.is_correct = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(ua.id)) END ASC,
              COUNT(ua.id) DESC,
              q.group_id ASC
            LIMIT ?
            `
  ).all(minAttempts, limit) : db.prepare(
    `
            SELECT
              q.exam_tier,
              q.sub_element,
              q.group_id,
              COUNT(ua.id) AS attempts,
              COALESCE(SUM(CASE WHEN ua.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_answers
            FROM questions q
            LEFT JOIN user_answers ua ON ua.question_id = q.id
            WHERE q.exam_tier = ?
            GROUP BY q.exam_tier, q.sub_element, q.group_id
            HAVING COUNT(ua.id) >= ?
            ORDER BY
              CASE WHEN COUNT(ua.id) = 0 THEN 0 ELSE (CAST(SUM(CASE WHEN ua.is_correct = 1 THEN 1 ELSE 0 END) AS REAL) / COUNT(ua.id)) END ASC,
              COUNT(ua.id) DESC,
              q.group_id ASC
            LIMIT ?
            `
  ).all(tier, minAttempts, limit);
  return {
    cells: rows.map((row) => ({
      examTier: row.exam_tier,
      subElement: row.sub_element,
      groupId: row.group_id,
      attempts: row.attempts,
      correctAnswers: row.correct_answers,
      accuracyPct: row.attempts > 0 ? Number((row.correct_answers / row.attempts * 100).toFixed(2)) : 0
    }))
  };
}
function getSessionHistory(db, filter) {
  const limit = Math.min(Math.max(filter?.limit ?? 20, 1), 200);
  const rows = db.prepare(
    `
      SELECT id, started_at, ended_at, mode, exam_tier, score, total_questions
      FROM sessions
      ORDER BY started_at DESC
      LIMIT ?
      `
  ).all(limit);
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    mode: r.mode,
    examTier: r.exam_tier,
    score: r.score,
    totalQuestions: r.total_questions
  }));
}
function getRecentAnswerActivity(db, filter) {
  const limit = Math.min(Math.max(filter?.limit ?? 12, 1), 500);
  const rows = db.prepare(
    `
      SELECT
        ua.id,
        ua.question_id,
        q.exam_tier,
        q.sub_element,
        ua.is_correct,
        ua.answered_at,
        ua.session_id
      FROM user_answers ua
      JOIN questions q ON q.id = ua.question_id
      ORDER BY ua.answered_at DESC, ua.id DESC
      LIMIT ?
      `
  ).all(limit);
  return rows.map((row) => ({
    id: row.id,
    questionId: row.question_id,
    examTier: row.exam_tier,
    subElement: row.sub_element,
    isCorrect: row.is_correct === 1,
    answeredAt: row.answered_at,
    sessionId: row.session_id
  }));
}
function backfillSrsCardsFromAnswerHistory(db) {
  const result = db.prepare(
    `
      INSERT OR IGNORE INTO srs_cards (question_id, interval, ease_factor, next_review, repetitions)
      SELECT DISTINCT
        ua.question_id,
        1,
        2.5,
        datetime('now'),
        0
      FROM user_answers ua
      JOIN questions q ON q.id = ua.question_id
      `
  ).run();
  return result.changes;
}
function getDueSrsQueue(db, filter) {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 300);
  const rows = db.prepare(
    `
      SELECT
        q.id,
        q.exam_tier,
        q.sub_element,
        q.group_id,
        q.question_text,
        q.answers,
        q.correct_index,
        q.refs,
        q.hint_cache,
        q.explanation_cache,
        q.mnemonic,
        q.why_wrong_cache,
        q.starred,
        q.flagged
      FROM srs_cards s
      JOIN questions q ON q.id = s.question_id
      WHERE q.exam_tier = ?
        AND datetime(s.next_review) <= datetime('now')
      ORDER BY datetime(s.next_review) ASC, q.id ASC
      LIMIT ?
      `
  ).all(filter.tier, limit);
  return rows.map(mapDbQuestionRow);
}
function recordSrsReview(db, input) {
  const reviewedAt = input.reviewedAt ? new Date(input.reviewedAt) : /* @__PURE__ */ new Date();
  const normalizedReviewedAt = Number.isNaN(reviewedAt.getTime()) ? /* @__PURE__ */ new Date() : reviewedAt;
  const existing = db.prepare(
    `
      SELECT interval, ease_factor, repetitions
      FROM srs_cards
      WHERE question_id = ?
      LIMIT 1
      `
  ).get(input.questionId);
  const priorInterval = existing?.interval ?? 1;
  const priorEaseFactor = existing?.ease_factor ?? 2.5;
  const priorRepetitions = existing?.repetitions ?? 0;
  const quality = input.isCorrect ? 4 : 2;
  const easeAdjustment = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  const nextEaseFactor = Math.max(1.3, Number((priorEaseFactor + easeAdjustment).toFixed(2)));
  const nextRepetitions = input.isCorrect ? priorRepetitions + 1 : 0;
  const nextInterval = input.isCorrect ? nextRepetitions === 1 ? 1 : nextRepetitions === 2 ? 6 : Math.max(1, Math.round(priorInterval * nextEaseFactor)) : 1;
  const nextReview = addDays(normalizedReviewedAt, nextInterval).toISOString();
  db.prepare(
    `
    INSERT INTO srs_cards (question_id, interval, ease_factor, next_review, repetitions)
    VALUES (@question_id, @interval, @ease_factor, @next_review, @repetitions)
    ON CONFLICT(question_id) DO UPDATE SET
      interval = excluded.interval,
      ease_factor = excluded.ease_factor,
      next_review = excluded.next_review,
      repetitions = excluded.repetitions
    `
  ).run({
    question_id: input.questionId,
    interval: nextInterval,
    ease_factor: nextEaseFactor,
    next_review: nextReview,
    repetitions: nextRepetitions
  });
  return {
    questionId: input.questionId,
    interval: nextInterval,
    easeFactor: nextEaseFactor,
    nextReview,
    repetitions: nextRepetitions
  };
}
function upsertUserSettings(db, input) {
  const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const normalizedDailyGoalMinutes = sanitizeDailyGoalMinutes(input.dailyGoalMinutes);
  const normalizedVisualTheme = sanitizeVisualTheme(input.visualTheme);
  const normalizedVoiceRate = sanitizeVoiceRate(input.voiceRate);
  db.prepare(
    `
    INSERT INTO user_settings (id, theme, visual_theme, daily_goal_minutes, ai_provider, text_size, voice_id, voice_rate, updated_at)
    VALUES (1, @theme, @visual_theme, @daily_goal_minutes, @ai_provider, @text_size, @voice_id, @voice_rate, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      theme = excluded.theme,
      visual_theme = excluded.visual_theme,
      daily_goal_minutes = excluded.daily_goal_minutes,
      ai_provider = excluded.ai_provider,
      text_size = excluded.text_size,
      voice_id = excluded.voice_id,
      voice_rate = excluded.voice_rate,
      updated_at = excluded.updated_at
    `
  ).run({
    theme: input.theme,
    visual_theme: normalizedVisualTheme,
    daily_goal_minutes: normalizedDailyGoalMinutes,
    ai_provider: input.aiProvider,
    text_size: input.textSize,
    voice_id: input.voiceId,
    voice_rate: normalizedVoiceRate,
    updated_at: updatedAt
  });
  return {
    theme: input.theme,
    visualTheme: normalizedVisualTheme,
    dailyGoalMinutes: normalizedDailyGoalMinutes,
    aiProvider: input.aiProvider,
    textSize: input.textSize,
    voiceId: input.voiceId,
    voiceRate: normalizedVoiceRate
  };
}
function getUserSettings(db) {
  const row = db.prepare(
    `
      SELECT theme, visual_theme, daily_goal_minutes, ai_provider, text_size
           , voice_id, voice_rate
      FROM user_settings
      WHERE id = 1
      `
  ).get();
  if (!row) {
    return {
      theme: "system",
      visualTheme: "ocean-chart",
      dailyGoalMinutes: 20,
      aiProvider: null,
      textSize: "medium",
      voiceId: null,
      voiceRate: 1
    };
  }
  return {
    theme: row.theme,
    visualTheme: sanitizeVisualTheme(row.visual_theme),
    dailyGoalMinutes: sanitizeDailyGoalMinutes(row.daily_goal_minutes),
    aiProvider: row.ai_provider,
    textSize: row.text_size,
    voiceId: row.voice_id,
    voiceRate: sanitizeVoiceRate(row.voice_rate)
  };
}
function saveChatMessage(db, input) {
  const timestamp = input.timestamp ?? (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(
    `
    INSERT INTO chat_history (id, role, content, provider, question_id, created_at)
    VALUES (@id, @role, @content, @provider, @question_id, @created_at)
    `
  ).run({
    id: input.id,
    role: input.role,
    content: input.content,
    provider: input.provider,
    question_id: input.questionId ?? null,
    created_at: timestamp
  });
  return {
    id: input.id,
    role: input.role,
    content: input.content,
    timestamp
  };
}
function getRecentChatMessages(db, provider, limit = 12) {
  const normalizedLimit = Math.min(Math.max(Math.floor(limit), 1), 30);
  const rows = db.prepare(
    `
      SELECT id, role, content, created_at
      FROM chat_history
      WHERE provider = ?
      ORDER BY created_at DESC
      LIMIT ?
      `
  ).all(provider, normalizedLimit);
  return rows.reverse().map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp: row.created_at
  }));
}
function resetAppData(db) {
  const resetTransaction = db.transaction(() => {
    const clearedAnswers = db.prepare("DELETE FROM user_answers").run().changes;
    const clearedSessions = db.prepare("DELETE FROM sessions").run().changes;
    const clearedSrsCards = db.prepare("DELETE FROM srs_cards").run().changes;
    db.prepare("DELETE FROM chat_history").run();
    const resetQuestionReviewState = db.prepare("UPDATE questions SET starred = 0, flagged = 0 WHERE starred != 0 OR flagged != 0").run().changes;
    const clearedSettings = db.prepare("DELETE FROM user_settings").run().changes;
    return {
      clearedAnswers,
      clearedSessions,
      clearedSrsCards,
      resetQuestionReviewState,
      clearedSettings
    };
  });
  return resetTransaction();
}
function getUserMnemonic(db, questionId) {
  const row = db.prepare("SELECT mnemonic FROM user_mnemonics WHERE question_id = ?").get(questionId);
  return row?.mnemonic ?? null;
}
function upsertUserMnemonic(db, questionId, mnemonic) {
  db.prepare(
    `INSERT INTO user_mnemonics (question_id, mnemonic, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(question_id) DO UPDATE SET
       mnemonic = excluded.mnemonic,
       created_at = excluded.created_at`
  ).run(questionId, mnemonic, (/* @__PURE__ */ new Date()).toISOString());
}
function getEarnedBadges(db) {
  const stats = getProgressStats(db);
  const summary = getUserProgressionSummary(db);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const firstCorrectRow = db.prepare("SELECT answered_at FROM user_answers WHERE is_correct = 1 ORDER BY answered_at ASC LIMIT 1").get();
  const perfectExamRow = db.prepare(
    `SELECT started_at FROM sessions
       WHERE mode = 'exam' AND score = total_questions AND total_questions > 0
       ORDER BY started_at ASC LIMIT 1`
  ).get();
  const firstChallengeRow = db.prepare("SELECT completed_at FROM daily_challenge_events ORDER BY completed_at ASC LIMIT 1").get();
  function earnedAt(condition, date) {
    if (!condition) return null;
    return date ?? now;
  }
  const conditionMap = {
    "first-correct": earnedAt(stats.correctAnswers >= 1, firstCorrectRow?.answered_at),
    "century-club": earnedAt(stats.correctAnswers >= 100),
    "quiz-master": earnedAt(stats.correctAnswers >= 500),
    "week-warrior": earnedAt(summary.longestStreakDays >= 7),
    "fortnight-faithful": earnedAt(summary.longestStreakDays >= 14),
    "monthly-master": earnedAt(summary.longestStreakDays >= 30),
    "perfect-exam": earnedAt(Boolean(perfectExamRow), perfectExamRow?.started_at),
    "xp-pioneer": earnedAt(summary.totalXp >= 1e3),
    "challenge-champion": earnedAt(Boolean(firstChallengeRow), firstChallengeRow?.completed_at)
  };
  return BADGE_DEFINITIONS.map((def) => ({
    id: def.id,
    title: def.title,
    description: def.description,
    icon: def.icon,
    unlockedAt: conditionMap[def.id] ?? null
  }));
}
function parseIdToSubElementAndGroup(id) {
  const tierLetter = id[0];
  const subDigit = id[1];
  const groupLetter = id[2];
  return {
    subElement: `${tierLetter}${subDigit}`,
    groupId: `${tierLetter}${subDigit}${groupLetter}`
  };
}
function getBundledDataPath(...parts) {
  const basePath = app.isPackaged ? join(process.resourcesPath, "data") : join(process.cwd(), "data");
  return join(basePath, ...parts);
}
function ensureAppStateTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
function computeHintFilesSignature(paths) {
  return paths.map((path) => {
    const details = statSync(path);
    return `${path}:${details.size}:${Math.floor(details.mtimeMs)}`;
  }).join("|");
}
async function seedQuestionsIfNeeded(db) {
  initSchema(db);
  ensureAppStateTable(db);
  const existing = getQuestionsCount(db);
  if (existing > 0) return;
  const technicianPath = getBundledDataPath("technician.json");
  const generalPath = getBundledDataPath("general.json");
  const extraPath = getBundledDataPath("extra.json");
  const [technicianRaw, generalRaw, extraRaw] = await Promise.all([
    readFile(technicianPath, "utf8"),
    readFile(generalPath, "utf8"),
    readFile(extraPath, "utf8")
  ]);
  const technician = JSON.parse(technicianRaw);
  const general = JSON.parse(generalRaw);
  const extra = JSON.parse(extraRaw);
  const all = [];
  for (const q of technician) {
    const { subElement, groupId } = parseIdToSubElementAndGroup(q.id);
    all.push({
      id: q.id,
      examTier: "technician",
      subElement,
      groupId,
      questionText: q.question,
      answers: q.answers,
      correctIndex: q.correct,
      refs: q.refs
    });
  }
  for (const q of general) {
    const { subElement, groupId } = parseIdToSubElementAndGroup(q.id);
    all.push({
      id: q.id,
      examTier: "general",
      subElement,
      groupId,
      questionText: q.question,
      answers: q.answers,
      correctIndex: q.correct,
      refs: q.refs
    });
  }
  for (const q of extra) {
    const { subElement, groupId } = parseIdToSubElementAndGroup(q.id);
    all.push({
      id: q.id,
      examTier: "extra",
      subElement,
      groupId,
      questionText: q.question,
      answers: q.answers,
      correctIndex: q.correct,
      refs: q.refs
    });
  }
  seedQuestions(db, all);
}
async function applyHintsIfPresent(db) {
  ensureAppStateTable(db);
  const tiers = [
    { file: "technician" },
    { file: "general" },
    { file: "extra" }
  ];
  const hintPaths = tiers.map(({ file }) => getBundledDataPath("hints", `${file}.json`));
  const existingPaths = hintPaths.filter((path) => {
    try {
      statSync(path);
      return true;
    } catch {
      return false;
    }
  });
  if (existingPaths.length === 0) {
    return;
  }
  const nextSignature = computeHintFilesSignature(existingPaths);
  const readSignatureStmt = db.prepare(
    `SELECT value FROM app_state WHERE key = ?`
  );
  const writeSignatureStmt = db.prepare(
    `INSERT INTO app_state(key, value)
     VALUES ('hint_files_signature', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  const previousSignature = readSignatureStmt.get("hint_files_signature")?.value;
  if (previousSignature === nextSignature) {
    return;
  }
  const updateStmt = db.prepare(
    `UPDATE questions
        SET hint_cache        = CASE WHEN @hint        != '' THEN @hint        ELSE hint_cache        END,
            explanation_cache = CASE WHEN @explanation != '' THEN @explanation ELSE explanation_cache END,
            mnemonic          = CASE WHEN @mnemonic    != '' THEN @mnemonic    ELSE mnemonic          END,
            why_wrong_cache   = CASE WHEN @why_wrong_cache IS NOT NULL THEN @why_wrong_cache ELSE why_wrong_cache END
      WHERE id = @id`
  );
  const applyAll = db.transaction((hintMap) => {
    for (const [id, record] of Object.entries(hintMap)) {
      const hasWrongContent = Array.isArray(record.why_wrong) && record.why_wrong.some((s) => s);
      updateStmt.run({
        id,
        hint: record.hint ?? "",
        explanation: record.explanation ?? "",
        mnemonic: record.mnemonic ?? "",
        why_wrong_cache: hasWrongContent ? JSON.stringify(record.why_wrong) : null
      });
    }
  });
  for (const { file } of tiers) {
    const hintPath = getBundledDataPath("hints", `${file}.json`);
    try {
      const raw = await readFile(hintPath, "utf8");
      const hintMap = JSON.parse(raw);
      applyAll(hintMap);
    } catch {
    }
  }
  writeSignatureStmt.run(nextSignature);
}
const ELMER_TUTOR_SYSTEM_PROMPT = `You are Elmer, an expert HAM radio operator with an Amateur Extra license. You are a friendly and encouraging tutor for students preparing for their FCC exams.

Your rules:
- NEVER give the direct answer to a multiple-choice question.
- Instead, guide the student toward the correct answer by explaining the underlying concepts.
- If the student is stuck, provide analogies or mnemonics to help them remember.
- If the question involves regulations, cite the relevant FCC Part 97 rule.
- Keep your tone friendly, encouraging, and a little bit folksy, like a seasoned mentor.
- When asked about a specific question, address the student's confusion about it directly.
`;
const ADAPTIVE_PLAN_SYSTEM_PROMPT = `You are an adaptive study planner for FCC amateur radio exam preparation.
Given a student's progress snapshot, generate a focused, actionable daily study plan.

Rules:
- Be specific: reference sub-elements (T1, G3, E5, etc.) and question group IDs where relevant.
- Keep it short: 3 to 5 bullet points, no more.
- Base priorities on accuracy gaps, due SRS reviews, and streak momentum.
- Tone: direct and encouraging — like a coach giving a pre-session briefing.
- Output ONLY the bullet points. No preamble, no greeting, no sign-off.
- Each bullet starts with "•". No markdown. Plain text only.
`;
const MNEMONIC_SYSTEM_PROMPT = `You are a memory coach helping a student memorize FCC amateur radio exam answers.
Given a question and its correct answer, generate a single vivid, memorable mnemonic device.

Rules:
- Output ONLY the mnemonic itself — one to three sentences maximum.
- Make it specific to the correct answer text, not generic.
- Use wordplay, acronyms, visual imagery, or a short story — whatever fits best.
- Avoid restating the question. The student already sees it on screen.
- Plain text only. No markdown, no bullet points, no preamble.
`;
function buildMnemonicUserPrompt(question) {
  const correctAnswer = question.answers[question.correctIndex];
  const choiceLabel = String.fromCharCode(65 + question.correctIndex);
  return [
    `Question ID: ${question.id} (${question.subElement}, ${question.examTier})`,
    `Question: ${question.questionText}`,
    `Correct answer (${choiceLabel}): ${correctAnswer}`,
    "",
    "Generate a custom mnemonic to help me remember this answer."
  ].join("\n");
}
function buildAdaptivePlanUserPrompt(summary, trend) {
  const recentPoints = trend.points.slice(-7);
  const avgDailyXp = recentPoints.length > 0 ? Math.round(recentPoints.reduce((sum, p) => sum + p.dailyXp, 0) / recentPoints.length) : 0;
  const avgAccuracy = recentPoints.length > 0 ? Math.round(
    recentPoints.reduce((sum, p) => sum + (p.answers > 0 ? p.correctAnswers / p.answers : 0), 0) / recentPoints.length * 100
  ) : 0;
  return [
    "Student progress snapshot:",
    `Level: ${summary.levelTitle} (${summary.totalXp} XP total)`,
    `Streak: ${summary.currentStreakDays} day${summary.currentStreakDays === 1 ? "" : "s"} current, ${summary.longestStreakDays} day record`,
    `Today so far: ${summary.todaysAnswers} answers at ${summary.todaysAccuracyPct}% accuracy`,
    `7-day average: ${avgDailyXp} XP/day, ${avgAccuracy}% accuracy`,
    `Daily challenge: ${summary.dailyChallengeCompletedToday ? "completed today ✓" : `${summary.dailyChallengeRemaining} questions remaining`}`,
    "",
    "Generate a focused study plan for today."
  ].join("\n");
}
const API_HOST$1 = "api.anthropic.com";
const API_PATH$1 = "/v1/messages";
const DEFAULT_MODEL$1 = "claude-3-haiku-20240307";
function streamAnthropicChat(apiKey, input) {
  const payload = JSON.stringify({
    model: DEFAULT_MODEL$1,
    max_tokens: 1024,
    system: input.systemPrompt,
    messages: input.messages,
    stream: true
  });
  const options = {
    hostname: API_HOST$1,
    path: API_PATH$1,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Length": Buffer.byteLength(payload)
    }
  };
  const req = https.request(options);
  req.write(payload);
  req.end();
  return req;
}
function parseAnthropicStreamLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return null;
  }
  const jsonStr = trimmed.replace(/^data:\s*/, "");
  if (jsonStr === "" || jsonStr === "[DONE]") {
    return null;
  }
  try {
    const json = JSON.parse(jsonStr);
    if (json.type === "content_block_delta" && json.delta.type === "text_delta") {
      return json.delta.text;
    }
  } catch {
    return null;
  }
  return null;
}
const API_HOST = "api.openai.com";
const API_PATH = "/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";
function streamOpenAiChat(apiKey, input) {
  const payload = JSON.stringify({
    model: DEFAULT_MODEL,
    temperature: 0.7,
    stream: true,
    messages: [
      {
        role: "system",
        content: input.systemPrompt
      },
      ...input.messages
    ]
  });
  const options = {
    hostname: API_HOST,
    path: API_PATH,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Length": Buffer.byteLength(payload)
    }
  };
  const req = https.request(options);
  req.write(payload);
  req.end();
  return req;
}
function parseOpenAiStreamLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return null;
  }
  const jsonStr = trimmed.replace(/^data:\s*/, "");
  if (jsonStr === "" || jsonStr === "[DONE]") {
    return null;
  }
  try {
    const json = JSON.parse(jsonStr);
    return json.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}
const KEYCHAIN_SERVICE$1 = "hamstudy-pro";
const LEGACY_KEYCHAIN_SUFFIX = "-key";
const RECENT_CHAT_HISTORY_LIMIT = 12;
async function getStoredApiKey(provider) {
  const directMatch = await keytar.getPassword(KEYCHAIN_SERVICE$1, provider);
  if (directMatch) {
    return directMatch;
  }
  return keytar.getPassword(KEYCHAIN_SERVICE$1, `${provider}${LEGACY_KEYCHAIN_SUFFIX}`);
}
function buildQuestionContextBlock(payload) {
  if (!payload.questionId || !payload.questionText || !payload.answers?.length) {
    return "";
  }
  const formattedAnswers = payload.answers.map((answer, index) => `${String.fromCharCode(65 + index)}. ${answer}`).join("\n");
  return [
    "Current study question context:",
    `Question ID: ${payload.questionId}`,
    `Question: ${payload.questionText}`,
    "Answer choices:",
    formattedAnswers,
    `Reference: ${payload.refs ?? "None provided"}`
  ].join("\n");
}
function buildConversationMessages(history, userMessage, questionContextBlock) {
  const normalizedMessage = questionContextBlock ? `${questionContextBlock}

Student message:
${userMessage}` : userMessage;
  return [
    ...history.map((message) => ({
      role: message.role,
      content: message.content
    })),
    {
      role: "user",
      content: normalizedMessage
    }
  ];
}
async function handleGetAdaptivePlan() {
  const db = getDb();
  const settings = getUserSettings(db);
  const provider = settings.aiProvider;
  if (!provider) {
    throw new Error("No AI provider selected. Set one in Settings to use adaptive plans.");
  }
  const apiKey = await getStoredApiKey(provider);
  if (!apiKey) {
    throw new Error(`API key for ${provider} not found. Add it in Settings.`);
  }
  const [summary, trend] = await Promise.all([
    getUserProgressionSummary(db, { streakGraceHours: 2 }),
    getProgressionTrend(db, { days: 7, streakGraceHours: 2, tier: "all" })
  ]);
  const userPrompt = buildAdaptivePlanUserPrompt(summary, trend);
  const messages = [{ role: "user", content: userPrompt }];
  const apiReq = provider === "anthropic" ? streamAnthropicChat(apiKey, { systemPrompt: ADAPTIVE_PLAN_SYSTEM_PROMPT, messages }) : streamOpenAiChat(apiKey, { systemPrompt: ADAPTIVE_PLAN_SYSTEM_PROMPT, messages });
  const parseStreamLine = provider === "anthropic" ? parseAnthropicStreamLine : parseOpenAiStreamLine;
  return new Promise((resolve, reject) => {
    let buffer = "";
    let partialLine = "";
    apiReq.on("response", (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let errBody = "";
        res.on("data", (chunk) => {
          errBody += chunk.toString();
        });
        res.on("end", () => {
          reject(new Error(`AI provider error (${res.statusCode}): ${errBody.replace(/\s+/g, " ").trim()}`));
        });
        return;
      }
      res.on("data", (chunk) => {
        partialLine += chunk.toString();
        const lines = partialLine.split("\n");
        partialLine = lines.pop() ?? "";
        for (const line of lines) {
          const text = parseStreamLine(line);
          if (text) buffer += text;
        }
      });
      res.on("end", () => {
        const trailing = parseStreamLine(partialLine);
        if (trailing) buffer += trailing;
        resolve(buffer.trim());
      });
    });
    apiReq.on("error", (err) => {
      reject(err);
    });
  });
}
async function handleGetUserMnemonic(_evt, { questionId }) {
  const db = getDb();
  return getUserMnemonic(db, questionId);
}
async function handleGenerateMnemonic(_evt, { questionId }) {
  const db = getDb();
  const settings = getUserSettings(db);
  const provider = settings.aiProvider;
  if (!provider) {
    throw new Error("No AI provider selected. Set one in Settings to generate mnemonics.");
  }
  const apiKey = await getStoredApiKey(provider);
  if (!apiKey) {
    throw new Error(`API key for ${provider} not found. Add it in Settings.`);
  }
  const question = getQuestionById(db, questionId);
  if (!question) {
    throw new Error(`Question ${questionId} not found.`);
  }
  const userPrompt = buildMnemonicUserPrompt(question);
  const messages = [{ role: "user", content: userPrompt }];
  const apiReq = provider === "anthropic" ? streamAnthropicChat(apiKey, { systemPrompt: MNEMONIC_SYSTEM_PROMPT, messages }) : streamOpenAiChat(apiKey, { systemPrompt: MNEMONIC_SYSTEM_PROMPT, messages });
  const parseStreamLine = provider === "anthropic" ? parseAnthropicStreamLine : parseOpenAiStreamLine;
  return new Promise((resolve, reject) => {
    let buffer = "";
    let partialLine = "";
    apiReq.on("response", (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let errBody = "";
        res.on("data", (chunk) => {
          errBody += chunk.toString();
        });
        res.on("end", () => {
          reject(new Error(`AI provider error (${res.statusCode}): ${errBody.replace(/\s+/g, " ").trim()}`));
        });
        return;
      }
      res.on("data", (chunk) => {
        partialLine += chunk.toString();
        const lines = partialLine.split("\n");
        partialLine = lines.pop() ?? "";
        for (const line of lines) {
          const text = parseStreamLine(line);
          if (text) buffer += text;
        }
      });
      res.on("end", () => {
        const trailing = parseStreamLine(partialLine);
        if (trailing) buffer += trailing;
        const mnemonic = buffer.trim();
        if (mnemonic) {
          upsertUserMnemonic(db, questionId, mnemonic);
        }
        resolve(mnemonic);
      });
    });
    apiReq.on("error", (err) => {
      reject(err);
    });
  });
}
function registerAiIpcHandlers() {
  ipcMain.handle("ai:chat-message", handleChatMessage);
  ipcMain.handle("ai:get-chat-history", handleGetChatHistory);
  ipcMain.handle("ai:get-adaptive-plan", handleGetAdaptivePlan);
  ipcMain.handle("ai:get-user-mnemonic", handleGetUserMnemonic);
  ipcMain.handle("ai:generate-mnemonic", handleGenerateMnemonic);
}
async function handleGetChatHistory(_evt, filter) {
  const db = getDb();
  const settings = await getUserSettings(db);
  const provider = settings.aiProvider;
  if (!provider) {
    return [];
  }
  return getRecentChatMessages(db, provider, filter?.limit ?? RECENT_CHAT_HISTORY_LIMIT);
}
async function handleChatMessage(evt, payload) {
  const db = getDb();
  const settings = await getUserSettings(db);
  const provider = settings.aiProvider;
  if (!provider) {
    throw new Error("No AI provider selected in settings.");
  }
  const apiKey = await getStoredApiKey(provider);
  if (!apiKey) {
    throw new Error(`API key for ${provider} not found. Please add it in settings.`);
  }
  const trimmedMessage = payload.message.trim();
  if (trimmedMessage.length === 0) {
    throw new Error("Chat message cannot be empty.");
  }
  const referencedQuestion = payload.context?.questionId ? getQuestionById(db, payload.context.questionId) : null;
  const questionContextBlock = buildQuestionContextBlock({
    questionId: referencedQuestion?.id,
    questionText: referencedQuestion?.questionText,
    answers: referencedQuestion?.answers,
    refs: referencedQuestion?.refs
  });
  const recentHistory = getRecentChatMessages(db, provider, RECENT_CHAT_HISTORY_LIMIT);
  const conversation = buildConversationMessages(recentHistory, trimmedMessage, questionContextBlock);
  saveChatMessage(db, {
    id: `user-${Date.now()}`,
    role: "user",
    content: trimmedMessage,
    provider,
    questionId: referencedQuestion?.id
  });
  const apiReq = provider === "anthropic" ? streamAnthropicChat(apiKey, {
    systemPrompt: ELMER_TUTOR_SYSTEM_PROMPT,
    messages: conversation
  }) : streamOpenAiChat(apiKey, {
    systemPrompt: ELMER_TUTOR_SYSTEM_PROMPT,
    messages: conversation
  });
  const parseStreamLine = provider === "anthropic" ? parseAnthropicStreamLine : parseOpenAiStreamLine;
  await new Promise((resolve) => {
    let responseBuffer = "";
    let partialLineBuffer = "";
    apiReq.on("response", (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let errorBody = "";
        res.on("data", (chunk) => {
          errorBody += chunk.toString();
        });
        res.on("end", () => {
          const providerLabel = provider === "anthropic" ? "Anthropic" : "OpenAI";
          const normalizedErrorBody = errorBody.replace(/\s+/g, " ").trim();
          const detail = normalizedErrorBody.length > 0 ? ` ${normalizedErrorBody}` : "";
          evt.sender.send("ai:error", `${providerLabel} request failed (${res.statusCode}).${detail}`);
          resolve();
        });
        return;
      }
      res.on("data", (chunk) => {
        partialLineBuffer += chunk.toString();
        const lines = partialLineBuffer.split("\n");
        partialLineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const textChunk = parseStreamLine(line);
          if (!textChunk) {
            continue;
          }
          responseBuffer += textChunk;
          evt.sender.send("ai:chunk", textChunk);
        }
      });
      res.on("end", () => {
        const trailingChunk = parseStreamLine(partialLineBuffer);
        if (trailingChunk) {
          responseBuffer += trailingChunk;
          evt.sender.send("ai:chunk", trailingChunk);
        }
        if (responseBuffer.trim().length > 0) {
          saveChatMessage(db, {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: responseBuffer,
            provider,
            questionId: referencedQuestion?.id
          });
        }
        evt.sender.send("ai:chunk-end");
        resolve();
      });
    });
    apiReq.on("error", (err) => {
      evt.sender.send("ai:error", err.message);
      resolve();
    });
  });
}
function registerProgressIpcHandlers() {
  ipcMain.handle("progress:save-answer", handleSaveAnswer);
  ipcMain.handle("progress:get-stats", handleGetStats);
  ipcMain.handle("progress:get-tier-stats", handleGetTierStats);
  ipcMain.handle("progress:get-session-history", handleGetSessionHistory);
  ipcMain.handle("progress:get-recent-answer-activity", handleGetRecentAnswerActivity);
  ipcMain.handle("progress:get-daily-challenge-events", handleGetDailyChallengeEvents);
  ipcMain.handle("progress:get-accuracy-heatmap", handleGetAccuracyHeatmap);
  ipcMain.handle("progress:get-progression-summary", handleGetProgressionSummary);
  ipcMain.handle("progress:get-progression-trend", handleGetProgressionTrend);
  ipcMain.handle("progress:get-due-srs-queue", handleGetDueSrsQueue);
  ipcMain.handle("progress:record-srs-review", handleRecordSrsReview);
  ipcMain.handle("progress:get-earned-badges", handleGetEarnedBadges);
}
async function handleSaveAnswer(_evt, payload) {
  try {
    const db = getDb();
    return saveUserAnswer(db, payload);
  } catch {
    throw new Error("Failed to save answer progress.");
  }
}
async function handleGetStats() {
  try {
    const db = getDb();
    return getProgressStats(db);
  } catch {
    throw new Error("Failed to load progress stats.");
  }
}
async function handleGetTierStats() {
  try {
    const db = getDb();
    return getTierProgressStats(db);
  } catch {
    throw new Error("Failed to load tier progress stats.");
  }
}
async function handleGetSessionHistory(_evt, payload) {
  try {
    const db = getDb();
    return getSessionHistory(db, { limit: payload?.limit });
  } catch {
    throw new Error("Failed to load session history.");
  }
}
async function handleGetRecentAnswerActivity(_evt, payload) {
  try {
    const db = getDb();
    return getRecentAnswerActivity(db, { limit: payload?.limit });
  } catch {
    throw new Error("Failed to load recent answer activity.");
  }
}
async function handleGetDailyChallengeEvents(_evt, payload) {
  try {
    const db = getDb();
    return getDailyChallengeEvents(db, { limit: payload?.limit });
  } catch {
    throw new Error("Failed to load daily challenge events.");
  }
}
async function handleGetAccuracyHeatmap(_evt, payload) {
  try {
    const db = getDb();
    return getAccuracyHeatmap(db, payload);
  } catch {
    throw new Error("Failed to load accuracy heatmap.");
  }
}
async function handleGetProgressionSummary(_evt, payload) {
  try {
    const db = getDb();
    return getUserProgressionSummary(db, payload);
  } catch {
    throw new Error("Failed to load user progression summary.");
  }
}
async function handleGetProgressionTrend(_evt, payload) {
  try {
    const db = getDb();
    return getProgressionTrend(db, payload);
  } catch {
    throw new Error("Failed to load progression trend.");
  }
}
async function handleGetDueSrsQueue(_evt, payload) {
  try {
    const db = getDb();
    return getDueSrsQueue(db, payload);
  } catch {
    throw new Error("Failed to load due SRS queue.");
  }
}
async function handleRecordSrsReview(_evt, payload) {
  try {
    const db = getDb();
    return recordSrsReview(db, payload);
  } catch {
    throw new Error("Failed to update SRS review state.");
  }
}
async function handleGetEarnedBadges() {
  try {
    const db = getDb();
    return getEarnedBadges(db);
  } catch {
    throw new Error("Failed to load earned badges.");
  }
}
function registerQuestionsIpcHandlers() {
  ipcMain.handle("questions:get-pool", handleGetQuestionPool);
  ipcMain.handle("questions:get-by-id", handleGetQuestionById);
  ipcMain.handle("questions:search", handleSearchQuestions);
  ipcMain.handle("questions:get-browser-rows", handleGetQuestionBrowserRows);
  ipcMain.handle("questions:get-browser-detail", handleGetQuestionBrowserDetail);
  ipcMain.handle("questions:update-review-state", handleUpdateQuestionReviewState);
  ipcMain.handle("questions:get-weak-area-pool", handleGetWeakAreaPool);
  ipcMain.handle("questions:get-custom-quiz-pool", handleGetCustomQuizPool);
  ipcMain.handle("questions:reload-authored-content", handleReloadAuthoredContent);
}
async function handleGetQuestionPool(_evt, filter) {
  try {
    const db = getDb();
    return getQuestionPool(db, filter.tier);
  } catch {
    throw new Error("Failed to load questions.");
  }
}
async function handleGetQuestionById(_evt, filter) {
  try {
    const db = getDb();
    return getQuestionById(db, filter.questionId);
  } catch {
    throw new Error("Failed to load question details.");
  }
}
async function handleSearchQuestions(_evt, filter) {
  try {
    const db = getDb();
    return searchQuestions(db, filter);
  } catch {
    throw new Error("Failed to search questions.");
  }
}
async function handleGetQuestionBrowserRows(_evt, filter) {
  try {
    const db = getDb();
    return getQuestionBrowserRows(db, filter);
  } catch {
    throw new Error("Failed to load question browser rows.");
  }
}
async function handleGetQuestionBrowserDetail(_evt, filter) {
  try {
    const db = getDb();
    return getQuestionBrowserDetail(db, filter);
  } catch {
    throw new Error("Failed to load question browser detail.");
  }
}
async function handleUpdateQuestionReviewState(_evt, input) {
  try {
    const db = getDb();
    return updateQuestionReviewState(db, input);
  } catch {
    throw new Error("Failed to update question review state.");
  }
}
async function handleGetWeakAreaPool(_evt, filter) {
  try {
    const db = getDb();
    return getWeakAreaQuestionPool(db, filter);
  } catch {
    throw new Error("Failed to load weak-area question pool.");
  }
}
async function handleGetCustomQuizPool(_evt, filter) {
  try {
    const db = getDb();
    return getCustomQuizQuestionPool(db, filter);
  } catch {
    throw new Error("Failed to load custom quiz question pool.");
  }
}
async function handleReloadAuthoredContent() {
  try {
    const db = getDb();
    await applyHintsIfPresent(db);
    return { ok: true };
  } catch {
    throw new Error("Failed to reload authored content.");
  }
}
const KEYCHAIN_SERVICE = "hamstudy-pro";
const RESET_ALL_SENTINEL_MINUTES = -999;
const BASE_SAY_RATE_WPM = 175;
let activeSpeechProcess = null;
function registerSettingsIpcHandlers() {
  ipcMain.handle("settings:get", handleGetSettings);
  ipcMain.handle("settings:save", handleSaveSettings);
  ipcMain.handle("settings:reset-app-data", handleResetAppData);
  ipcMain.handle("settings:voice-list", handleListVoices);
  ipcMain.handle("settings:voice-speak", handleSpeakText);
  ipcMain.handle("settings:voice-stop", handleStopSpeech);
  ipcMain.handle("settings:voice-diagnostics", handleGetVoiceDiagnostics);
  ipcMain.handle("keychain:set-api-key", handleSetApiKey);
  ipcMain.handle("keychain:delete-api-key", handleDeleteApiKey);
  ipcMain.handle("keychain:get-api-key-status", handleGetApiKeyStatus);
}
async function handleGetSettings() {
  try {
    const db = getDb();
    return getUserSettings(db);
  } catch {
    throw new Error("Failed to load user settings.");
  }
}
async function handleSaveSettings(_evt, payload) {
  try {
    const db = getDb();
    const normalizedPayload = {
      ...payload,
      voiceId: payload.voiceId ?? null,
      voiceRate: Number.isFinite(payload.voiceRate) ? payload.voiceRate : 1
    };
    if (normalizedPayload.dailyGoalMinutes === RESET_ALL_SENTINEL_MINUTES && normalizedPayload.theme === "system" && normalizedPayload.visualTheme === "ocean-chart" && normalizedPayload.textSize === "medium" && normalizedPayload.aiProvider === null && normalizedPayload.voiceId === null && normalizedPayload.voiceRate === 1) {
      resetAppData(db);
      return getUserSettings(db);
    }
    return upsertUserSettings(db, normalizedPayload);
  } catch {
    throw new Error("Failed to save user settings.");
  }
}
async function handleSetApiKey(_evt, { provider, key }) {
  await keytar.setPassword(KEYCHAIN_SERVICE, provider, key);
  return { success: true };
}
async function handleDeleteApiKey(_evt, { provider }) {
  await keytar.deletePassword(KEYCHAIN_SERVICE, provider);
  return { success: true };
}
async function handleGetApiKeyStatus() {
  const providers = ["anthropic", "openai"];
  const statuses = await Promise.all(
    providers.map(async (provider) => {
      const key = await keytar.getPassword(KEYCHAIN_SERVICE, provider);
      return { provider, isSet: !!key };
    })
  );
  return statuses;
}
async function handleResetAppData() {
  try {
    const db = getDb();
    return resetAppData(db);
  } catch {
    throw new Error("Failed to reset app data.");
  }
}
async function handleListVoices() {
  if (process.platform !== "darwin") {
    return [];
  }
  const output = await new Promise((resolve) => {
    execFile("say", ["-v", "?"], { timeout: 2500 }, (error, stdout) => {
      if (error) {
        resolve("");
        return;
      }
      resolve(stdout);
    });
  });
  return output.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).map((line) => {
    const segments = line.split(/\s{2,}/).filter((segment) => segment.length > 0);
    const name = segments[0] ?? "";
    const language = segments[1] ?? "unknown";
    return {
      id: name,
      name,
      language,
      isDefault: name === "Samantha"
    };
  }).filter((voice) => voice.id.length > 0);
}
async function handleSpeakText(_evt, payload) {
  if (!payload.text || payload.text.trim().length === 0) {
    return { ok: false, reason: "invalid-input" };
  }
  if (process.platform !== "darwin") {
    return { ok: false, reason: "not-implemented" };
  }
  if (activeSpeechProcess && !activeSpeechProcess.killed) {
    activeSpeechProcess.kill("SIGTERM");
    activeSpeechProcess = null;
  }
  const normalizedRate = Math.min(2, Math.max(0.5, payload.rate ?? 1));
  const rateWpm = Math.round(BASE_SAY_RATE_WPM * normalizedRate);
  const args = ["-r", String(rateWpm)];
  if (payload.voiceId && payload.voiceId.trim().length > 0) {
    args.push("-v", payload.voiceId.trim());
  }
  args.push(payload.text);
  try {
    const child = spawn("say", args, {
      stdio: "ignore"
    });
    activeSpeechProcess = child;
    child.on("close", () => {
      if (activeSpeechProcess === child) {
        activeSpeechProcess = null;
      }
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "spawn-failed" };
  }
}
async function handleStopSpeech() {
  if (!activeSpeechProcess || activeSpeechProcess.killed) {
    return { ok: false, reason: "no-active-session" };
  }
  activeSpeechProcess.kill("SIGTERM");
  activeSpeechProcess = null;
  return { ok: true };
}
async function handleGetVoiceDiagnostics() {
  if (process.platform !== "darwin") {
    return {
      platform: process.platform,
      supported: false,
      error: "Voice diagnostics are only supported on macOS.",
      voices: []
    };
  }
  try {
    const voices = await handleListVoices();
    return {
      platform: process.platform,
      supported: true,
      voices
    };
  } catch (error) {
    return {
      platform: process.platform,
      supported: false,
      error: error instanceof Error ? error.message : String(error),
      voices: []
    };
  }
}
const isDev = process.env.NODE_ENV === "development";
let mainWindow = null;
let tray = null;
function resolvePreloadPath() {
  const mjsPath = join(__dirname, "../preload/index.mjs");
  if (existsSync(mjsPath)) {
    return mjsPath;
  }
  const jsPath = join(__dirname, "../preload/index.js");
  return jsPath;
}
function createMainWindow() {
  const preloadPath = resolvePreloadPath();
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 720,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: "HamStudy Pro"
  });
  console.info("[main] Using preload script:", preloadPath);
  window.webContents.on("preload-error", (_event, preloadFile, error) => {
    console.error("[main] Preload failed:", preloadFile, error);
  });
  mainWindow = window;
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
    window.webContents.openDevTools({ mode: "detach" });
    return;
  }
  void window.loadFile(join(__dirname, "../renderer/index.html"));
}
function createTray() {
  if (process.platform !== "darwin") return;
  const devIconPath = join(__dirname, "../../src/assets/hero.png");
  const icon = existsSync(devIconPath) ? nativeImage.createFromPath(devIconPath).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("HamStudy Pro");
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show HamStudy Pro",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      }
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit()
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
async function onAppReady() {
  const db = getDb();
  await seedQuestionsIfNeeded(db);
  await applyHintsIfPresent(db);
  const backfilledCards = backfillSrsCardsFromAnswerHistory(db);
  if (backfilledCards > 0) {
    console.info("[main] Backfilled SRS cards from history:", backfilledCards);
  }
  registerQuestionsIpcHandlers();
  registerProgressIpcHandlers();
  registerSettingsIpcHandlers();
  registerAiIpcHandlers();
}
async function onReadyCreateWindow() {
  await onAppReady();
  createMainWindow();
  createTray();
}
app.whenReady().then(onReadyCreateWindow);
function onActivate() {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
  if (!tray) {
    createTray();
  }
}
app.on("activate", onActivate);
function onWindowAllClosed() {
  if (process.platform !== "darwin") {
    app.quit();
  }
}
app.on("window-all-closed", onWindowAllClosed);
