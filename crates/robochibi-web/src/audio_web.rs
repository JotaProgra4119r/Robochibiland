use robochibi_audio::RoboAudioSynth;
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{AudioContext, AudioContextState, AudioProcessingEvent, ScriptProcessorNode};

pub struct WebAudioBridge {
    pub synth: Rc<RefCell<RoboAudioSynth>>,
    ctx: Option<AudioContext>,
    _proc: Option<ScriptProcessorNode>,
    _cb: Option<Closure<dyn FnMut(AudioProcessingEvent)>>,
    pub muted: bool,
    pub voice_enabled: bool,
}

impl WebAudioBridge {
    pub fn new() -> Self {
        Self {
            synth: Rc::new(RefCell::new(RoboAudioSynth::new(44100.0))),
            ctx: None,
            _proc: None,
            _cb: None,
            muted: false,
            voice_enabled: true,
        }
    }

    pub fn ensure_started(&mut self) {
        if self.muted {
            return;
        }
        if let Some(ctx) = &self.ctx {
            if ctx.state() == AudioContextState::Suspended {
                let _ = ctx.resume();
            }
            return;
        }
        let Ok(ctx) = AudioContext::new() else {
            return;
        };
        let sr = ctx.sample_rate();
        self.synth.borrow_mut().set_sample_rate(sr);

        #[allow(deprecated)]
        let Ok(proc_node) = ctx.create_script_processor_with_buffer_size_and_number_of_input_channels_and_number_of_output_channels(1024, 0, 2) else {
            return;
        };

        let synth_ref = self.synth.clone();
        let mut left_buf = vec![0.0f32; 1024];
        let mut right_buf = vec![0.0f32; 1024];

        let cb = Closure::wrap(Box::new(move |ev: AudioProcessingEvent| {
            let Ok(out_buf) = ev.output_buffer() else {
                return;
            };
            let frames = out_buf.length() as usize;
            if left_buf.len() != frames {
                left_buf.resize(frames, 0.0);
                right_buf.resize(frames, 0.0);
            }
            synth_ref.borrow_mut().render_stereo(&mut left_buf, &mut right_buf);
            let _ = out_buf.copy_to_channel(&left_buf, 0);
            let _ = out_buf.copy_to_channel(&right_buf, 1);
        }) as Box<dyn FnMut(AudioProcessingEvent)>);

        #[allow(deprecated)]
        proc_node.set_onaudioprocess(Some(cb.as_ref().unchecked_ref()));
        let _ = proc_node.connect_with_audio_node(&ctx.destination());
        let _ = ctx.resume();

        self.ctx = Some(ctx);
        self._proc = Some(proc_node);
        self._cb = Some(cb);
    }

    pub fn toggle_mute(&mut self) -> bool {
        self.muted = !self.muted;
        if let Some(ctx) = &self.ctx {
            if self.muted {
                let _ = ctx.suspend();
            } else {
                let _ = ctx.resume();
            }
        }
        !self.muted
    }

    pub fn speak_es(&self, text: &str, pitch: f32) {
        if !self.voice_enabled || self.muted || text.trim().is_empty() {
            return;
        }
        let Some(win) = web_sys::window() else { return; };
        let Ok(speech) = win.speech_synthesis() else { return; };
        if speech.speaking() {
            speech.cancel();
        }
        let Ok(utt) = web_sys::SpeechSynthesisUtterance::new_with_text(text) else {
            return;
        };
        utt.set_lang("es-ES");
        utt.set_pitch(pitch.clamp(0.7, 1.8));
        utt.set_rate(1.1);
        utt.set_volume(0.85);
        speech.speak(&utt);
    }
}
