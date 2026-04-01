import https from 'node:https'
import type { ClientRequest } from 'node:http'
import type { StreamingChatMessage } from './anthropic'

const API_HOST = 'api.openai.com'
const API_PATH = '/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o'

type OpenAiStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string
    }
    finish_reason?: string | null
  }>
}

// TASK: Create a streaming chat request to the OpenAI Chat Completions API.
// HOW CODE SOLVES: Sends a structured conversation payload and returns the
//                  underlying HTTPS request so the IPC layer can stream SSE chunks.
export function streamOpenAiChat(
  apiKey: string,
  input: {
    systemPrompt: string
    messages: StreamingChatMessage[]
  },
): ClientRequest {
  const payload = JSON.stringify({
    model: DEFAULT_MODEL,
    temperature: 0.7,
    stream: true,
    messages: [
      {
        role: 'system',
        content: input.systemPrompt,
      },
      ...input.messages,
    ],
  })

  const options = {
    hostname: API_HOST,
    path: API_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(payload),
    },
  }

  const req = https.request(options)
  req.write(payload)
  req.end()

  return req
}

// TASK: Extract streamed tutor text from OpenAI SSE payload lines.
// HOW CODE SOLVES: Parses Chat Completions delta events and returns only
//                  text-bearing content for IPC forwarding.
export function parseOpenAiStreamLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) {
    return null
  }

  const jsonStr = trimmed.replace(/^data:\s*/, '')
  if (jsonStr === '' || jsonStr === '[DONE]') {
    return null
  }

  try {
    const json = JSON.parse(jsonStr) as OpenAiStreamChunk
    return json.choices?.[0]?.delta?.content ?? null
  } catch {
    return null
  }
}
