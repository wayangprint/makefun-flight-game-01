// Merpati Valley Run — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

// The simulation's fixed step, in seconds: 60 updates a second whatever the
// display's rate.
export const STEP = 1 / 60;

// The course: start on the grass strip, 8 rings down the valley, land on the
// paved strip at the far end. Distances are metres; altitudes are metres
// above the valley floor (y = 0 is the runway surface).
export const COURSE = {
  startX: 0,
  startY: 1,
  startZ: -60,
  startSpeed: 0,
  runway: { x0: -16, x1: 16, z0: 4900, z1: 5320 },
  grassStrip: { x0: -14, x1: 14, z0: -140, z1: 120 },
  town: { x0: -190, x1: 190, z0: 4520, z1: 4880 },
  lake: { cx: -260, cz: 3350, rx: 210, rz: 150 },
  finishZ: 5150,
  // Rings: x, y (altitude), z. The valley bends gently, so the line weaves.
  rings: [
    { x: 0, y: 55, z: 700 },
    { x: -90, y: 70, z: 1300 },
    { x: 60, y: 60, z: 1900 },
    { x: 150, y: 85, z: 2500 },
    { x: -60, y: 65, z: 3100 },
    { x: -150, y: 85, z: 3700 },
    { x: 20, y: 65, z: 4300 },
    { x: 0, y: 45, z: 4700 },
  ],
  ringRadius: 26,
  ringCentreBonus: 12,
};

export const PLANE = {
  cruiseThrottle: 0.72,
  minSpeed: 30,
  maxSpeed: 108,
  baseSpeed: 30,
  speedPerThrottle: 58,
  stallSpeed: 34,
  maxRoll: 1.05,
  maxPitch: 0.5,
  rollRate: 2.4,
  pitchRate: 1.7,
  turnGain: 18,
  throttleRate: 0.8,
  fuel: 100,
  fuelBurnBase: 0.15,
  fuelBurnThrottle: 0.75,
  ringFuel: 4,
  ringPoints: 150,
  centreBonus: 50,
  landingPoints: 500,
};

export const SCORE = {
  timePar: 150,
  timeBonusPerSecond: 2,
  fuelBonusPerUnit: 1,
};

// How far the chase camera sits behind and above the plane, in metres.
export const CAMERA = { behind: 15, above: 4.6, lookAhead: 46, focal: 620 };

// Late-afternoon valley palette: warm sky, green valley, grey rock.
export const PALETTE = {
  skyTop: '#2f6fb4',
  skyMid: '#7fb2dd',
  skyHorizon: '#f6d9a0',
  sun: '#fff3c4',
  sunCore: '#fffbe8',
  ridgeFar: '#8fa8c8',
  ridgeNear: '#6d86a8',
  grassLow: '#5d9b4a',
  grassHigh: '#7fae56',
  meadow: '#93bd63',
  sand: '#d9c48a',
  water: '#3f8fc4',
  waterDeep: '#2c6ea6',
  rock: '#8d8a86',
  rockDark: '#6f6c68',
  townRoof: '#b0705a',
  townWall: '#e8dcc8',
  townRoad: '#5c5a56',
  runway: '#3a3d42',
  runwayMark: '#f2f2e8',
  grassStrip: '#6da054',
  planeRed: '#c0392b',
  planeCream: '#f5ead2',
  planeDark: '#2c2f36',
  ringGold: '#ffc93c',
  ringNext: '#ffd94d',
  ringDone: '#58d68d',
  hudText: '#ffffff',
  hudDim: '#cfe3f2',
  hudWarn: '#ffb02e',
  hudBad: '#ff5a4e',
  panel: '#1d2126',
  panelEdge: '#3a4048',
  gaugeFace: '#10151b',
  gaugeNeedle: '#ffcf3f',
  gaugeGlow: '#7fd4ff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = '"SF Mono", "Cascadia Mono", Consolas, monospace';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'merpati-valley-run.best';
