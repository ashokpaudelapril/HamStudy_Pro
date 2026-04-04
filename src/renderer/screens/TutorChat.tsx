import { useCallback, useEffect, useState } from 'react'
import { ipcBridge } from '@shared/ipcBridge'
import type { ChatMessage } from '@shared/types'
import { ScreenHeader } from '../components/ScreenHeader'

type TutorChatScreenProps = {
  onBackToModes: () => void
  chatContext?: {
    questionId?: string
    questionLabel?: string
    initialMessage?: string
    sourceMode: string
  } | null
}

// TASK: Provide a streaming Tutor Chat UI with optional current-question context.
// HOW CODE SOLVES: Shows the active question context in the header, pre-fills a
//                  helpful draft prompt, and forwards `context.questionId` with each send.
export function TutorChatScreen({ onBackToModes, chatContext }: TutorChatScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  // TASK: Render persisted Tutor Chat history on entry so users can continue prior conversations.
  // HOW CODE SOLVES: Loads recent saved messages from the main-process DB layer
  //                  and hydrates local UI state before new streaming responses arrive.
  useEffect(() => {
    setLoadingHistory(true)
    setHistoryError(null)

    void ipcBridge
      .getRecentChatHistory({ limit: 24 })
      .then((history) => {
        setMessages(history)
      })
      .catch((error) => {
        const details = error instanceof Error ? error.message : String(error)
        setHistoryError(`Failed to load chat history. ${details}`)
      })
      .finally(() => {
        setLoadingHistory(false)
      })
  }, [])

  useEffect(() => {
    if (!chatContext?.questionId && !chatContext?.initialMessage) {
      return
    }

    // TASK: Seed Tutor Chat with the most helpful starting prompt for the current entry flow.
    // HOW CODE SOLVES: Prefers explicit action-specific drafts (like "Explain differently")
    //                  and otherwise falls back to a generic question-help prompt.
    setInput(
      chatContext?.initialMessage ?? 'Can you help me understand this question without giving away the answer?',
    )
  }, [chatContext?.initialMessage, chatContext?.questionId])

  // TASK: Format the visible tutor transcript as Markdown for export/copy workflows.
  // HOW CODE SOLVES: Adds a compact header plus role-labeled conversation blocks
  //                  so users can paste the transcript into notes or share it cleanly.
  const buildTranscriptMarkdown = useCallback((): string => {
    const headerLines = ['# Elmer Tutor Transcript']

    if (chatContext?.questionLabel) {
      headerLines.push('', `Question context: ${chatContext.questionLabel}`)
    }

    const body = messages
      .map((message) => {
        const roleLabel = message.role === 'assistant' ? 'Elmer' : 'You'
        return `## ${roleLabel}\n\n${message.content}`
      })
      .join('\n\n')

    return `${headerLines.join('\n')}\n\n${body}`.trim()
  }, [chatContext?.questionLabel, messages])

  // TASK: Provide a first Markdown export path without adding filesystem complexity yet.
  // HOW CODE SOLVES: Copies the formatted transcript to the clipboard when possible
  //                  and reports a clear status back in the chat UI.
  const handleCopyMarkdown = useCallback((): void => {
    const transcript = buildTranscriptMarkdown()
    if (!transcript || messages.length === 0) {
      setExportStatus('No chat transcript available to export yet.')
      return
    }

    setExportStatus(null)
    void navigator.clipboard
      .writeText(transcript)
      .then(() => {
        setExportStatus('Markdown transcript copied to clipboard.')
      })
      .catch((error) => {
        const details = error instanceof Error ? error.message : String(error)
        setExportStatus(`Failed to copy Markdown transcript. ${details}`)
      })
  }, [buildTranscriptMarkdown, messages.length])

  const handleSend = useCallback(async () => {
    if (input.trim() && !isThinking) {
      const trimmedInput = input.trim()
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmedInput,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMessage])
      setInput('')
      setIsThinking(true)
      setExportStatus(null)

      try {
        await ipcBridge.sendChatMessage({
          message: trimmedInput,
          context: chatContext?.questionId ? { questionId: chatContext.questionId } : undefined,
        })
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: new Date().toISOString(),
          },
        ])
        setIsThinking(false)
      }
    }
  }, [chatContext?.questionId, input, isThinking])

  useEffect(() => {
    const unsubscribeChunk = ipcBridge.onAiChunk((chunk) => {
      setMessages((prevMessages) => {
        const lastMessage = prevMessages[prevMessages.length - 1]
        if (lastMessage?.role === 'assistant') {
          return [
            ...prevMessages.slice(0, -1),
            { ...lastMessage, content: lastMessage.content + chunk },
          ]
        }
        return [
          ...prevMessages,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: chunk,
            timestamp: new Date().toISOString(),
          },
        ]
      })
    })

    const unsubscribeEnd = ipcBridge.onAiChunkEnd(() => {
      setIsThinking(false)
    })

    const unsubscribeError = ipcBridge.onAiError((error) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `Error: ${error}`,
          timestamp: new Date().toISOString(),
        },
      ])
      setIsThinking(false)
    })

    return () => {
      unsubscribeChunk()
      unsubscribeEnd()
      unsubscribeError()
    }
  }, [])

  return (
    <div className="tutor-chat-screen">
      <ScreenHeader
        title="Elmer AI Tutor"
        subtitle={chatContext?.questionLabel ? `Asking about ${chatContext.questionLabel}` : 'Ask questions and get hints'}
        actions={
          <>
            <button type="button" className="ghost-btn" onClick={handleCopyMarkdown} disabled={messages.length === 0}>
              Copy Markdown
            </button>
            <button type="button" className="ghost-btn" onClick={onBackToModes}>
              Back
            </button>
          </>
        }
      />
      {chatContext?.questionId ? (
        <div className="panel">
          <p className="meta">
            Question context attached: {chatContext.questionLabel ?? chatContext.questionId}. Elmer will see the question stem,
            answer choices, and FCC reference when you send your message.
          </p>
        </div>
      ) : null}
      {historyError ? <p className="error-text">{historyError}</p> : null}
      {exportStatus ? <p className="meta">{exportStatus}</p> : null}
      <div className="messages-list">
        {loadingHistory ? <div className="message assistant">Loading recent chat history...</div> : null}
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            {msg.content}
          </div>
        ))}
        {isThinking && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="message assistant">...</div>
        )}
      </div>
      <div className="message-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder={chatContext?.questionId ? 'Ask Elmer about this question...' : 'Ask Elmer a question...'}
          disabled={isThinking}
        />
        <button className="primary-button" onClick={handleSend} disabled={isThinking}>
          {isThinking ? 'Thinking...' : 'Send'}
        </button>
      </div>
    </div>
  )
}
