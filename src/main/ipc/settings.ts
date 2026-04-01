import { ipcMain } from 'electron'
import keytar from 'keytar'
import { execFile, spawn } from 'node:child_process'
import type {
  AiProvider,
  ApiKeyStatus,
  UserSettings,
  VoiceDiagnostics,
  VoiceOption,
  VoiceSpeakInput,
  VoiceSpeakResult,
} from '../../shared/types'
import { getDb } from '../db/database'
import { getUserSettings, resetAppData, type ResetAppDataResult, upsertUserSettings } from '../db/queries'

type SaveSettingsPayload = Pick<
  UserSettings,
  'theme' | 'visualTheme' | 'dailyGoalMinutes' | 'aiProvider' | 'textSize' | 'voiceId' | 'voiceRate'
>

const KEYCHAIN_SERVICE = 'hamstudy-pro'
const RESET_ALL_SENTINEL_MINUTES = -999
const BASE_SAY_RATE_WPM = 175
let activeSpeechProcess: ReturnType<typeof spawn> | null = null

// TASK: Register settings IPC handlers for read/write operations.
// HOW CODE SOLVES: Keeps renderer settings workflows typed and centralized,
//                   while enforcing DB access only in the main process.
export function registerSettingsIpcHandlers(): void {
  ipcMain.handle('settings:get', handleGetSettings)
  ipcMain.handle('settings:save', handleSaveSettings)
  ipcMain.handle('settings:reset-app-data', handleResetAppData)
  ipcMain.handle('settings:voice-list', handleListVoices)
  ipcMain.handle('settings:voice-speak', handleSpeakText)
  ipcMain.handle('settings:voice-stop', handleStopSpeech)
  ipcMain.handle('settings:voice-diagnostics', handleGetVoiceDiagnostics)
  ipcMain.handle('keychain:set-api-key', handleSetApiKey)
  ipcMain.handle('keychain:delete-api-key', handleDeleteApiKey)
  ipcMain.handle('keychain:get-api-key-status', handleGetApiKeyStatus)
}

// TASK: IPC handler for `settings:get`.
// HOW CODE SOLVES: Loads persisted settings and falls back to defaults when
//                   the app is running for the first time.
async function handleGetSettings(): Promise<UserSettings> {
  try {
    const db = getDb()
    return getUserSettings(db)
  } catch {
    throw new Error('Failed to load user settings.')
  }
}

// TASK: IPC handler for `settings:save`.
// HOW CODE SOLVES: Validates through shared typing and persists a single
//                   settings profile row via UPSERT semantics.
async function handleSaveSettings(_evt: unknown, payload: SaveSettingsPayload): Promise<UserSettings> {
  try {
    const db = getDb()
    const normalizedPayload: SaveSettingsPayload = {
      ...payload,
      voiceId: payload.voiceId ?? null,
      voiceRate: Number.isFinite(payload.voiceRate) ? payload.voiceRate : 1,
    }

    // TASK: Support reset-all compatibility for renderer sessions running with
    //       older preload bridges that do not expose `settings:reset-app-data`.
    // HOW CODE SOLVES: Uses a reserved settings payload sentinel to trigger
    //                  transactional reset through the existing `settings:save` channel.
    if (
      normalizedPayload.dailyGoalMinutes === RESET_ALL_SENTINEL_MINUTES &&
      normalizedPayload.theme === 'system' &&
      normalizedPayload.visualTheme === 'ocean-chart' &&
      normalizedPayload.textSize === 'medium' &&
      normalizedPayload.aiProvider === null &&
      normalizedPayload.voiceId === null &&
      normalizedPayload.voiceRate === 1
    ) {
      resetAppData(db)
      return getUserSettings(db)
    }

    return upsertUserSettings(db, normalizedPayload)
  } catch {
    throw new Error('Failed to save user settings.')
  }
}

async function handleSetApiKey(_evt: unknown, { provider, key }: { provider: AiProvider; key: string }) {
  await keytar.setPassword(KEYCHAIN_SERVICE, provider, key)
  return { success: true }
}

async function handleDeleteApiKey(_evt: unknown, { provider }: { provider: AiProvider }) {
  await keytar.deletePassword(KEYCHAIN_SERVICE, provider)
  return { success: true }
}

async function handleGetApiKeyStatus(): Promise<ApiKeyStatus[]> {
  const providers: AiProvider[] = ['anthropic', 'openai']
  const statuses = await Promise.all(
    providers.map(async (provider) => {
      const key = await keytar.getPassword(KEYCHAIN_SERVICE, provider)
      return { provider, isSet: !!key }
    }),
  )
  return statuses
}

// TASK: IPC handler for `settings:reset-app-data`.
// HOW CODE SOLVES: Executes a transactional reset of user-generated state,
//                  returning counts for confirmation UI.
async function handleResetAppData(): Promise<ResetAppDataResult> {
  try {
    const db = getDb()
    return resetAppData(db)
  } catch {
    throw new Error('Failed to reset app data.')
  }
}

// TASK: IPC handler for `settings:voice-list`.
// HOW CODE SOLVES: Returns a compatibility-safe empty voice list until the
//                  native macOS speech bridge is wired in a later phase.
async function handleListVoices(): Promise<VoiceOption[]> {
  // ISSUE: Voice enumeration can fail on non-macOS platforms or stripped runtimes.
  // FIX APPLIED: Return an empty list instead of throwing so renderer selectors stay stable.
  if (process.platform !== 'darwin') {
    return []
  }

  const output = await new Promise<string>((resolve) => {
    execFile('say', ['-v', '?'], { timeout: 2500 }, (error, stdout) => {
      if (error) {
        resolve('')
        return
      }

      resolve(stdout)
    })
  })

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const segments = line.split(/\s{2,}/).filter((segment) => segment.length > 0)
      const name = segments[0] ?? ''
      const language = segments[1] ?? 'unknown'

      return {
        id: name,
        name,
        language,
        isDefault: name === 'Samantha',
      }
    })
    .filter((voice) => voice.id.length > 0)
}

// TASK: IPC handler for `settings:voice-speak`.
// HOW CODE SOLVES: Validates text presence and returns typed no-op results so
//                  renderer controls can ship safely before native integration.
async function handleSpeakText(_evt: unknown, payload: VoiceSpeakInput): Promise<VoiceSpeakResult> {
  if (!payload.text || payload.text.trim().length === 0) {
    return { ok: false, reason: 'invalid-input' }
  }

  if (process.platform !== 'darwin') {
    return { ok: false, reason: 'not-implemented' }
  }

  if (activeSpeechProcess && !activeSpeechProcess.killed) {
    activeSpeechProcess.kill('SIGTERM')
    activeSpeechProcess = null
  }

  const normalizedRate = Math.min(2, Math.max(0.5, payload.rate ?? 1))
  const rateWpm = Math.round(BASE_SAY_RATE_WPM * normalizedRate)

  const args: string[] = ['-r', String(rateWpm)]
  if (payload.voiceId && payload.voiceId.trim().length > 0) {
    args.push('-v', payload.voiceId.trim())
  }
  args.push(payload.text)

  try {
    const child = spawn('say', args, {
      stdio: 'ignore',
    })

    activeSpeechProcess = child
    child.on('close', () => {
      if (activeSpeechProcess === child) {
        activeSpeechProcess = null
      }
    })

    return { ok: true }
  } catch {
    return { ok: false, reason: 'spawn-failed' }
  }
}

// TASK: IPC handler for `settings:voice-stop`.
// HOW CODE SOLVES: Exposes a stable typed stop endpoint with no-op behavior
//                  so renderer can call it without checking environment details.
async function handleStopSpeech(): Promise<VoiceSpeakResult> {
  if (!activeSpeechProcess || activeSpeechProcess.killed) {
    return { ok: false, reason: 'no-active-session' }
  }

  activeSpeechProcess.kill('SIGTERM')
  activeSpeechProcess = null
  return { ok: true }
}

async function handleGetVoiceDiagnostics(): Promise<VoiceDiagnostics> {
  if (process.platform !== 'darwin') {
    return {
      platform: process.platform,
      supported: false,
      error: 'Voice diagnostics are only supported on macOS.',
      voices: [],
    }
  }

  try {
    const voices = await handleListVoices()
    return {
      platform: process.platform,
      supported: true,
      voices,
    }
  } catch (error) {
    return {
      platform: process.platform,
      supported: false,
      error: error instanceof Error ? error.message : String(error),
      voices: [],
    }
  }
}