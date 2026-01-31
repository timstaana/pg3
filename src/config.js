// config.js - Global configuration and constants
// Data-driven settings for the 3D platformer

// ========== World Settings ==========

const WORLD_SCALE = 50; // 1 world unit = 50 p5 units

// ========== Physics Constants ==========

const GRAVITY = 20.0;
const MAX_SLOPE_DEG = 45.0;
const MIN_GROUND_NY = Math.cos(MAX_SLOPE_DEG * Math.PI / 180); // ~0.707
const GROUNDING_TOLERANCE = 0.01;

// ========== Collision Configuration ==========

const COLLISION_CONFIG = {
  queryMargin: 0.5,
  downMargin: 2.0,
  upMargin: 2.0
};
