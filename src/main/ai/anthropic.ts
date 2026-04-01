import https from 'node:https'
import type { ClientRequest } from 'node:http'

const API_HOST = 'api.anthropic.com'
const API_PATH = '/v1/messages'
const DEFAULT_MODEL = 'claude-3-haiku-20240307'

export interface StreamingChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AnthropicStreamChunk {
  type: 'content_block_delta'
  delta: {
    type: 'text_delta'
    text: string
  }
}

// TASK: Create a streaming chat request to the Anthropic API.
// HOW CODE SOLVES: Sends structured system + conversation history payloads
//                  so the main IPC layer can stream tutor responses while
//                  keeping provider-specific HTTP details isolated here.
export function streamAnthropicChat(
  apiKey: string,
  input: {
    systemPrompt: string
    messages: StreamingChatMessage[]
  },
): ClientRequest {
  const payload = JSON.stringify({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system: input.systemPrompt,
    messages: input.messages,
    stream: true,
  })

  const options = {
    hostname: API_HOST,
    path: API_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(payload),
    },
  }

  const req = https.request(options)
  req.write(payload)
  req.end()

  return req
}

// TASK: Extract streamed tutor text from Anthropic SSE payload lines.
// HOW CODE SOLVES: Ignores keepalive/meta events and returns only text delta
//                  content so the IPC layer can forward clean chunks.
export function parseAnthropicStreamLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) {
    return null
  }

  const jsonStr = trimmed.replace(/^data:\s*/, '')
  if (jsonStr === '' || jsonStr === '[DONE]') {
    return null
  }

  try {
    const json = JSON.parse(jsonStr) as AnthropicStreamChunk
    if (json.type === 'content_block_delta' && json.delta.type === 'text_delta') {
      return json.delta.text
    }
  } catch {
    return null
  }

  return null
}
