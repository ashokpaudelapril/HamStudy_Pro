import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDb } from './db/database'
import { backfillSrsCardsFromAnswerHistory } from './db/queries'
import { applyHintsIfPresent, seedQuestionsIfNeeded } from './db/seed'
import { registerAiIpcHandlers } from './ipc/ai'
import { registerProgressIpcHandlers } from './ipc/progress'
import { registerQuestionsIpcHandlers } from './ipc/questions'
import { registerSettingsIpcHandlers } from './ipc/settings'

const isDev = process.env.NODE_ENV === 'development'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// ISSUE: Preload output filename can differ by build/runtime mode (`index.mjs` vs `index.js`),
//        and a hardcoded path breaks `window.hamstudy` bridge registration.
// FIX APPLIED: Resolve preload path dynamically by checking emitted files in priority order.
function resolvePreloadPath(): string {
  const mjsPath = join(__dirname, '../preload/index.mjs')
  if (existsSync(mjsPath)) {
    return mjsPath
  }

  const jsPath = join(__dirname, '../preload/index.js')
  return jsPath
}

// TASK: Create and configure the primary desktop window.
// HOW CODE SOLVES: Builds a BrowserWindow with preload wiring, then loads either
//                  the dev server URL or the packaged renderer HTML file.
// Stores the result in module-level `mainWindow` so tray click can show/focus it.
function createMainWindow(): void {
  const preloadPath = resolvePreloadPath()
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 720,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'HamStudy Pro',
  })

  // ISSUE: Preload bridge failures can otherwise look like renderer-only errors.
  // FIX APPLIED: Emit explicit main-process diagnostics for preload path and load errors.
  console.info('[main] Using preload script:', preloadPath)
  window.webContents.on('preload-error', (_event, preloadFile, error) => {
    console.error('[main] Preload failed:', preloadFile, error)
  })

  mainWindow = window

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    window.webContents.openDevTools({ mode: 'detach' })
    return
  }

  void window.loadFile(join(__dirname, '../renderer/index.html'))
}

// TASK: Create a macOS system tray icon with show/quit context menu.
// HOW CODE SOLVES: Resolves icon from dev assets path with a graceful empty fallback
//                  for packaged builds until a dedicated tray icon is bundled.
//                  Left-click and context-menu "Show" both bring the window to front.
function createTray(): void {
  if (process.platform !== 'darwin') return

  const devIconPath = join(__dirname, '../../src/assets/hero.png')
  const icon = existsSync(devIconPath)
    ? nativeImage.createFromPath(devIconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty()

  tray = new Tray(icon)
  tray.setToolTip('HamStudy Pro')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show HamStudy Pro',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        } else {
          createMainWindow()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// TASK: Initialize the app's local data and IPC layer.
// HOW CODE SOLVES: Ensures the SQLite database is reachable, seeds the FCC
//                   question pool idempotently, and registers IPC handlers
//                   before the renderer is displayed.
async function onAppReady(): Promise<void> {
  const db = getDb()
  await seedQuestionsIfNeeded(db)
  // TASK: Apply authored hint/explanation/mnemonic content on every startup.
  // HOW CODE SOLVES: Runs after seed so hint files can update existing question rows
  //                  without requiring a DB wipe — edits to data/hints/*.json take effect on restart.
  await applyHintsIfPresent(db)
  const backfilledCards = backfillSrsCardsFromAnswerHistory(db)
  if (backfilledCards > 0) {
    console.info('[main] Backfilled SRS cards from history:', backfilledCards)
  }
  registerQuestionsIpcHandlers()
  registerProgressIpcHandlers()
  registerSettingsIpcHandlers()
  registerAiIpcHandlers()
}

// TASK: Boot sequence entrypoint after Electron `app.whenReady()`.
// HOW CODE SOLVES: Ensures DB seed + IPC registration complete before the
//                   first window is created.
async function onReadyCreateWindow(): Promise<void> {
  await onAppReady()
  createMainWindow()
  createTray()
}

app.whenReady().then(onReadyCreateWindow)

// TASK: Handle macOS dock/menu activate events.
// HOW CODE SOLVES: Ensures the window is recreated if all windows were closed.
function onActivate(): void {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
  if (!tray) {
    createTray()
  }
}

app.on('activate', onActivate)

// TASK: Handle closing of the last window on non-macOS platforms.
// HOW CODE SOLVES: Quits the Electron app except on macOS where the dock remains active.
function onWindowAllClosed(): void {
  if (process.platform !== 'darwin') {
    app.quit()
  }
}

app.on('window-all-closed', onWindowAllClosed)
