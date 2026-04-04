import AppKit
import Foundation

struct MaskRect {
  let x: CGFloat
  let y: CGFloat
  let width: CGFloat
  let height: CGFloat
}

func rectFromTopLeft(_ rect: MaskRect, imageHeight: Int) -> NSRect {
  NSRect(
    x: rect.x,
    y: CGFloat(imageHeight) - rect.y - rect.height,
    width: rect.width,
    height: rect.height,
  )
}

let masksByFile: [String: [MaskRect]] = [
  "Figure T-1.png": [
    .init(x: 80, y: 198, width: 220, height: 72),
  ],
  "Figure T-2.png": [
    .init(x: 505, y: 495, width: 400, height: 72),
  ],
  "Figure T-3.png": [
    .init(x: 200, y: 600, width: 460, height: 130),
  ],
  "Figure G7-1.png": [
    .init(x: 140, y: 242, width: 150, height: 42),
  ],
  "Figure E5-1.png": [
    .init(x: 395, y: 12, width: 310, height: 72),
    .init(x: 135, y: 670, width: 165, height: 60),
    .init(x: 40, y: 785, width: 1000, height: 72),
  ],
  "Figure E6-1.png": [
    .init(x: 265, y: 15, width: 230, height: 46),
    .init(x: 60, y: 388, width: 160, height: 60),
    .init(x: 0, y: 440, width: 752, height: 106),
  ],
  "Figure E6-2.png": [
    .init(x: 190, y: 8, width: 220, height: 60),
    .init(x: 60, y: 318, width: 130, height: 58),
    .init(x: 0, y: 360, width: 582, height: 94),
  ],
  "Figure E6-3.png": [
    .init(x: 290, y: 12, width: 190, height: 42),
    .init(x: 105, y: 375, width: 125, height: 42),
    .init(x: 0, y: 410, width: 776, height: 100),
  ],
  "Figure E7-1.png": [
    .init(x: 235, y: 14, width: 170, height: 40),
    .init(x: 90, y: 332, width: 135, height: 52),
    .init(x: 0, y: 390, width: 628, height: 104),
  ],
  "Figure E7-2.png": [
    .init(x: 220, y: 14, width: 170, height: 40),
    .init(x: 405, y: 355, width: 125, height: 38),
    .init(x: 0, y: 418, width: 588, height: 112),
  ],
  "Figure E7-3.png": [
    .init(x: 165, y: 10, width: 185, height: 44),
    .init(x: 78, y: 312, width: 112, height: 36),
    .init(x: 0, y: 378, width: 520, height: 108),
  ],
  "Figure E9-1.png": [
    .init(x: 250, y: 10, width: 180, height: 42),
    .init(x: 505, y: 68, width: 138, height: 68),
    .init(x: 38, y: 603, width: 105, height: 30),
  ],
  "Figure E9-2.png": [
    .init(x: 175, y: 8, width: 175, height: 36),
    .init(x: 355, y: 42, width: 180, height: 50),
    .init(x: 20, y: 254, width: 125, height: 42),
  ],
  "Figure E9-3.png": [
    .init(x: 168, y: 8, width: 190, height: 36),
    .init(x: 0, y: 548, width: 120, height: 30),
  ],
]

let fileManager = FileManager.default
let imagesRoot = URL(fileURLWithPath: fileManager.currentDirectoryPath)
  .appendingPathComponent("data/images", isDirectory: true)

guard let enumerator = fileManager.enumerator(
  at: imagesRoot,
  includingPropertiesForKeys: nil,
  options: [.skipsHiddenFiles],
) else {
  fputs("Unable to enumerate data/images\n", stderr)
  exit(1)
}

var cleanedCount = 0

for case let fileURL as URL in enumerator {
  guard fileURL.pathExtension.lowercased() == "png" else { continue }
  guard let masks = masksByFile[fileURL.lastPathComponent] else { continue }
  guard let image = NSImage(contentsOf: fileURL) else {
    fputs("Failed to read \(fileURL.path)\n", stderr)
    continue
  }

  var proposedRect = NSRect(origin: .zero, size: image.size)
  guard let cgImage = image.cgImage(forProposedRect: &proposedRect, context: nil, hints: nil) else {
    fputs("Failed to create CGImage for \(fileURL.path)\n", stderr)
    continue
  }

  let width = cgImage.width
  let height = cgImage.height

  guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: width,
    pixelsHigh: height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0,
  ) else {
    fputs("Failed to create bitmap for \(fileURL.path)\n", stderr)
    continue
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
  let context = NSGraphicsContext.current?.cgContext
  context?.draw(cgImage, in: NSRect(x: 0, y: 0, width: width, height: height))

  NSColor.white.setFill()
  for mask in masks {
    NSBezierPath(rect: rectFromTopLeft(mask, imageHeight: height)).fill()
  }
  NSGraphicsContext.restoreGraphicsState()

  guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
    fputs("Failed to encode PNG for \(fileURL.path)\n", stderr)
    continue
  }

  do {
    try pngData.write(to: fileURL, options: .atomic)
    cleanedCount += 1
    print("Cleaned \(fileURL.lastPathComponent)")
  } catch {
    fputs("Failed to write \(fileURL.path): \(error)\n", stderr)
  }
}

print("Done. Cleaned \(cleanedCount) figure images.")
