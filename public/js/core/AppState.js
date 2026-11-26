// Centralized Reactive Application State for RoboChibiLand

export const appState = {
  activeRobotName: 'Sparky',
  cameraMode: 'diagonal',
  timeOfDay: 'day',
  weatherMode: 'CLEAR',
  visionMode: '',
  isFreeWill: false,
  isHandToolActive: false,
  isZenMode: false,
  isTouchVisible: false,
  isMuted: false,
  isVoiceEnabled: true,
  scores: {
    soccer: 0,
    target: 0
  },
  navigation: {
    active: false,
    target: null,
    mode: null
  },
  net: {
    connected: false,
    user: null,
    onlineUsers: []
  },
  telemetry: {
    fps: 60,
    frameMs: 16.6,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    aiPingMs: null,
    apiCalls: 0
  }
};
