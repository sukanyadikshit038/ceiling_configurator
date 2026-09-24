// Declarative data for the procedural furnished rooms.
//
// Deliberately separate from lib/furniture.js, which builds their geometry.
// Rooms, the store and the schedule need a scenario's SIZE, not its furniture,
// and furniture construction pulls in three.js and canvas textures — so
// importing it from the domain layer would make the document logic untestable
// outside a browser. This file imports nothing.
//
//   room    — width (X), length (Z), ceiling height, in metres, centred on the
//             origin. The ceiling plane falls straight out of it.
//   decor   — tints and floor finish for the shell (lib/shell.js).
//   anchors — where the furniture sits, so a layout preset can line products up
//             with desks and tables instead of guessing.

export const SCENARIOS = {
  'office-realistic': {
    label: 'Office — executive open plan',
    room: { w: 14, l: 10, h: 3.2 },
    decor: { wall: '#e9eaeb', floor: '#ffffff', floorTex: 'striped' },
    anchors: { deskCols: [-3.9, -1.1, 1.7], deskRows: [-3.35, -0.25, 2.85], meetingX: 3.2 },
  },
  'office-open': {
    label: 'Office — open plan desks',
    room: { w: 14, l: 10, h: 3.2 },
    decor: { wall: '#e4e7ea', floor: '#ffffff' },
    anchors: { clusters: [[-3.4, -2.0], [3.4, -2.0], [-3.4, 2.2], [3.4, 2.2]] },
  },
  'office-teams': {
    label: 'Office — team bays',
    room: { w: 12, l: 9, h: 3.0 },
    decor: { wall: '#e4e7ea', floor: '#ffffff' },
    anchors: { clusters: [[-2.8, -1.9], [2.8, -1.9], [-2.8, 2.0]], meeting: [3.4, 2.0] },
  },
  'office-board': {
    label: 'Boardroom',
    room: { w: 8, l: 6, h: 3.0 },
    decor: { wall: '#e0e3e6', floor: '#f0ede6' },
    anchors: { table: [0, 0] },
  },
  'hosp-dining': {
    label: 'Restaurant',
    room: { w: 12, l: 9, h: 3.6 },
    decor: { wall: '#ded5c8', floor: '#c9b899' },
    anchors: { tables: [[-3.4, -1.2], [0, -1.2], [3.4, -1.2], [-3.4, 2.1], [0, 2.1], [3.4, 2.1]] },
  },
  'hosp-lounge': {
    label: 'Hotel lounge',
    room: { w: 13, l: 10, h: 4.0 },
    decor: { wall: '#e0d8cd', floor: '#d6c7ab' },
    anchors: { groups: [[-3.8, -1.8], [0.3, 1.9], [4.0, -1.6]] },
  },
  'hosp-fine': {
    label: 'Fine dining',
    room: { w: 10, l: 8, h: 3.4 },
    decor: { wall: '#d8cec2', floor: '#a99274' },
    anchors: { tables: [[-2.2, -1.5], [2.2, -1.5], [-2.2, 1.6], [2.2, 1.6]] },
  },
  'edu-class': {
    label: 'Classroom',
    room: { w: 9, l: 7, h: 3.0 },
    decor: { wall: '#e8eaec', floor: '#ffffff' },
    anchors: { deskCols: [-2.7, -0.9, 0.9, 2.7], deskRows: [0.3, 1.5, 2.7], teacher: [0, -2.2] },
  },
  'edu-library': {
    label: 'Library commons',
    room: { w: 12, l: 9, h: 3.4 },
    decor: { wall: '#e6e2d8', floor: '#e8e0d0' },
    anchors: { tables: [[-3.0, -1.6], [0.8, -2.0], [2.6, 1.6]], pod: [-3.6, 2.4] },
  },
  'edu-lecture': {
    label: 'Lecture hall',
    room: { w: 11, l: 9, h: 3.6 },
    decor: { wall: '#e2e5e8', floor: '#ffffff' },
    anchors: { stageZ: -3.0, rows: [-0.3, 0.7, 1.7, 2.7] },
  },
}

export const SCENARIO_KEYS = Object.keys(SCENARIOS)

export const getScenario = (key) => SCENARIOS[key] ?? null
