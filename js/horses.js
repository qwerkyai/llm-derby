// ============================================================
// HORSE RENDERING — trails, particles, glow, labels
// ============================================================

import { trackPt, getTrackTime } from './track.js';

export function drawHorses(ctx, horses, running) {
  const trackTime = getTrackTime();
  const drawOrder = horses.slice().sort((a, b) => a.displayProg - b.displayProg);

  drawOrder.forEach(h => {
    const idx = h.id;
    const laneOff = 2 + idx * 10;
    const pt = trackPt(h.displayProg, laneOff);

    // Glowing trail
    const trailLen = 0.05;
    const tStart = Math.max(0, h.displayProg - trailLen);
    if (h.displayProg > 0.001) {
      for (let seg = 0; seg < 15; seg++) {
        const t1 = tStart + (h.displayProg - tStart) * (seg / 15);
        const t2 = tStart + (h.displayProg - tStart) * ((seg + 1) / 15);
        const p1 = trackPt(t1, laneOff);
        const p2 = trackPt(t2, laneOff);
        const alpha = (seg / 15) * 0.4;
        ctx.strokeStyle = h.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.lineWidth = 2 + (seg / 15) * 3;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    // Dust particles
    if (running && !h.finishTime) {
      if (Math.random() < 0.4) {
        const behindT = Math.max(0, h.displayProg - 0.002);
        const behindPt = trackPt(behindT, laneOff);
        const vx = (behindPt.x - pt.x) * 0.4 + (Math.random() - 0.5) * 0.8;
        const vy = (behindPt.y - pt.y) * 0.4 + (Math.random() - 0.5) * 0.8;
        h.particles.push({
          x: pt.x + vx * 3,
          y: pt.y + vy * 3,
          life: 1,
          vx, vy,
          size: 1 + Math.random() * 3
        });
      }
    }

    // Draw particles
    h.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= 0.025;
      if (p.life > 0) {
        const pAlpha = Math.floor(p.life * 60);
        ctx.fillStyle = h.color + (pAlpha < 16 ? '0' : '') + pAlpha.toString(16);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.life * p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    h.particles = h.particles.filter(p => p.life > 0);

    // Outer glow
    const glowSize = 22 + Math.sin(trackTime * 3 + idx) * 3;
    const glowGrad = ctx.createRadialGradient(pt.x, pt.y, 6, pt.x, pt.y, glowSize);
    glowGrad.addColorStop(0, h.color + '30');
    glowGrad.addColorStop(0.5, h.color + '10');
    glowGrad.addColorStop(1, h.color + '00');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, glowSize, 0, Math.PI * 2);
    ctx.fill();

    // Answer flash ring
    if (h.answerFlash && h.answerFlash > 0) {
      const flashR = 16 + (1 - h.answerFlash) * 20;
      const flashColor = h.lastCorrect ? 'rgba(34,197,94,' : 'rgba(239,68,68,';
      ctx.strokeStyle = flashColor + (h.answerFlash * 0.6) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, flashR, 0, Math.PI * 2);
      ctx.stroke();
      h.answerFlash -= 0.04;
    }

    // Horse circle
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = h.color + '25';
    ctx.fill();
    ctx.strokeStyle = h.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Inner highlight
    ctx.beginPath();
    ctx.arc(pt.x - 2, pt.y - 2, 8, 0, Math.PI * 2);
    ctx.fillStyle = h.color + '08';
    ctx.fill();

    // Emoji
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(h.emoji, pt.x, pt.y + 1);

    // Name label
    ctx.font = '600 10px "Manrope", sans-serif';
    const nameW = ctx.measureText(h.name).width;
    ctx.fillStyle = 'rgba(5,8,16,0.7)';
    ctx.fillRect(pt.x - nameW / 2 - 4, pt.y - 30, nameW + 8, 14);
    ctx.fillStyle = h.color;
    ctx.fillText(h.name, pt.x, pt.y - 22);
  });
}
