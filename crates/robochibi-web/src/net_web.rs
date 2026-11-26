use js_sys::JSON;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    Headers, MessageEvent, Request, RequestInit, RequestMode, Response, WebSocket, Window,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineUser {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone)]
pub enum IncomingNetEvent {
    WsConnected,
    JoinAck {
        user_id: String,
        users: Vec<OnlineUser>,
    },
    UserJoined {
        user: OnlineUser,
        count: usize,
    },
    UserLeft {
        user_id: String,
        count: usize,
    },
    ChatCommand {
        user_name: String,
        user_color: String,
        text: String,
    },
    RobotAction {
        user_name: String,
        action: Option<String>,
        emotion: Option<String>,
        target_robot: Option<String>,
    },
    BallThrow {
        user_name: String,
    },
    TunnelUrl(String),
    MemoryLoaded(Value),
    NetworkInfo {
        local_url: String,
        tunnel_url: Option<String>,
    },
    LlmReply {
        raw_content: String,
        model: String,
        ping_ms: u32,
        user_cmd: Option<String>,
    },
    LlmError {
        err_msg: String,
        user_cmd: Option<String>,
    },
    LlmPingResult {
        ok: bool,
        ms: u32,
        detail: String,
    },
}

pub struct NetBridge {
    pub ws: Option<WebSocket>,
    pub user_id: Option<String>,
    pub user_name: String,
    pub user_avatar: String,
    pub user_color: String,
    pub online_users: Vec<OnlineUser>,
    pub events: Rc<RefCell<Vec<IncomingNetEvent>>>,
    _on_open: Option<Closure<dyn FnMut()>>,
    _on_msg: Option<Closure<dyn FnMut(MessageEvent)>>,
    _on_close: Option<Closure<dyn FnMut()>>,
}

impl NetBridge {
    pub fn new(user_name: String, user_avatar: String) -> Self {
        Self {
            ws: None,
            user_id: None,
            user_name,
            user_avatar,
            user_color: "#00e5ff".to_string(),
            online_users: Vec::new(),
            events: Rc::new(RefCell::new(Vec::new())),
            _on_open: None,
            _on_msg: None,
            _on_close: None,
        }
    }

    pub fn connect_ws(&mut self, win: &Window) {
        let loc = win.location();
        let proto = loc.protocol().unwrap_or_else(|_| "http:".into());
        let host = loc.host().unwrap_or_else(|_| "localhost:3000".into());
        let ws_proto = if proto == "https:" { "wss:" } else { "ws:" };
        let url = format!("{ws_proto}//{host}/ws");

        let Ok(ws) = WebSocket::new(&url) else {
            return;
        };

        let events_open = self.events.clone();
        let ws_clone_open = ws.clone();
        let u_name = format!("{} {}", self.user_avatar, self.user_name);
        let u_col = self.user_color.clone();
        let on_open = Closure::wrap(Box::new(move || {
            let join = json!({
                "type": "JOIN",
                "name": u_name,
                "color": u_col,
            })
            .to_string();
            let _ = ws_clone_open.send_with_str(&join);
            events_open.borrow_mut().push(IncomingNetEvent::WsConnected);
        }) as Box<dyn FnMut()>);
        ws.set_onopen(Some(on_open.as_ref().unchecked_ref()));

        let events_msg = self.events.clone();
        let on_msg = Closure::wrap(Box::new(move |ev: MessageEvent| {
            let Some(txt) = ev.data().as_string() else {
                return;
            };
            let Ok(v) = serde_json::from_str::<Value>(&txt) else {
                return;
            };
            let t = v.get("type").and_then(|x| x.as_str()).unwrap_or("");
            match t {
                "JOIN_ACK" => {
                    let uid = v
                        .get("userId")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                    let users: Vec<OnlineUser> = v
                        .get("users")
                        .cloned()
                        .and_then(|u| serde_json::from_value(u).ok())
                        .unwrap_or_default();
                    events_msg
                        .borrow_mut()
                        .push(IncomingNetEvent::JoinAck { user_id: uid, users });
                }
                "USER_JOINED" => {
                    if let Some(u) = v
                        .get("user")
                        .cloned()
                        .and_then(|val| serde_json::from_value::<OnlineUser>(val).ok())
                    {
                        let count = v.get("count").and_then(|x| x.as_u64()).unwrap_or(1) as usize;
                        events_msg
                            .borrow_mut()
                            .push(IncomingNetEvent::UserJoined { user: u, count });
                    }
                }
                "USER_LEFT" => {
                    let uid = v
                        .get("userId")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                    let count = v.get("count").and_then(|x| x.as_u64()).unwrap_or(1) as usize;
                    events_msg
                        .borrow_mut()
                        .push(IncomingNetEvent::UserLeft { user_id: uid, count });
                }
                "CHAT_COMMAND" => {
                    let user_name = v
                        .get("userName")
                        .and_then(|x| x.as_str())
                        .unwrap_or("Visitante")
                        .to_string();
                    let user_color = v
                        .get("userColor")
                        .and_then(|x| x.as_str())
                        .unwrap_or("#00e5ff")
                        .to_string();
                    let text = v
                        .get("text")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                    events_msg.borrow_mut().push(IncomingNetEvent::ChatCommand {
                        user_name,
                        user_color,
                        text,
                    });
                }
                "ROBOT_ACTION" => {
                    let user_name = v
                        .get("userName")
                        .and_then(|x| x.as_str())
                        .unwrap_or("Entrenador")
                        .to_string();
                    let action = v.get("action").and_then(|x| x.as_str()).map(String::from);
                    let emotion = v.get("emotion").and_then(|x| x.as_str()).map(String::from);
                    let target_robot = v
                        .get("targetRobot")
                        .and_then(|x| x.as_str())
                        .map(String::from);
                    events_msg.borrow_mut().push(IncomingNetEvent::RobotAction {
                        user_name,
                        action,
                        emotion,
                        target_robot,
                    });
                }
                "BALL_THROW" => {
                    let user_name = v
                        .get("userName")
                        .and_then(|x| x.as_str())
                        .unwrap_or("Entrenador")
                        .to_string();
                    events_msg
                        .borrow_mut()
                        .push(IncomingNetEvent::BallThrow { user_name });
                }
                "TUNNEL_URL" => {
                    if let Some(u) = v.get("url").and_then(|x| x.as_str()) {
                        events_msg
                            .borrow_mut()
                            .push(IncomingNetEvent::TunnelUrl(u.to_string()));
                    }
                }
                _ => {}
            }
        }) as Box<dyn FnMut(MessageEvent)>);
        ws.set_onmessage(Some(on_msg.as_ref().unchecked_ref()));

        let on_close = Closure::wrap(Box::new(move || {}) as Box<dyn FnMut()>);
        ws.set_onclose(Some(on_close.as_ref().unchecked_ref()));

        self.ws = Some(ws);
        self._on_open = Some(on_open);
        self._on_msg = Some(on_msg);
        self._on_close = Some(on_close);
    }

    pub fn send_join_update(&self) {
        if let Some(ws) = &self.ws {
            if ws.ready_state() == WebSocket::OPEN {
                let msg = json!({
                    "type": "JOIN",
                    "name": format!("{} {}", self.user_avatar, self.user_name),
                    "color": self.user_color,
                })
                .to_string();
                let _ = ws.send_with_str(&msg);
            }
        }
    }

    pub fn send_chat(&self, text: &str) {
        if let Some(ws) = &self.ws {
            if ws.ready_state() == WebSocket::OPEN {
                let msg = json!({ "type": "CHAT_COMMAND", "text": text }).to_string();
                let _ = ws.send_with_str(&msg);
            }
        }
    }

    pub fn send_robot_action(&self, action: Option<&str>, emotion: Option<&str>, target_robot: Option<&str>) {
        if let Some(ws) = &self.ws {
            if ws.ready_state() == WebSocket::OPEN {
                let msg = json!({
                    "type": "ROBOT_ACTION",
                    "action": action,
                    "emotion": emotion,
                    "targetRobot": target_robot,
                })
                .to_string();
                let _ = ws.send_with_str(&msg);
            }
        }
    }

    pub fn send_ball_throw(&self) {
        if let Some(ws) = &self.ws {
            if ws.ready_state() == WebSocket::OPEN {
                let msg = json!({ "type": "BALL_THROW" }).to_string();
                let _ = ws.send_with_str(&msg);
            }
        }
    }
}

pub async fn fetch_json_get(url: &str) -> Result<Value, String> {
    let win = web_sys::window().ok_or("no window")?;
    let opts = RequestInit::new();
    opts.set_method("GET");
    opts.set_mode(RequestMode::SameOrigin);
    let req = Request::new_with_str_and_init(url, &opts).map_err(|e| format!("{e:?}"))?;
    let resp_val = JsFuture::from(win.fetch_with_request(&req))
        .await
        .map_err(|e| format!("{e:?}"))?;
    let resp: Response = resp_val.dyn_into().map_err(|_| "not response")?;
    if !resp.ok() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let json_val = JsFuture::from(resp.json().map_err(|e| format!("{e:?}"))?)
        .await
        .map_err(|e| format!("{e:?}"))?;
    let txt = JSON::stringify(&json_val)
        .map_err(|e| format!("{e:?}"))?
        .as_string()
        .unwrap_or_default();
    serde_json::from_str(&txt).map_err(|e| e.to_string())
}

pub async fn fetch_json_post(url: &str, body: &Value) -> Result<(u16, Value), String> {
    let win = web_sys::window().ok_or("no window")?;
    let opts = RequestInit::new();
    opts.set_method("POST");
    opts.set_mode(RequestMode::SameOrigin);
    let headers = Headers::new().map_err(|e| format!("{e:?}"))?;
    headers
        .set("Content-Type", "application/json")
        .map_err(|e| format!("{e:?}"))?;
    opts.set_headers(&headers);
    opts.set_body(&JsValue::from_str(&body.to_string()));

    let req = Request::new_with_str_and_init(url, &opts).map_err(|e| format!("{e:?}"))?;
    let resp_val = JsFuture::from(win.fetch_with_request(&req))
        .await
        .map_err(|e| format!("{e:?}"))?;
    let resp: Response = resp_val.dyn_into().map_err(|_| "not response")?;
    let status = resp.status();
    let txt_val = JsFuture::from(resp.text().map_err(|e| format!("{e:?}"))?)
        .await
        .map_err(|e| format!("{e:?}"))?;
    let txt = txt_val.as_string().unwrap_or_default();
    let parsed = serde_json::from_str::<Value>(&txt).unwrap_or_else(|_| json!({ "raw": txt }));
    Ok((status, parsed))
}

pub fn fire_and_forget_post(url: String, body: Value) {
    wasm_bindgen_futures::spawn_local(async move {
        let _ = fetch_json_post(&url, &body).await;
    });
}
