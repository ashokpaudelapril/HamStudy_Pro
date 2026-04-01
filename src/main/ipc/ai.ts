import { ipcMain } from 'electron'
import keytar from 'keytar'
import { ADAPTIVE_PLAN_SYSTEM_PROMPT, buildAdaptivePlanUserPrompt, ELMER_TUTOR_SYSTEM_PROMPT, MNEMONIC_SYSTEM_PROMPT, buildMnemonicUserPrompt } from '../ai/prompts'
import {
  parseAnthropicStreamLine,
  streamAnthropicChat,
  type StreamingChatMessage,
} from '../ai/anthropic'
import { parseOpenAiStreamLine, streamOpenAiChat } from '../ai/openai'
import { getDb } from '../db/database'
import { getQuestionById, getRecentChatMessages, getUserProgressionSummary, getProgressionTrend, getUserSettings, saveChatMessage, getUserMnemonic, upsertUserMnemonic } from '../db/queries'
import type { ChatMessage, SendChatMessageInput } from '../../shared/types'

const KEYCHAIN_SERVICE = 'hamstudy-pro'
const LEGACY_KEYCHAIN_SUFFIX = '-key'
const RECENT_CHAT_HISTORY_LIMIT = 12

type SupportedAiProvider = 'anthropic' | 'openai'

// TASK: Build provider-safe keychain lookup with compatibility fallback.
// HOW CODE SOLVES: Checks the current account naming convention first and
//                  then falls back to the older `-key` suffix used in docs/examples.
async function getStoredApiKey(provider: SupportedAiProvider): Promise<string | null> {
  const directMatch = await keytar.getPassword(KEYCHAIN_SERVICE, provider)
  if (directMatch) {
    return directMatch
  }

  return keytar.getPassword(KEYCHAIN_SERVICE, `${provider}${LEGACY_KEYCHAIN_SUFFIX}`)
}

// TASK: Turn optional current-question context into tutor-safe prompt text.
// HOW CODE SOLVES: Loads the referenced FCC question from SQLite and formats
//                  the stem, choices, and reference so the tutor can explain concepts.
function buildQuestionContextBlock(payload: {
  questionId?: string
  questionText?: string
  answers?: string[]
  refs?: string
}): string {
  if (!payload.questionId || !payload.questionText || !payload.answers?.length) {
    return ''
  }

  const formattedAnswers = payload.answers
    .map((answer, index) => `${String.fromCharCode(65 + index)}. ${answer}`)
    .join('\n')

  return [
    'Current study question context:',
    `Question ID: ${payload.questionId}`,
    `Question: ${payload.questionText}`,
    'Answer choices:',
    formattedAnswers,
    `Reference: ${payload.refs ?? 'None provided'}`,
  ].join('\n')
}

// TASK: Build the streaming conversation payload for the selected provider.
// HOW CODE SOLVES: Rehydrates recent chat history from SQLite, appends the
//                  current user message, and includes optional question context.
function buildConversationMessages(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string,
  questionContextBlock: string,
): StreamingChatMessage[] {
  const normalizedMessage = questionContextBlock
    ? `${questionContextBlock}\n\nStudent message:\n${userMessage}`
    : userMessage

  return [
    ...history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: 'user',
      content: normalizedMessage,
    },
  ]
}

// TASK: One-shot adaptive study plan generator (non-streaming).
// HOW CODE SOLVES: Reads the user's progression summary and 7-day trend from SQLite,
//                  builds a prompt via buildAdaptivePlanUserPrompt, calls the selected
//                  AI provider, collects all SSE chunks into a single string, and returns
//                  the complete plan text. Gated behind provider + key checks same as chat.
async function handleGetAdaptivePlan(): Promise<string> {
  const db = getDb()
  const settings = getUserSettings(db)
  const provider = settings.aiProvider

  if (!provider) {
    throw new Error('No AI provider selected. Set one in Settings to use adaptive plans.')
  }

  const apiKey = await getStoredApiKey(provider)
  if (!apiKey) {
    throw new Error(`API key for ${provider} not found. Add it in Settings.`)
  }

  const [summary, trend] = await Promise.all([
    getUserProgressionSummary(db, { streakGraceHours: 2 }),
    getProgressionTrend(db, { days: 7, streakGraceHours: 2, tier: 'all' }),
  ])

  const userPrompt = buildAdaptivePlanUserPrompt(summary, trend)
  const messages: StreamingChatMessage[] = [{ role: 'user', content: userPrompt }]

  const apiReq =
    provider === 'anthropic'
      ? streamAnthropicChat(apiKey, { systemPrompt: ADAPTIVE_PLAN_SYSTEM_PROMPT, messages })
      : streamOpenAiChat(apiKey, { systemPrompt: ADAPTIVE_PLAN_SYSTEM_PROMPT, messages })

  const parseStreamLine = provider === 'anthropic' ? parseAnthropicStreamLine : parseOpenAiStreamLine

  return new Promise<string>((resolve, reject) => {
    let buffer = ''
    let partialLine = ''

    apiReq.on('response', (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let errBody = ''
        res.on('data', (chunk: Buffer) => { errBody += chunk.toString() })
        res.on('end', () => {
          reject(new Error(`AI provider error (${res.statusCode}): ${errBody.replace(/\s+/g, ' ').trim()}`))
        })
        return
      }

      res.on('data', (chunk: Buffer) => {
        partialLine += chunk.toString()
        const lines = partialLine.split('\n')
        partialLine = lines.pop() ?? ''
        for (const line of lines) {
          const text = parseStreamLine(line)
          if (text) buffer += text
        }
      })

      res.on('end', () => {
        const trailing = parseStreamLine(partialLine)
        if (trailing) buffer += trailing
        resolve(buffer.trim())
      })
    })

    apiReq.on('error', (err: Error) => { reject(err) })
  })
}

// TASK: Read back any previously saved custom mnemonic for a question (no AI call).
// HOW CODE SOLVES: Queries user_mnemonics by question_id and returns the stored string
//                  or null when none exists, so the UI can decide whether to show the
//                  "Generate" or "Regenerate" button without triggering an AI call.
async function handleGetUserMnemonic(
  _evt: Electron.IpcMainInvokeEvent,
  { questionId }: { questionId: string },
): Promise<string | null> {
  const db = getDb()
  return getUserMnemonic(db, questionId)
}

// TASK: Generate a custom mnemonic for a question via AI and persist it.
// HOW CODE SOLVES: Looks up the question, builds a mnemonic prompt, calls the configured
//                  AI provider (one-shot, non-streaming), saves the result to user_mnemonics,
//                  and returns the plain-text mnemonic string. Gated behind provider+key checks.
async function handleGenerateMnemonic(
  _evt: Electron.IpcMainInvokeEvent,
  { questionId }: { questionId: string },
): Promise<string> {
  const db = getDb()
  const settings = getUserSettings(db)
  const provider = settings.aiProvider

  if (!provider) {
    throw new Error('No AI provider selected. Set one in Settings to generate mnemonics.')
  }

  const apiKey = await getStoredApiKey(provider)
  if (!apiKey) {
    throw new Error(`API key for ${provider} not found. Add it in Settings.`)
  }

  const question = getQuestionById(db, questionId)
  if (!question) {
    throw new Error(`Question ${questionId} not found.`)
  }

  const userPrompt = buildMnemonicUserPrompt(question)
  const messages: StreamingChatMessage[] = [{ role: 'user', content: userPrompt }]

  const apiReq =
    provider === 'anthropic'
      ? streamAnthropicChat(apiKey, { systemPrompt: MNEMONIC_SYSTEM_PROMPT, messages })
      : streamOpenAiChat(apiKey, { systemPrompt: MNEMONIC_SYSTEM_PROMPT, messages })

  const parseStreamLine = provider === 'anthropic' ? parseAnthropicStreamLine : parseOpenAiStreamLine

  return new Promise<string>((resolve, reject) => {
    let buffer = ''
    let partialLine = ''

    apiReq.on('response', (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let errBody = ''
        res.on('data', (chunk: Buffer) => { errBody += chunk.toString() })
        res.on('end', () => {
          reject(new Error(`AI provider error (${res.statusCode}): ${errBody.replace(/\s+/g, ' ').trim()}`))
        })
        return
      }

      res.on('data', (chunk: Buffer) => {
        partialLine += chunk.toString()
        const lines = partialLine.split('\n')
        partialLine = lines.pop() ?? ''
        for (const line of lines) {
          const text = parseStreamLine(line)
          if (text) buffer += text
        }
      })

      res.on('end', () => {
        const trailing = parseStreamLine(partialLine)
        if (trailing) buffer += trailing
        const mnemonic = buffer.trim()
        if (mnemonic) {
          upsertUserMnemonic(db, questionId, mnemonic)
        }
        resolve(mnemonic)
      })
    })

    apiReq.on('error', (err: Error) => { reject(err) })
  })
}

// TASK: Register AI-related IPC handlers.
// HOW CODE SOLVES: Centralizes all AI feature IPC endpoints for chat,
//                   adaptive plans, and custom mnemonics.
export function registerAiIpcHandlers(): void {
  ipcMain.handle('ai:chat-message', handleChatMessage)
  ipcMain.handle('ai:get-chat-history', handleGetChatHistory)
  ipcMain.handle('ai:get-adaptive-plan', handleGetAdaptivePlan)
  ipcMain.handle('ai:get-user-mnemonic', handleGetUserMnemonic)
  ipcMain.handle('ai:generate-mnemonic', handleGenerateMnemonic)
}

// TASK: Load recent persisted Tutor Chat history for the selected provider.
// HOW CODE SOLVES: Reads the active provider from settings, returns a bounded
//                  chronological message list, and safely falls back to empty state.
async function handleGetChatHistory(
  _evt: Electron.IpcMainInvokeEvent,
  filter?: { limit?: number },
): Promise<ChatMessage[]> {
  const db = getDb()
  const settings = await getUserSettings(db)
  const provider = settings.aiProvider

  if (!provider) {
    return []
  }

  return getRecentChatMessages(db, provider, filter?.limit ?? RECENT_CHAT_HISTORY_LIMIT)
}

// TASK: IPC handler for `ai:chat-message`.
// HOW CODE SOLVES: Takes a user's message, calls the appropriate AI provider,
//                   and streams the response back to the renderer.
async function handleChatMessage(
  evt: Electron.IpcMainInvokeEvent,
  payload: SendChatMessageInput,
): Promise<void> {
  const db = getDb()
  const settings = await getUserSettings(db)
  const provider = settings.aiProvider

  if (!provider) {
    throw new Error('No AI provider selected in settings.')
  }

  const apiKey = await getStoredApiKey(provider)
  if (!apiKey) {
    throw new Error(`API key for ${provider} not found. Please add it in settings.`)
  }

  const trimmedMessage = payload.message.trim()
  if (trimmedMessage.length === 0) {
    throw new Error('Chat message cannot be empty.')
  }

  const referencedQuestion = payload.context?.questionId
    ? getQuestionById(db, payload.context.questionId)
    : null
  const questionContextBlock = buildQuestionContextBlock({
    questionId: referencedQuestion?.id,
    questionText: referencedQuestion?.questionText,
    answers: referencedQuestion?.answers,
    refs: referencedQuestion?.refs,
  })
  const recentHistory = getRecentChatMessages(db, provider, RECENT_CHAT_HISTORY_LIMIT)
  const conversation = buildConversationMessages(recentHistory, trimmedMessage, questionContextBlock)

  saveChatMessage(db, {
    id: `user-${Date.now()}`,
    role: 'user',
    content: trimmedMessage,
    provider,
    questionId: referencedQuestion?.id,
  })

  const apiReq =
    provider === 'anthropic'
      ? streamAnthropicChat(apiKey, {
          systemPrompt: ELMER_TUTOR_SYSTEM_PROMPT,
          messages: conversation,
        })
      : streamOpenAiChat(apiKey, {
          systemPrompt: ELMER_TUTOR_SYSTEM_PROMPT,
          messages: conversation,
        })

  const parseStreamLine = provider === 'anthropic' ? parseAnthropicStreamLine : parseOpenAiStreamLine

  await new Promise<void>((resolve) => {
    let responseBuffer = ''
    let partialLineBuffer = ''

    apiReq.on('response', (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let errorBody = ''
        res.on('data', (chunk) => {
          errorBody += chunk.toString()
        })
        res.on('end', () => {
          const providerLabel = provider === 'anthropic' ? 'Anthropic' : 'OpenAI'
          const normalizedErrorBody = errorBody.replace(/\s+/g, ' ').trim()
          const detail = normalizedErrorBody.length > 0 ? ` ${normalizedErrorBody}` : ''
          evt.sender.send('ai:error', `${providerLabel} request failed (${res.statusCode}).${detail}`)
          resolve()
        })
        return
      }

      res.on('data', (chunk) => {
        partialLineBuffer += chunk.toString()
        const lines = partialLineBuffer.split('\n')
        partialLineBuffer = lines.pop() ?? ''

        for (const line of lines) {
          const textChunk = parseStreamLine(line)
          if (!textChunk) {
            continue
          }

          responseBuffer += textChunk
          evt.sender.send('ai:chunk', textChunk)
        }
      })

      res.on('end', () => {
        const trailingChunk = parseStreamLine(partialLineBuffer)
        if (trailingChunk) {
          responseBuffer += trailingChunk
          evt.sender.send('ai:chunk', trailingChunk)
        }

        if (responseBuffer.trim().length > 0) {
          saveChatMessage(db, {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: responseBuffer,
            provider,
            questionId: referencedQuestion?.id,
          })
        }

        evt.sender.send('ai:chunk-end')
        resolve()
      })
    })

    apiReq.on('error', (err) => {
      evt.sender.send('ai:error', err.message)
      resolve()
    })
  })
}
