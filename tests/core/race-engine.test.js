import { describe, it, expect, beforeEach } from 'vitest';
import { calculatePenalty, createHorseState, raceTick, lerpHorses, resetHorseState, initHorses } from '../../src/core/race-engine.js';
import { BENCHMARK_DATA } from '../../src/data/benchmark.js';

describe('calculatePenalty', () => {
  it('returns base penalty for first wrong answer', () => {
    expect(calculatePenalty(1)).toBe(2.5);
  });

  it('returns base penalty for zero wrongs', () => {
    expect(calculatePenalty(0)).toBe(2);
  });

  it('scales linearly with cumulative wrongs', () => {
    expect(calculatePenalty(2)).toBe(3);
    expect(calculatePenalty(4)).toBe(4);
  });

  it('caps at 8 seconds', () => {
    expect(calculatePenalty(50)).toBe(8);
    expect(calculatePenalty(100)).toBe(8);
    expect(calculatePenalty(12)).toBe(8);
  });

  it('reaches cap at exactly 12 wrongs', () => {
    // 2 + 12 * 0.5 = 8
    expect(calculatePenalty(12)).toBe(8);
    expect(calculatePenalty(11)).toBe(7.5);
  });
});

describe('createHorseState', () => {
  it('creates a horse with correct initial values', () => {
    const horse = createHorseState(BENCHMARK_DATA[0]);
    expect(horse.id).toBe(0);
    expect(horse.name).toBe('Llama 3.1 3B');
    expect(horse.currentQ).toBe(0);
    expect(horse.correct).toBe(0);
    expect(horse.progress).toBe(0);
    expect(horse.finishTime).toBe(0);
    expect(horse.questions.length).toBe(300);
  });

  it('pre-computes a positive estimated total time', () => {
    const horse = createHorseState(BENCHMARK_DATA[0]);
    expect(horse.estimatedTotalTime).toBeGreaterThan(0);
  });
});

describe('initHorses', () => {
  it('creates horses from benchmark data', () => {
    const horses = initHorses(BENCHMARK_DATA);
    expect(horses.length).toBe(3);
    expect(horses[0].name).toBe('Llama 3.1 3B');
    expect(horses[1].name).toBe('Qre Llama 3B');
    expect(horses[2].name).toBe('Qre Llama 8B');
  });
});

describe('raceTick', () => {
  let horses;

  beforeEach(() => {
    horses = initHorses(BENCHMARK_DATA);
  });

  it('returns empty events for zero dt', () => {
    const events = raceTick(horses, 0);
    expect(events).toEqual([]);
  });

  it('advances horses and emits answer events', () => {
    // Tick with a large dt to guarantee at least one answer
    const events = raceTick(horses, 50000);
    const answers = events.filter((e) => e.type === 'answer');
    expect(answers.length).toBeGreaterThan(0);
  });

  it('emits answer events with correct structure', () => {
    const events = raceTick(horses, 50000);
    const answer = events.find((e) => e.type === 'answer');
    expect(answer).toHaveProperty('horseId');
    expect(answer).toHaveProperty('qNum');
    expect(answer).toHaveProperty('subject');
    expect(answer).toHaveProperty('correct');
    expect(answer).toHaveProperty('tokens');
  });

  it('is deterministic — same input produces same output', () => {
    const horses1 = initHorses(BENCHMARK_DATA);
    const horses2 = initHorses(BENCHMARK_DATA);
    const events1 = raceTick(horses1, 10000);
    const events2 = raceTick(horses2, 10000);
    expect(events1.length).toBe(events2.length);
    events1.forEach((e, i) => {
      expect(e.type).toBe(events2[i].type);
      expect(e.horseId).toBe(events2[i].horseId);
    });
  });

  it('does not advance finished horses', () => {
    const horse = horses[0];
    horse.finishTime = Date.now();
    horse.currentQ = 300;
    const events = raceTick(horses, 50000);
    const horse0Events = events.filter((e) => e.horseId === 0);
    expect(horse0Events.length).toBe(0);
  });
});

describe('lerpHorses', () => {
  it('moves displayProg toward progress', () => {
    const horses = initHorses(BENCHMARK_DATA);
    horses[0].progress = 0.5;
    horses[0].displayProg = 0;
    lerpHorses(horses, 0.1);
    expect(horses[0].displayProg).toBeGreaterThan(0);
    expect(horses[0].displayProg).toBeLessThan(0.5);
  });

  it('snaps to progress when close enough', () => {
    const horses = initHorses(BENCHMARK_DATA);
    horses[0].progress = 0.5;
    horses[0].displayProg = 0.4999999;
    lerpHorses(horses, 0.1);
    expect(horses[0].displayProg).toBe(0.5);
  });
});

describe('resetHorseState', () => {
  it('resets all race state to initial values', () => {
    const horses = initHorses(BENCHMARK_DATA);
    const horse = horses[0];
    horse.currentQ = 150;
    horse.correct = 80;
    horse.progress = 0.6;
    horse.finishTime = Date.now();

    resetHorseState(horse);
    expect(horse.currentQ).toBe(0);
    expect(horse.correct).toBe(0);
    expect(horse.progress).toBe(0);
    expect(horse.finishTime).toBe(0);
    expect(horse.particles).toEqual([]);
  });
});
