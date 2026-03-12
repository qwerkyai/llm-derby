// ============================================================
// Minimal QR Code generator for the footer
// Draws a QR code onto a canvas element
// Uses a simple approach: generates a placeholder QR-like pattern
// For production, swap in a real QR library or pre-generated image
// ============================================================

export function drawQRCode(canvasId, url) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const modules = 21; // QR version 1
  const cellSize = Math.floor(size / (modules + 2));
  const offset = Math.floor((size - cellSize * modules) / 2);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Generate a deterministic pattern from the URL
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }

  function seeded(x, y) {
    const v = ((hash + x * 31 + y * 37) * 2654435761) >>> 0;
    return v;
  }

  // Draw finder patterns (3 corners)
  function drawFinder(ox, oy) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        ctx.fillStyle = (isOuter || isInner) ? '#000000' : '#ffffff';
        ctx.fillRect(offset + (ox + c) * cellSize, offset + (oy + r) * cellSize, cellSize, cellSize);
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(modules - 7, 0);
  drawFinder(0, modules - 7);

  // Draw timing patterns
  for (let i = 8; i < modules - 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#000000' : '#ffffff';
    ctx.fillRect(offset + i * cellSize, offset + 6 * cellSize, cellSize, cellSize);
    ctx.fillRect(offset + 6 * cellSize, offset + i * cellSize, cellSize, cellSize);
  }

  // Fill data area with seeded pattern
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      // Skip finder patterns and timing
      if ((r < 8 && c < 8) || (r < 8 && c >= modules - 8) || (r >= modules - 8 && c < 8)) continue;
      if (r === 6 || c === 6) continue;

      const dark = (seeded(r, c) % 3) !== 0;
      if (dark) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(offset + c * cellSize, offset + r * cellSize, cellSize, cellSize);
      }
    }
  }
}
