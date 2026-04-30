import { useCallback, useEffect, useState } from 'react'
import { ipcBridge, type ResetAppDataResult } from '@shared/ipcBridge'
import type { UserSettings, VoiceDiagnostics, AiProvider, ApiKeyStatus } from '@shared/types'
import { ModeBar } from '../components/ModeBar'
import { SectionTabs } from '../components/SectionTabs'

type SettingsScreenProps = {
  onBackToModes: () => void
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  visualTheme: 'ocean-chart',
  dailyGoalMinutes: 20,
  aiProvider: null,
  textSize: 'medium',
  voiceId: null,
  voiceRate: 1,
}

const RESET_COMPAT_SENTINEL_SETTINGS: UserSettings = {
  theme: 'system',
  visualTheme: 'ocean-chart',
  dailyGoalMinutes: -999,
  aiProvider: null,
  textSize: 'medium',
  voiceId: null,
  voiceRate: 1,
}

// TASK: Apply visual settings immediately in renderer so theme/text-size changes
//       are visible as soon as they are saved or reset.
// HOW CODE SOLVES: Resolves 'system' to actual 'dark'/'light' via matchMedia so the
//                  correct CSS variable block activates. Writes resolved value to the
//                  root data-theme attribute consumed by CSS variable selectors.
function applyVisualSettings(nextSettings: UserSettings): void {
  const resolvedTheme =
    nextSettings.theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : nextSettings.theme
  document.documentElement.setAttribute('data-theme', resolvedTheme)
  document.documentElement.setAttribute('data-visual-theme', nextSettings.visualTheme)
  document.documentElement.setAttribute('data-text-size', nextSettings.textSize)
}

// TASK: Provide a central settings screen with app reset controls.
// HOW CODE SOLVES: Loads/saves UserSettings via IPC and exposes an explicit
//                  full reset action that clears user-generated app state.
export function SettingsScreen({ onBackToModes }: SettingsScreenProps) {
  const TABS = [
    { id: 'preferences', label: 'Preferences' },
    { id: 'ai', label: 'AI & APIs' },
    { id: 'system', label: 'System & Reset' },
  ] as const
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['id']>('preferences')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [voiceOptions, setVoiceOptions] = useState<Array<{ id: string; label: string }>>([])
  const [voiceDiagnostics, setVoiceDiagnostics] = useState<VoiceDiagnostics | null>(null)
  const [lastReset, setLastReset] = useState<ResetAppDataResult | null>(null)
  const [lastResetMessage, setLastResetMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus[]>([])
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<AiProvider, string>>({
    anthropic: '',
    openai: '',
  })

  const loadApiKeyStatus = useCallback(async () => {
    try {
      const status = await ipcBridge.getApiKeyStatus()
      setApiKeyStatus(status)
    } catch {
      // ignore
    }
  }, [])

  const handleSetApiKey = useCallback(
    async (provider: AiProvider) => {
      const key = apiKeyInputs[provider]
      if (!key) return
      await ipcBridge.setApiKey({ provider, key })
      setApiKeyInputs((prev) => ({ ...prev, [provider]: '' }))
      await loadApiKeyStatus()
    },
    [apiKeyInputs, loadApiKeyStatus],
  )

  const handleDeleteApiKey = useCallback(
    async (provider: AiProvider) => {
      if (window.confirm(`Are you sure you want to delete the ${provider} API key?`)) {
        await ipcBridge.deleteApiKey({ provider })
        await loadApiKeyStatus()
        setSaveMessage(`${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} key removed.`)
      }
    },
    [loadApiKeyStatus],
  )

  // TASK: Verify reset effects across progress and SRS due queues.
  // HOW CODE SOLVES: Reads persisted stats + due counts from all tiers and
  //                  returns true only when user-generated learning state is cleared.
  const verifyResetCompleted = useCallback(async (): Promise<boolean> => {
    const [stats, techDue, genDue, extraDue, reloadedSettings] = await Promise.all([
      ipcBridge.getProgressStats(),
      ipcBridge.getDueSrsQueue({ tier: 'technician', limit: 300 }),
      ipcBridge.getDueSrsQueue({ tier: 'general', limit: 300 }),
      ipcBridge.getDueSrsQueue({ tier: 'extra', limit: 300 }),
      ipcBridge.getSettings(),
    ])

    const hasValidSettingsRange = reloadedSettings.dailyGoalMinutes >= 5 && reloadedSettings.dailyGoalMinutes <= 180

    return (
      stats.totalAnswers === 0 &&
      stats.correctAnswers === 0 &&
      stats.uniqueQuestionsAnswered === 0 &&
      techDue.length === 0 &&
      genDue.length === 0 &&
      extraDue.length === 0 &&
      hasValidSettingsRange
    )
  }, [])

  // TASK: Load persisted settings on entry.
  // HOW CODE SOLVES: Reads current settings from main-process storage and
  //                  mirrors them into both component state and root CSS attrs.
  const loadSettings = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      const loaded = await ipcBridge.getSettings()
      setSettings(loaded)
      applyVisualSettings(loaded)
    } catch (err: unknown) {
      const details = err instanceof Error ? err.message : String(err)
      setError(`Failed to load settings. ${details}`)
    } finally {
      setLoading(false)
    }
  }, [])

  // TASK: Persist modified settings.
  // HOW CODE SOLVES: Sends full settings payload to main process and applies
  //                  saved values to renderer-level visual attributes.
  function handleSaveSettings(): void {
    if (!settings) return

    setSaving(true)
    setError(null)
    setSaveMessage(null)
    void ipcBridge
      .saveSettings(settings)
      .then((saved) => {
        setSettings(saved)
        applyVisualSettings(saved)
        setSaveMessage('Settings saved.')
      })
      .catch((err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        setError(`Failed to save settings. ${details}`)
      })
      .finally(() => {
        setSaving(false)
      })
  }

  // TASK: Restore baseline settings values without touching progress history.
  // HOW CODE SOLVES: Replaces local form state with deterministic defaults
  //                  and applies the same defaults to live CSS attributes.
  function handleResetSettingsToDefault(): void {
    setSettings(DEFAULT_SETTINGS)
    applyVisualSettings(DEFAULT_SETTINGS)
    setSaveMessage('Defaults loaded locally. Save to keep them.')
  }

  // TASK: Reset all user-generated app data from one settings action.
  // HOW CODE SOLVES: Confirms destructive action, calls reset IPC endpoint,
  //                  resets local settings form to defaults, and stores summary counts.
  function handleResetEverything(): void {
    const shouldReset = window.confirm(
      'Reset everything? This clears progress history, SRS cards, sessions, saved settings, and question flags/stars.',
    )
    if (!shouldReset) {
      return
    }

    setResetting(true)
    setError(null)
    setLastResetMessage(null)
    setSaveMessage(null)
    void ipcBridge
      .resetAppData()
      .then(async (result) => {
        const verified = await verifyResetCompleted()
        if (!verified) {
          setLastReset(null)
          setLastResetMessage(null)
          setError('Reset command returned, but data still appears present. Restart the app and run reset again.')
          return
        }

        setLastReset(result)
        setLastResetMessage('Reset complete.')
        setSettings(DEFAULT_SETTINGS)
        applyVisualSettings(DEFAULT_SETTINGS)
        setSaveMessage('Settings restored to defaults.')
      })
      .catch(async (err: unknown) => {
        const details = err instanceof Error ? err.message : String(err)
        const isBridgeAvailabilityIssue = details.includes('App reset IPC bridge is not available')

        if (isBridgeAvailabilityIssue) {
          // TASK: Fallback reset path for stale preload bridge sessions.
          // HOW CODE SOLVES: Triggers server-side compatibility reset through
          //                  `settings:save` sentinel payload and reloads defaults.
          try {
            await ipcBridge.saveSettings(RESET_COMPAT_SENTINEL_SETTINGS)
            const verified = await verifyResetCompleted()

            if (!verified) {
              setLastReset(null)
              setLastResetMessage(null)
              setError('Compatibility reset path did not clear data in this session. Please restart app and try reset again.')
              return
            }

            setLastReset(null)
            setLastResetMessage('Reset complete (compatibility mode). Restart app to load latest bridge methods.')
            setSettings(DEFAULT_SETTINGS)
            applyVisualSettings(DEFAULT_SETTINGS)
            setSaveMessage('Settings restored to defaults.')
          } catch (compatErr: unknown) {
            const compatDetails = compatErr instanceof Error ? compatErr.message : String(compatErr)
            setError(`Failed to reset app data (compatibility mode). ${compatDetails}`)
          }
          return
        }

        setError(`Failed to reset app data. ${details}`)
      })
      .finally(() => {
        setResetting(false)
      })
  }

  useEffect(() => {
    void loadSettings()
    void loadApiKeyStatus()
  }, [loadSettings, loadApiKeyStatus])

  useEffect(() => {
    // TASK: Load available macOS speech voices for selector controls.
    // HOW CODE SOLVES: Reads voice options from IPC shell and degrades to an
    //                  empty selector list when backend support is unavailable.
    void ipcBridge
      .listVoices()
      .then((voices) => {
        setVoiceOptions(
          voices.map((voice) => ({
            id: voice.id,
            label: `${voice.name} (${voice.language})`,
          })),
        )
      })
      .catch(() => {
        setVoiceOptions([])
      })
  }, [])

  useEffect(() => {
    void ipcBridge.getVoiceDiagnostics().then(setVoiceDiagnostics)
  }, [])

  useEffect(() => {
    if (!settings) {
      return
    }

    applyVisualSettings(settings)
  }, [settings])

  const hasUnsavedApiKeys = Object.values(apiKeyInputs).some((value) => value.trim().length > 0)
  const configuredProviderCount = apiKeyStatus.filter((status) => status.isSet).length
  const activeProviderLabel =
    settings?.aiProvider === 'anthropic' ? 'Anthropic' : settings?.aiProvider === 'openai' ? 'OpenAI' : 'None'
  const voiceSummary =
    settings?.voiceId && voiceOptions.find((voice) => voice.id === settings.voiceId)
      ? voiceOptions.find((voice) => voice.id === settings.voiceId)?.label ?? 'Custom voice'
      : 'System default'

  // TASK: Restructure settings screen from a flat field dump into grouped, labelled sections.
  // HOW CODE SOLVES: Each logical group (Appearance, Study, Voice, AI) gets its own titled
  // block with a two-column label+control layout. Stat pills removed from header (they
  // duplicated the form values). Save/Reset promoted to a dedicated actions footer row.
  return (
    <main className="app-shell">
      <ModeBar title="Settings" onBack={onBackToModes} />

      <SectionTabs items={[...TABS]} activeId={activeTab} onChange={(id) => setActiveTab(id as any)} />

      {activeTab === 'preferences' ? (
        <div className="app-shell-scroll">
          <section className="panel">
            {loading ? <p>Loading settings…</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {saveMessage ? <p className="feedback-text">{saveMessage}</p> : null}

        {!loading && settings ? (
          <>
            <section className="settings-overview">
              <div className="settings-overview-card">
                <span className="settings-overview-label">Appearance</span>
                <strong>
                  {settings.theme === 'system' ? 'System theme' : settings.theme === 'dark' ? 'Dark theme' : 'Light theme'}
                </strong>
                <p>
                  {settings.visualTheme} style · {settings.textSize} text
                </p>
              </div>
              <div className="settings-overview-card">
                <span className="settings-overview-label">Study target</span>
                <strong>{settings.dailyGoalMinutes} min/day</strong>
                <p>Current daily study goal</p>
              </div>
              <div className="settings-overview-card">
                <span className="settings-overview-label">Read-aloud</span>
                <strong>{voiceSummary}</strong>
                <p>Playback rate {settings.voiceRate.toFixed(1)}x</p>
              </div>
            </section>

            <div className="settings-columns">
              {/* Left column — Appearance */}
              <div className="settings-group">
                <h4 className="settings-group-title">Appearance</h4>
                <div className="settings-fields">
                  <div className="settings-field">
                    <label htmlFor="s-theme">Theme</label>
                    <select
                      id="s-theme"
                      value={settings.theme}
                      onChange={(e) => setSettings((prev) => prev ? { ...prev, theme: e.target.value as UserSettings['theme'] } : prev)}
                    >
                      <option value="system">System</option>
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                  <div className="settings-field">
                    <label htmlFor="s-style">Style</label>
                    <select
                      id="s-style"
                      value={settings.visualTheme}
                      onChange={(e) => setSettings((prev) => prev ? { ...prev, visualTheme: e.target.value as UserSettings['visualTheme'] } : prev)}
                    >
                      <option value="ocean-chart">Coursera-inspired</option>
                      <option value="signal-lab">Signal Lab</option>
                      <option value="field-manual">Field Manual</option>
                    </select>
                  </div>
                  <div className="settings-field">
                    <label htmlFor="s-textsize">Text size</label>
                    <select
                      id="s-textsize"
                      value={settings.textSize}
                      onChange={(e) => setSettings((prev) => prev ? { ...prev, textSize: e.target.value as UserSettings['textSize'] } : prev)}
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Right column — Study + Voice stacked */}
              <div className="settings-right-col">
                <div className="settings-group">
                  <h4 className="settings-group-title">Study</h4>
                  <div className="settings-fields">
                    <div className="settings-field">
                      <label htmlFor="s-goal">Daily goal</label>
                      <div className="settings-field-inline">
                        <input
                          id="s-goal"
                          type="number"
                          min={5}
                          max={180}
                          value={settings.dailyGoalMinutes}
                          onChange={(e) =>
                            setSettings((prev) =>
                              prev ? { ...prev, dailyGoalMinutes: Math.min(180, Math.max(5, Number(e.target.value) || 20)) } : prev,
                            )
                          }
                        />
                        <span className="settings-field-unit">minutes</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="settings-group">
                  <h4 className="settings-group-title">Voice</h4>
                  <div className="settings-fields">
                    <div className="settings-field">
                      <label htmlFor="s-voice">Voice</label>
                      <select
                        id="s-voice"
                        value={settings.voiceId ?? ''}
                        onChange={(e) => setSettings((prev) => prev ? { ...prev, voiceId: e.target.value === '' ? null : e.target.value } : prev)}
                      >
                        <option value="">System default</option>
                        {voiceOptions.map((voice) => (
                          <option key={voice.id} value={voice.id}>{voice.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="settings-field">
                      <label htmlFor="s-rate">Read-aloud rate</label>
                      <div className="settings-field-inline">
                        <input
                          id="s-rate"
                          type="number"
                          min={0.5}
                          max={2}
                          step={0.1}
                          value={settings.voiceRate}
                          onChange={(e) =>
                            setSettings((prev) =>
                              prev ? { ...prev, voiceRate: Math.min(2, Math.max(0.5, Number(e.target.value) || 1)) } : prev,
                            )
                          }
                        />
                        <span className="settings-field-unit">× speed</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-actions">
              <button type="button" className="primary-button" onClick={handleSaveSettings} disabled={saving || resetting}>
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
              <button type="button" className="ghost-btn" onClick={handleResetSettingsToDefault} disabled={saving || resetting}>
                Reset to Defaults
              </button>
            </div>
          </>
        ) : null}
      </section>
      </div>
      ) : null}

      {activeTab === 'ai' ? (
        <div className="app-shell-scroll">
      <section className="panel">
        <h4 className="settings-group-title">AI &amp; API Keys</h4>
        <div className="mode-config-copy">
          <p className="meta">
            Optional — provide your own API key to unlock live AI features (Elmer tutor chat, adaptive study plans).
            Keys are stored in the macOS Keychain and never leave your machine.
          </p>
        </div>
        <section className="settings-ai-summary">
          <div className="settings-ai-summary-card">
            <span className="settings-overview-label">Active provider</span>
            <strong>{activeProviderLabel}</strong>
            <p>{settings?.aiProvider ? 'Used for live AI features when a key is available' : 'No provider selected yet'}</p>
          </div>
          <div className="settings-ai-summary-card">
            <span className="settings-overview-label">Stored keys</span>
            <strong>{configuredProviderCount}</strong>
            <p>{configuredProviderCount === 0 ? 'No saved keys yet' : 'Providers currently ready to use'}</p>
          </div>
          <div className="settings-ai-summary-card">
            <span className="settings-overview-label">Pending changes</span>
            <strong>{hasUnsavedApiKeys ? 'Yes' : 'No'}</strong>
            <p>{hasUnsavedApiKeys ? 'There are API key inputs not saved yet' : 'No unsaved API key entries'}</p>
          </div>
        </section>
        <div className="settings-fields">
          <div className="settings-field">
            <label htmlFor="s-aiprovider">Active provider</label>
            <select
              id="s-aiprovider"
              value={settings?.aiProvider ?? ''}
              onChange={(e) =>
                setSettings((prev) => prev ? { ...prev, aiProvider: (e.target.value as AiProvider) || null } : prev)
              }
            >
              <option value="">None</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
        </div>
        <div className="settings-api-keys">
          {(['anthropic', 'openai'] as const).map((provider) => {
            const status = apiKeyStatus.find((s) => s.provider === provider)
            return (
              <div key={provider} className="api-key-row">
                <div className="settings-field">
                  <label htmlFor={`s-key-${provider}`}>{provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} key</label>
                  <input
                    id={`s-key-${provider}`}
                    type="password"
                    placeholder={status?.isSet ? '••••••••••••••••••••••' : 'Paste API key here'}
                    value={apiKeyInputs[provider]}
                    onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, [provider]: e.target.value }))}
                  />
                </div>
                <div className="api-key-actions">
                  <span className={`api-key-status ${status?.isSet ? 'is-set' : ''}`}>{status?.isSet ? 'Saved' : 'Not set'}</span>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      void handleSetApiKey(provider).then(() => {
                        setSaveMessage(`${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} key saved.`)
                      }).catch((err: unknown) => {
                        const details = err instanceof Error ? err.message : String(err)
                        setError(`Failed to save ${provider} API key. ${details}`)
                      })
                    }}
                    disabled={!apiKeyInputs[provider]}
                  >
                    Save Key
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => handleDeleteApiKey(provider)} disabled={!status?.isSet}>
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
      </div>
      ) : null}

      {activeTab === 'system' ? (
        <div className="app-shell-scroll">
      <section className="panel settings-danger-panel">
        <p className="mode-tagline">Danger Zone</p>
        <p className="meta">
          Reset Everything wipes all study data and app state for a completely fresh start.
        </p>
        <p className="meta">
          This includes progress history, accuracy stats, SRS reviews, flagged/starred questions, saved mnemonics, chat history, and saved settings.
        </p>
        <div className="action-row">
          <button type="button" className="danger-btn" onClick={handleResetEverything} disabled={resetting || saving || loading}>
            {resetting ? 'Resetting...' : 'Reset Everything'}
          </button>
          <button type="button" className="ghost-btn" onClick={() => void loadSettings()} disabled={resetting || saving}>
            Reload Settings
          </button>
        </div>

        {lastReset ? (
          <div className="question-session-overview-row settings-reset-summary">
            <div className="question-session-card">
              <span className="question-session-label">Answers Cleared</span>
              <strong>{lastReset.clearedAnswers}</strong>
              <p>Progress answer records removed.</p>
            </div>
            <div className="question-session-card">
              <span className="question-session-label">Sessions Cleared</span>
              <strong>{lastReset.clearedSessions}</strong>
              <p>Saved study sessions removed.</p>
            </div>
            <div className="question-session-card">
              <span className="question-session-label">SRS Cards Cleared</span>
              <strong>{lastReset.clearedSrsCards}</strong>
              <p>Spaced-repetition review state removed.</p>
            </div>
            <div className="question-session-card">
              <span className="question-session-label">Flags & Stars Reset</span>
              <strong>{lastReset.resetQuestionReviewState ? 'Yes' : 'No'}</strong>
              <p>Question review markers reset.</p>
            </div>
            <div className="question-session-card">
              <span className="question-session-label">Settings Cleared</span>
              <strong>{lastReset.clearedSettings}</strong>
              <p>Saved preferences removed from local state.</p>
            </div>
          </div>
        ) : null}

        {lastResetMessage ? <p className="meta">{lastResetMessage}</p> : null}
      </section>

      <section className="panel">
        <p className="mode-tagline">Voice Diagnostics</p>
        {voiceDiagnostics ? (
          <div className="question-session-overview">
            <div className="question-session-overview-row">
              <div className="question-session-card">
                <span className="question-session-label">Platform</span>
                <strong>{voiceDiagnostics.platform}</strong>
                <p>Current runtime platform for voice services.</p>
              </div>
              <div className="question-session-card">
                <span className="question-session-label">Supported</span>
                <strong>{voiceDiagnostics.supported ? 'Yes' : 'No'}</strong>
                <p>Whether text-to-speech is available in this environment.</p>
              </div>
              <div className="question-session-card">
                <span className="question-session-label">Voices Available</span>
                <strong>{voiceDiagnostics.voices.length}</strong>
                <p>Installed voices currently exposed to the app.</p>
              </div>
            </div>
            {voiceDiagnostics.error ? <p className="error-text">{voiceDiagnostics.error}</p> : null}
            <div className="action-row">
              <button
                type="button"
                onClick={() => {
                  setTestResult(null)
                  ipcBridge
                    .speakText({ text: 'This is a test of the text to speech engine.' })
                    .then((result) => {
                      setTestResult(result.ok ? 'Test successful.' : `Test failed: ${result.reason ?? 'unknown'}`)
                    })
                    .catch((err) => {
                      setTestResult(`Test failed: ${err.message}`)
                    })
                }}
                disabled={!voiceDiagnostics.supported}
              >
                Test Voice
              </button>
              {testResult ? <p className="meta">{testResult}</p> : null}
            </div>
          </div>
        ) : (
          <p>Loading voice diagnostics...</p>
        )}
      </section>
      </div>
      ) : null}
    </main>
  )
}
