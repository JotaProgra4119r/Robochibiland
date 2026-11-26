use glam::Vec3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FootstepSurface {
    Grass,
    Stone,
    Wood,
    Water,
}

#[derive(Debug, Clone, Copy)]
pub enum AudioKind {
    Bark,
    Boop,
    Jump,
    HappyJingle,
    Curious,
    Step(FootstepSurface),
    Splash,
    Trampoline,
    GoalFanfare,
    TargetHit,
    SnackMunch,
    DiscoBeat(u8),
    TrickSuccess,
    Howl,
    WaveSound,
    Confused,
    Whine,
    Yip,
    Grumble,
    UiChirp,
    Bounce(f32),
}

#[derive(Debug, Clone, Copy)]
pub struct AudioEvent {
    pub kind: AudioKind,
    pub world_pos: Vec3,
    pub pitch: f32,
}
