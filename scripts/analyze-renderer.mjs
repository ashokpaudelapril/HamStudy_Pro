import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const assetsDir = join(process.cwd(), 'out', 'renderer', 'assets')

async function main() {
  const files = await readdir(assetsDir)
  const jsFiles = files.filter((file) => file.endsWith('.js')).map((file) => join(assetsDir, file))

  if (jsFiles.length === 0) {
    console.error(`No renderer JS bundles found in ${assetsDir}`)
    process.exit(1)
  }

  const sorted = await Promise.all(
    jsFiles.map(async (file) => ({
      file,
      size: (await stat(file)).size,
    })),
  )

  sorted.sort((left, right) => right.size - left.size)

  console.log('Renderer chunk sizes:')
  for (const entry of sorted) {
    console.log(`${(entry.size / 1024).toFixed(1).padStart(8)} KB  ${entry.file}`)
  }

  const explorerArgs = ['source-map-explorer', ...jsFiles, '--html', 'out/renderer/source-map-report.html']
  const result = spawnSync('npx', explorerArgs, { stdio: 'inherit' })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})