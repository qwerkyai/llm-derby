import { describe, it, expect } from 'vitest';
import {
  TOTAL_QUESTIONS,
  PENALTY_BASE_SECONDS,
  PENALTY_INCREMENT_SECONDS,
  PENALTY_CAP_SECONDS,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TRACK_WIDTH,
  TRACK_HEIGHT,
  SEMICIRCLE_RADIUS,
  STRAIGHT_LENGTH,
  SUBJECTS,
  SUBJECT_DIFFICULTY,
  DEFAULT_MODEL_CONFIGS,
  CONFETTI_COLORS,
  SPEED_OPTIONS,
  LANE_SPACING,
  HORSE_RADIUS,
} from '../../src/core/config.js';

describe('race config', () => {
  it('has 300 total questions', () => {
    expect(TOTAL_QUESTIONS).toBe(300);
  });

  it('has valid penalty parameters', () => {
    expect(PENALTY_BASE_SECONDS).toBeGreaterThan(0);
    expect(PENALTY_INCREMENT_SECONDS).toBeGreaterThan(0);
    expect(PENALTY_CAP_SECONDS).toBeGreaterThan(PENALTY_BASE_SECONDS);
    // Cap should be reachable
    const wrongsToReachCap = (PENALTY_CAP_SECONDS - PENALTY_BASE_SECONDS) / PENALTY_INCREMENT_SECONDS;
    expect(wrongsToReachCap).toBeGreaterThan(0);
  });
});

describe('canvas config', () => {
  it('has positive dimensions', () => {
    expect(CANVAS_WIDTH).toBeGreaterThan(0);
    expect(CANVAS_HEIGHT).toBeGreaterThan(0);
  });
});

describe('track geometry', () => {
  it('semicircle radius is half of track height', () => {
    expect(SEMICIRCLE_RADIUS).toBe(TRACK_HEIGHT / 2);
  });

  it('straight length is track width minus track height', () => {
    expect(STRAIGHT_LENGTH).toBe(TRACK_WIDTH - TRACK_HEIGHT);
  });

  it('horses fit in the track width', () => {
    const maxHorses = 3;
    const totalLaneWidth = maxHorses * LANE_SPACING;
    // Lanes should not exceed track surface width
    expect(totalLaneWidth).toBeLessThan(56); // TRACK_SURFACE_WIDTH
  });

  it('horse radius is reasonable for lane spacing', () => {
    expect(HORSE_RADIUS * 2).toBeLessThan(LANE_SPACING * 2);
  });
});

describe('subjects', () => {
  it('has 15 subjects', () => {
    expect(SUBJECTS.length).toBe(15);
  });

  it('every subject has a difficulty weight', () => {
    SUBJECTS.forEach((s) => {
      expect(SUBJECT_DIFFICULTY[s]).toBeDefined();
      expect(SUBJECT_DIFFICULTY[s]).toBeGreaterThan(0);
      expect(SUBJECT_DIFFICULTY[s]).toBeLessThanOrEqual(1);
    });
  });
});

describe('default model configs', () => {
  it('has 3 models', () => {
    expect(DEFAULT_MODEL_CONFIGS.length).toBe(3);
  });

  it('each model has required fields', () => {
    DEFAULT_MODEL_CONFIGS.forEach((m) => {
      expect(m.id).toBeDefined();
      expect(m.name).toBeTruthy();
      expect(m.emoji).toBeTruthy();
      expect(m.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(m.baseTPS).toBeGreaterThan(0);
      expect(m.targetCorrect).toBeGreaterThan(0);
      expect(m.targetCorrect).toBeLessThanOrEqual(TOTAL_QUESTIONS);
      expect(m.seed).toBeDefined();
    });
  });

  it('each model has a unique seed', () => {
    const seeds = DEFAULT_MODEL_CONFIGS.map((m) => m.seed);
    expect(new Set(seeds).size).toBe(seeds.length);
  });
});

describe('UI config', () => {
  it('has valid speed options', () => {
    expect(SPEED_OPTIONS).toContain(1);
    expect(SPEED_OPTIONS.every((s) => s > 0)).toBe(true);
  });

  it('has confetti colors', () => {
    expect(CONFETTI_COLORS.length).toBeGreaterThan(0);
  });
});
