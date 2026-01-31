// config.js - Shared constants and configuration

// World scale: 1.0 world unit = 50 p5 units
const WORLD_SCALE = 50;

// Physics constants
const GRAVITY = 20.0;
const MAX_SLOPE_DEG = 45.0;
const MIN_GROUND_NY = Math.cos(MAX_SLOPE_DEG * Math.PI / 180.0); // ~0.707
const GROUNDING_TOLERANCE = 0.01; // Extra tolerance for grounding check

// Collision broadphase config
const COLLISION_CONFIG = {
  queryMargin: 0.5,
  downMargin: 2.0,
  upMargin: 2.0
};
