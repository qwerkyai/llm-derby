// ============================================================
// TRACK GEOMETRY & RENDERING
// ============================================================

// Canvas dimensions
export const W = 1060, H = 580;

// Oval track: two straights + two semicircles
export const TX = 160, TY = 120;
export const TW = 740, TH = 340;
export const SR = TH / 2;        // semicircle radius = 170
export const SL = TW - TH;       // straight length = 400
export const PERIM = 2 * SL + 2 * Math.PI * SR;

// Track animation time
let trackTime = 0;

// Get point on track centerline at t (0-1), with lane offset
// laneOffset > 0 = outside, < 0 = inside
// Track runs CLOCKWISE: top-straight L→R, right curve, bottom R→L, left curve
export function trackPt(t, laneOffset) {
  t = ((t % 1) + 1) % 1;
  const d = t * PERIM;
  let x, y, nx, ny, angle;
  const lo = laneOffset || 0;

  const rcx = TX + SR + SL;
  const rcy = TY + SR;
  const lcx = TX + SR;
  const lcy = TY + SR;

  if (d < SL) {
    x = TX + SR + d;
    y = TY;
    nx = 0; ny = -1;
    angle = 0;
  } else if (d < SL + Math.PI * SR) {
    const a = (d - SL) / SR;
    x = rcx + SR * Math.sin(a);
    y = rcy - SR * Math.cos(a);
    nx = Math.sin(a);
    ny = -Math.cos(a);
    angle = a;
  } else if (d < 2 * SL + Math.PI * SR) {
    const dd = d - SL - Math.PI * SR;
    x = TX + SR + SL - dd;
    y = TY + TH;
    nx = 0; ny = 1;
    angle = Math.PI;
  } else {
    const dd2 = d - 2 * SL - Math.PI * SR;
    const a2 = dd2 / SR;
    x = lcx - SR * Math.sin(a2);
    y = lcy + SR * Math.cos(a2);
    nx = -Math.sin(a2);
    ny = Math.cos(a2);
    angle = Math.PI + a2;
  }

  x += nx * lo;
  y += ny * lo;

  return { x, y, angle };
}

export function drawTrack(ctx, elapsed, running) {
  trackTime += 0.016;

  // Stadium lights
  const lightPositions = [
    { x: TX + SR + SL * 0.25, y: TY - 40 },
    { x: TX + SR + SL * 0.75, y: TY - 40 },
    { x: TX + SR + SL + SR + 20, y: TY + SR },
    { x: TX + SR + SL * 0.75, y: TY + TH + 40 },
    { x: TX + SR + SL * 0.25, y: TY + TH + 40 },
    { x: TX - 20, y: TY + SR }
  ];

  lightPositions.forEach((lp, li) => {
    const flicker = 0.4 + Math.sin(trackTime * 2 + li * 1.1) * 0.08;
    const grad = ctx.createRadialGradient(lp.x, lp.y, 0, lp.x, lp.y, 100);
    grad.addColorStop(0, `rgba(255,240,180,${flicker * 0.15})`);
    grad.addColorStop(0.5, `rgba(255,220,120,${flicker * 0.05})`);
    grad.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(lp.x - 100, lp.y - 100, 200, 200);
  });

  // Infield grass
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(TX + SR, TY + 10);
  ctx.lineTo(TX + SR + SL, TY + 10);
  ctx.arc(TX + SR + SL, TY + SR, SR - 10, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(TX + SR, TY + TH - 10);
  ctx.arc(TX + SR, TY + SR, SR - 10, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();

  const grassGrad = ctx.createRadialGradient(TX + SR + SL / 2, TY + SR, 20, TX + SR + SL / 2, TY + SR, SR * 1.5);
  grassGrad.addColorStop(0, '#143a18');
  grassGrad.addColorStop(0.5, '#0f2a12');
  grassGrad.addColorStop(1, '#0a1e0d');
  ctx.fillStyle = grassGrad;
  ctx.fill();

  // Animated grass texture
  ctx.clip();
  ctx.globalAlpha = 0.04;
  for (let gi = 0; gi < 40; gi++) {
    const gx = TX + 40 + (gi % 8) * 90 + Math.sin(trackTime * 0.5 + gi) * 3;
    const gy = TY + 30 + Math.floor(gi / 8) * 70 + Math.cos(trackTime * 0.7 + gi * 0.5) * 2;
    ctx.strokeStyle = '#44ff88';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.quadraticCurveTo(gx + Math.sin(trackTime + gi) * 4, gy - 8, gx + Math.sin(trackTime * 1.3 + gi) * 3, gy - 14);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Dirt track surface
  ctx.lineWidth = 56;
  ctx.strokeStyle = '#1a1508';
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const pt = trackPt(i / 200, 9);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.lineWidth = 54;
  ctx.strokeStyle = '#1e1a10';
  ctx.beginPath();
  for (let i = 0; i <= 200; i++) {
    const pt = trackPt(i / 200, 9);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.closePath();
  ctx.stroke();

  // Lane lines
  for (let lane = 0; lane < 4; lane++) {
    const loff = 2 + lane * 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([8, 16]);
    ctx.beginPath();
    for (let li = 0; li <= 200; li++) {
      const lpt = trackPt(li / 200, loff);
      if (li === 0) ctx.moveTo(lpt.x, lpt.y);
      else ctx.lineTo(lpt.x, lpt.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Rails
  [-7, 32].forEach((offset, ri) => {
    ctx.strokeStyle = ri === 0 ? 'rgba(196,164,74,0.08)' : 'rgba(196,164,74,0.05)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let j = 0; j <= 200; j++) {
      const pt = trackPt(j / 200, offset);
      if (j === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = '#c4a44a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let j = 0; j <= 200; j++) {
      const pt = trackPt(j / 200, offset);
      if (j === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
    ctx.stroke();

    for (let rp = 0; rp < 24; rp++) {
      const rpt = trackPt(rp / 24, offset);
      ctx.fillStyle = 'rgba(196,164,74,0.3)';
      ctx.fillRect(rpt.x - 1, rpt.y - 1, 2, 2);
    }
  });

  // Distance markers
  [0.25, 0.5, 0.75].forEach(m => {
    const mpt = trackPt(m, 35);
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(m * 100) + '%', mpt.x, mpt.y);
    const mpt2 = trackPt(m, 31);
    ctx.fillStyle = 'rgba(196,164,74,0.3)';
    ctx.fillRect(mpt2.x - 1, mpt2.y - 4, 2, 8);
  });

  // Finish line
  const flStart = trackPt(0, -7);
  const flEnd = trackPt(0, 32);
  const dx = flEnd.x - flStart.x;
  const dy = flEnd.y - flStart.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.floor(dist / 5);
  const shimmer = Math.sin(trackTime * 3) * 0.15 + 0.85;
  for (let s = 0; s < steps; s++) {
    for (let r = 0; r < 4; r++) {
      const isWhite = (s + r) % 2 === 0;
      const bright = isWhite ? shimmer : 0.1;
      ctx.fillStyle = isWhite ? `rgba(255,255,255,${bright})` : 'rgba(30,30,30,0.9)';
      const fx = flStart.x + (dx / steps) * s - (dy / dist) * r * 4;
      const fy = flStart.y + (dy / steps) * s + (dx / dist) * r * 4;
      ctx.fillRect(fx, fy, 4, 4);
    }
  }

  // S/F label
  const flMid = trackPt(0, -14);
  ctx.save();
  ctx.font = '700 8px "JetBrains Mono", monospace';
  ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.sin(trackTime * 2) * 0.1})`;
  ctx.textAlign = 'center';
  ctx.fillText('S/F', flMid.x, flMid.y);
  ctx.restore();

  // Infield text
  ctx.fillStyle = `rgba(232,184,48,${0.06 + Math.sin(trackTime * 0.8) * 0.02})`;
  ctx.font = '700 48px "Libre Bodoni", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LLM DERBY', TX + SR + SL / 2, TY + SR - 20);

  ctx.font = '500 14px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillText('MMLU-Pro Hard \u00b7 300 Questions', TX + SR + SL / 2, TY + SR + 15);

  // Elapsed timer
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  ctx.font = '700 28px "JetBrains Mono", monospace';
  if (running) {
    const timerPulse = 0.3 + Math.sin(trackTime * 4) * 0.1;
    ctx.fillStyle = `rgba(239,68,68,${timerPulse})`;
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
  }
  ctx.fillText(
    (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs,
    TX + SR + SL / 2, TY + SR + 55
  );

  // Stadium light posts
  lightPositions.forEach(lp => {
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,240,200,0.5)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,240,200,0.1)';
    ctx.fill();
  });

  return trackTime;
}

export function getTrackTime() {
  return trackTime;
}
