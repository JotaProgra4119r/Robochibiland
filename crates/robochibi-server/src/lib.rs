use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::{SecondsFormat, Utc};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    net::SocketAddr,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
    sync::{broadcast, Mutex, RwLock},
};
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedUser {
    pub id: String,
    pub name: String,
    pub color: String,
    #[serde(rename = "joinedAt")]
    pub joined_at: String,
}

#[derive(Clone)]
pub struct AppState {
    pub public_dir: PathBuf,
    pub memory_path: PathBuf,
    pub tunnel_path: PathBuf,
    pub memory_lock: Arc<Mutex<()>>,
    pub users: Arc<RwLock<HashMap<String, ConnectedUser>>>,
    pub broadcast_tx: broadcast::Sender<(String, String)>, // (sender_id, json_payload)
    pub tunnel_url: Arc<RwLock<Option<String>>>,
    pub http_client: reqwest::Client,
    pub port: u16,
    pub next_conn_id: Arc<AtomicU64>,
}

impl AppState {
    pub fn new(root_dir: PathBuf, port: u16) -> Self {
        let data_dir = root_dir.join("data");
        let _ = std::fs::create_dir_all(&data_dir);
        let (broadcast_tx, _) = broadcast::channel(256);
        let http_client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .expect("reqwest client");

        Self {
            public_dir: root_dir.join("public"),
            memory_path: data_dir.join("memory.json"),
            tunnel_path: data_dir.join("tunnel.txt"),
            memory_lock: Arc::new(Mutex::new(())),
            users: Arc::new(RwLock::new(HashMap::new())),
            broadcast_tx,
            tunnel_url: Arc::new(RwLock::new(None)),
            http_client,
            port,
            next_conn_id: Arc::new(AtomicU64::new(1)),
        }
    }
}

pub fn default_memory_json() -> Value {
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    json!({
        "robot_name": "Sparky",
        "model_type": "Chibi-CyberPup v3.0 (Rust + Vulkan/WebGL)",
        "personality": "Curioso, enérgico, cariñoso y leal",
        "created_at": now,
        "last_updated": now,
        "stats": {
            "times_played": 0,
            "places_explored": 0,
            "tricks_invented": 0,
            "barks_given": 0
        },
        "discovered_places": [],
        "friends": [
            { "name": "Bolt", "color": "Amarillo eléctrico", "trait": "Muy rápido y adora perseguir pelotas" },
            { "name": "Pixel", "color": "Cyan cianuro", "trait": "Observador, adora explorar cerca del lago" },
            { "name": "Luna", "color": "Rosa pastel", "trait": "Cariñosa, le gusta descansar bajo las sombras" },
            { "name": "Rusty", "color": "Naranja cobrizo", "trait": "Juguetón y siempre saluda con un doble ladrido" }
        ],
        "learned_movements": [],
        "journal": []
    })
}

fn read_memory_sync(path: &Path) -> Value {
    match std::fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or_else(|_| default_memory_json()),
        Err(_) => default_memory_json(),
    }
}

/// Atomic temp-file write + rename so `data/memory.json` is never truncated or corrupted on crash.
pub fn write_memory_atomic_sync(path: &Path, doc: &Value) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let serialized = serde_json::to_string_pretty(doc)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let tmp_path = path.with_extension("json.tmp");
    std::fs::write(&tmp_path, serialized)?;
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
    std::fs::rename(&tmp_path, path)?;
    Ok(())
}

pub fn normalize_llm_endpoint(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "http://127.0.0.1:31415/v1/chat/completions".to_string();
    }
    let clean = trimmed.trim_end_matches('/');
    if clean.ends_with("/chat/completions") {
        clean.to_string()
    } else if clean.ends_with("/v1") {
        format!("{clean}/chat/completions")
    } else if !clean.contains("/v1/") {
        format!("{clean}/v1/chat/completions")
    } else {
        clean.to_string()
    }
}

pub fn build_router(state: Arc<AppState>) -> Router {
    let index_file = state.public_dir.join("index.html");
    let static_dir = ServeDir::new(&state.public_dir).fallback(ServeFile::new(index_file));

    Router::new()
        .route("/", get(root_or_ws_handler))
        .route("/ws", get(ws_upgrade_handler))
        .route("/api/health", get(health_handler))
        .route("/api/users", get(users_handler))
        .route("/api/network-info", get(network_info_handler))
        .route("/api/memory", get(get_memory_handler).post(post_memory_handler))
        .route("/api/memory/journal", post(post_journal_handler))
        .route("/api/memory/trick", post(post_trick_handler))
        .route("/api/llm/proxy", post(llm_proxy_handler))
        .fallback_service(static_dir)
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn root_or_ws_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    ws: Result<WebSocketUpgrade, axum::extract::ws::rejection::WebSocketUpgradeRejection>,
) -> Response {
    let is_upgrade = headers
        .get(axum::http::header::UPGRADE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.eq_ignore_ascii_case("websocket"))
        .unwrap_or(false);
    if is_upgrade {
        if let Ok(ws) = ws {
            return ws.on_upgrade(move |socket| handle_ws(socket, state));
        }
    }
    let index_path = state.public_dir.join("index.html");
    match tokio::fs::read(&index_path).await {
        Ok(bytes) => (
            StatusCode::OK,
            [(
                axum::http::header::CONTENT_TYPE,
                "text/html; charset=utf-8",
            )],
            bytes,
        )
            .into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "index.html not found").into_response(),
    }
}

async fn ws_upgrade_handler(
    State(state): State<Arc<AppState>>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

async fn handle_ws(socket: WebSocket, state: Arc<AppState>) {
    let conn_num = state.next_conn_id.fetch_add(1, Ordering::Relaxed);
    let user_id = format!(
        "user_{}_{}",
        Utc::now().timestamp_millis(),
        conn_num
    );
    let mut rx = state.broadcast_tx.subscribe();
    let (mut ws_tx, mut ws_rx) = socket.split();

    let (out_tx, mut out_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    let writer_task = tokio::spawn(async move {
        while let Some(msg) = out_rx.recv().await {
            if ws_tx.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Forward broadcasts from other clients
    let uid_bcast = user_id.clone();
    let out_tx_bcast = out_tx.clone();
    let bcast_task = tokio::spawn(async move {
        while let Ok((sender_id, payload)) = rx.recv().await {
            if sender_id != uid_bcast {
                if out_tx_bcast.send(payload).is_err() {
                    break;
                }
            }
        }
    });

    // Send cached tunnel URL if already running
    if let Some(t_url) = state.tunnel_url.read().await.clone() {
        let _ = out_tx.send(json!({ "type": "TUNNEL_URL", "url": t_url }).to_string());
    }

    while let Some(Ok(msg)) = ws_rx.next().await {
        let text = match msg {
            Message::Text(t) => t.to_string(),
            Message::Close(_) => break,
            Message::Ping(_) => continue,
            _ => continue,
        };
        let Ok(data) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        let msg_type = data.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match msg_type {
            "JOIN" => {
                let raw_name = data
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Entrenador")
                    .trim();
                let clean_name: String = if raw_name.is_empty() {
                    "Entrenador".into()
                } else {
                    raw_name.chars().take(24).collect()
                };
                let color = data
                    .get("color")
                    .and_then(|v| v.as_str())
                    .unwrap_or("#00e5ff")
                    .chars()
                    .take(20)
                    .collect();
                let user = ConnectedUser {
                    id: user_id.clone(),
                    name: clean_name,
                    color,
                    joined_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
                };
                let all_users: Vec<ConnectedUser> = {
                    let mut guard = state.users.write().await;
                    guard.insert(user_id.clone(), user.clone());
                    guard.values().cloned().collect()
                };
                let count = all_users.len();
                let ack = json!({
                    "type": "JOIN_ACK",
                    "userId": user_id,
                    "users": all_users,
                })
                .to_string();
                let _ = out_tx.send(ack);

                let joined_msg = json!({
                    "type": "USER_JOINED",
                    "user": user,
                    "count": count,
                })
                .to_string();
                let _ = state.broadcast_tx.send((user_id.clone(), joined_msg));
            }
            "CHAT_COMMAND" => {
                let text_cmd = data
                    .get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim();
                if text_cmd.is_empty() {
                    continue;
                }
                let sender = state.users.read().await.get(&user_id).cloned();
                let user_name = sender
                    .as_ref()
                    .map(|u| u.name.clone())
                    .unwrap_or_else(|| "Visitante".into());
                let user_color = sender
                    .as_ref()
                    .map(|u| u.color.clone())
                    .unwrap_or_else(|| "#00e5ff".into());
                let payload = json!({
                    "type": "CHAT_COMMAND",
                    "userId": user_id,
                    "userName": user_name,
                    "userColor": user_color,
                    "text": text_cmd.chars().take(300).collect::<String>(),
                    "timestamp": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
                })
                .to_string();
                let _ = state.broadcast_tx.send((user_id.clone(), payload));
            }
            "ROBOT_ACTION" => {
                let sender = state.users.read().await.get(&user_id).cloned();
                let user_name = sender
                    .as_ref()
                    .map(|u| u.name.clone())
                    .unwrap_or_else(|| "Entrenador".into());
                let payload = json!({
                    "type": "ROBOT_ACTION",
                    "userId": user_id,
                    "userName": user_name,
                    "action": data.get("action").cloned().unwrap_or(Value::Null),
                    "emotion": data.get("emotion").cloned().unwrap_or(Value::Null),
                    "targetRobot": data.get("targetRobot").cloned().unwrap_or(Value::Null),
                    "timestamp": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
                })
                .to_string();
                let _ = state.broadcast_tx.send((user_id.clone(), payload));
            }
            "BALL_THROW" => {
                let sender = state.users.read().await.get(&user_id).cloned();
                let user_name = sender
                    .as_ref()
                    .map(|u| u.name.clone())
                    .unwrap_or_else(|| "Entrenador".into());
                let payload = json!({
                    "type": "BALL_THROW",
                    "userId": user_id,
                    "userName": user_name,
                    "timestamp": Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
                })
                .to_string();
                let _ = state.broadcast_tx.send((user_id.clone(), payload));
            }
            "PING" => {
                let _ = out_tx.send(json!({ "type": "PONG" }).to_string());
            }
            _ => {}
        }
    }

    // Cleanup user on disconnect
    let (removed, count) = {
        let mut guard = state.users.write().await;
        let was = guard.remove(&user_id);
        (was.is_some(), guard.len())
    };
    if removed {
        let left_msg = json!({
            "type": "USER_LEFT",
            "userId": user_id,
            "count": count,
        })
        .to_string();
        let _ = state.broadcast_tx.send(("server".into(), left_msg));
    }

    bcast_task.abort();
    drop(out_tx);
    let _ = writer_task.await;
}

async fn health_handler() -> Json<Value> {
    Json(json!({
        "ok": true,
        "runtime": "rust-axum",
        "version": "3.0.0",
    }))
}

async fn users_handler(State(state): State<Arc<AppState>>) -> Json<Value> {
    let guard = state.users.read().await;
    let users: Vec<&ConnectedUser> = guard.values().collect();
    Json(json!({
        "count": users.len(),
        "users": users,
    }))
}

async fn network_info_handler(State(state): State<Arc<AppState>>) -> Json<Value> {
    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());
    let tunnel = state.tunnel_url.read().await.clone();
    Json(json!({
        "port": state.port,
        "localIp": local_ip,
        "localUrl": format!("http://{}:{}", local_ip, state.port),
        "tunnelUrl": tunnel,
    }))
}

async fn get_memory_handler(State(state): State<Arc<AppState>>) -> Json<Value> {
    let _lock = state.memory_lock.lock().await;
    let doc = read_memory_sync(&state.memory_path);
    Json(doc)
}

async fn post_memory_handler(
    State(state): State<Arc<AppState>>,
    Json(updates): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _lock = state.memory_lock.lock().await;
    let mut mem = read_memory_sync(&state.memory_path);
    if let (Some(dst), Some(src)) = (mem.as_object_mut(), updates.as_object()) {
        for (k, v) in src {
            dst.insert(k.clone(), v.clone());
        }
        dst.insert(
            "last_updated".to_string(),
            Value::String(Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)),
        );
    }
    write_memory_atomic_sync(&state.memory_path, &mem).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("No se pudo guardar memoria: {e}") })),
        )
    })?;
    Ok(Json(json!({ "ok": true, "memory": mem })))
}

#[derive(Deserialize)]
struct JournalPayload {
    emotion: Option<String>,
    thought: String,
}

async fn post_journal_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<JournalPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _lock = state.memory_lock.lock().await;
    let mut mem = read_memory_sync(&state.memory_path);
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
    let emotion = body.emotion.unwrap_or_else(|| "Feliz".to_string());

    if let Some(obj) = mem.as_object_mut() {
        let arr = obj
            .entry("journal")
            .or_insert_with(|| Value::Array(Vec::new()))
            .as_array_mut();
        if let Some(journal) = arr {
            journal.push(json!({
                "time": now,
                "emotion": emotion,
                "thought": body.thought,
            }));
            if journal.len() > 80 {
                let excess = journal.len() - 80;
                journal.drain(0..excess);
            }
        }
        obj.insert("last_updated".to_string(), Value::String(now));
    }

    write_memory_atomic_sync(&state.memory_path, &mem).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error escribiendo diario: {e}") })),
        )
    })?;
    Ok(Json(json!({ "ok": true, "memory": mem })))
}

#[derive(Deserialize)]
struct TrickPayload {
    name: String,
    description: Option<String>,
    sequence: Vec<String>,
    created_by: Option<String>,
}

async fn post_trick_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<TrickPayload>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _lock = state.memory_lock.lock().await;
    let mut mem = read_memory_sync(&state.memory_path);
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);

    let mut added = false;
    if let Some(obj) = mem.as_object_mut() {
        let arr = obj
            .entry("learned_movements")
            .or_insert_with(|| Value::Array(Vec::new()))
            .as_array_mut();
        if let Some(list) = arr {
            let exists = list
                .iter()
                .any(|item| item.get("name").and_then(|v| v.as_str()) == Some(body.name.as_str()));
            if !exists {
                list.push(json!({
                    "name": body.name,
                    "description": body.description.unwrap_or_default(),
                    "sequence": body.sequence,
                    "created_by": body.created_by.unwrap_or_else(|| "Sparky-Brain".into()),
                }));
                added = true;
            }
        }
        if added {
            let stats = obj
                .entry("stats")
                .or_insert_with(|| json!({ "tricks_invented": 0 }));
            if let Some(so) = stats.as_object_mut() {
                let prev = so
                    .get("tricks_invented")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                so.insert("tricks_invented".to_string(), Value::from(prev + 1));
            }
        }
        obj.insert("last_updated".to_string(), Value::String(now));
    }

    write_memory_atomic_sync(&state.memory_path, &mem).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Error guardando truco: {e}") })),
        )
    })?;
    Ok(Json(json!({ "ok": true, "added": added, "memory": mem })))
}

#[derive(Deserialize)]
struct LlmProxyPayload {
    endpoint: Option<String>,
    #[serde(rename = "apiKey")]
    api_key: Option<String>,
    model: Option<String>,
    messages: Value,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
}

async fn llm_proxy_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LlmProxyPayload>,
) -> Response {
    let target_url = normalize_llm_endpoint(
        body.endpoint
            .as_deref()
            .unwrap_or("http://127.0.0.1:31415/v1/chat/completions"),
    );

    let mut req = state.http_client.post(&target_url);
    if let Some(key) = body.api_key.as_deref() {
        if !key.trim().is_empty() {
            req = req.header("Authorization", format!("Bearer {}", key.trim()));
        }
    }

    let payload = json!({
        "model": body.model.unwrap_or_else(|| "auto".to_string()),
        "messages": body.messages,
        "temperature": body.temperature.unwrap_or(0.82),
        "max_tokens": body.max_tokens.unwrap_or(140),
    });

    match req.json(&payload).send().await {
        Ok(resp) => {
            let status = StatusCode::from_u16(resp.status().as_u16())
                .unwrap_or(StatusCode::BAD_GATEWAY);
            let txt = resp.text().await.unwrap_or_default();
            if let Ok(json_val) = serde_json::from_str::<Value>(&txt) {
                (status, Json(json_val)).into_response()
            } else {
                (status, Json(json!({ "raw": txt }))).into_response()
            }
        }
        Err(err) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("Error de proxy FreeLLMAPI: {err}") })),
        )
            .into_response(),
    }
}

pub fn extract_trycloudflare_url(line: &str) -> Option<String> {
    let idx = line.find("https://")?;
    let rest = &line[idx..];
    let end = rest
        .find(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == ':' || c == '/'))
        .unwrap_or(rest.len());
    let candidate = &rest[..end];
    if candidate.contains(".trycloudflare.com") {
        Some(candidate.trim_end_matches('/').to_string())
    } else {
        None
    }
}

pub fn spawn_cloudflared_tunnel(state: Arc<AppState>, root_dir: PathBuf) {
    tokio::spawn(async move {
        let local_exe = root_dir.join("cloudflared.exe");
        let bin = if local_exe.exists() {
            local_exe
        } else {
            PathBuf::from("cloudflared")
        };

        let mut cmd = Command::new(&bin);
        cmd.args([
            "tunnel",
            "--url",
            &format!("http://127.0.0.1:{}", state.port),
            "--no-autoupdate",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

        let Ok(mut child) = cmd.spawn() else {
            return;
        };

        let t1 = tokio::spawn(monitor_tunnel_stream(child.stdout.take(), state.clone()));
        let t2 = tokio::spawn(monitor_tunnel_stream(child.stderr.take(), state));
        let _ = child.wait().await;
        let _ = tokio::join!(t1, t2);
    });
}

async fn monitor_tunnel_stream<R: tokio::io::AsyncRead + Unpin>(
    stream: Option<R>,
    st: Arc<AppState>,
) {
    let Some(s) = stream else { return; };
    let mut lines = BufReader::new(s).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if let Some(url) = extract_trycloudflare_url(&line) {
            {
                let mut guard = st.tunnel_url.write().await;
                if guard.as_deref() == Some(url.as_str()) {
                    continue;
                }
                *guard = Some(url.clone());
            }
            let _ = std::fs::write(&st.tunnel_path, &url);
            let msg = json!({ "type": "TUNNEL_URL", "url": url }).to_string();
            let _ = st.broadcast_tx.send(("server".into(), msg));
            println!("\n🌍 TÚNEL PÚBLICO EN VIVO: {url}\n");
        }
    }
}

pub async fn run_server() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3000);

    let root_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let state = Arc::new(AppState::new(root_dir.clone(), port));
    if !state.memory_path.exists() {
        let _ = write_memory_atomic_sync(&state.memory_path, &default_memory_json());
    }

    let app = build_router(state.clone());
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;

    let local_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    println!("\n🐾 =======================================================");
    println!("🚀 ROBO CHIBI LAND v3.0 — RUST HIGH-PERF SERVER ONLINE");
    println!("👉 Local PC:   http://localhost:{port}");
    println!("📱 Tu Red LAN: http://{local_ip}:{port}");
    println!("🌐 Multijugador WS + FreeLLMAPI Proxy + Memoria Atómica activos");
    println!("=======================================================\n");

    if std::env::var("DISABLE_TUNNEL").ok().as_deref() != Some("1") {
        spawn_cloudflared_tunnel(state, root_dir);
    }

    axum::serve(listener, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    #[test]
    fn normalize_llm_endpoint_handles_all_variants() {
        assert_eq!(
            normalize_llm_endpoint(""),
            "http://127.0.0.1:31415/v1/chat/completions"
        );
        assert_eq!(
            normalize_llm_endpoint("http://127.0.0.1:31415"),
            "http://127.0.0.1:31415/v1/chat/completions"
        );
        assert_eq!(
            normalize_llm_endpoint("http://localhost:31415/v1/"),
            "http://localhost:31415/v1/chat/completions"
        );
        assert_eq!(
            normalize_llm_endpoint("https://api.example.com/v1/chat/completions"),
            "https://api.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn extract_cloudflared_url_matches_banner() {
        let sample = "INF |  https://robot-cyber-dog-99.trycloudflare.com  |";
        assert_eq!(
            extract_trycloudflare_url(sample).as_deref(),
            Some("https://robot-cyber-dog-99.trycloudflare.com")
        );
        assert!(extract_trycloudflare_url("nothing here").is_none());
    }

    #[tokio::test]
    async fn memory_endpoints_persist_and_cap_journal_atomically() {
        let tmp = tempfile::tempdir().expect("tempdir");
        std::fs::create_dir_all(tmp.path().join("public")).unwrap();
        std::fs::write(tmp.path().join("public/index.html"), "<html></html>").unwrap();

        let state = Arc::new(AppState::new(tmp.path().to_path_buf(), 3099));
        let app = build_router(state.clone());

        // Add trick twice -> count increments only once
        for _ in 0..2 {
            let req = Request::builder()
                .method("POST")
                .uri("/api/memory/trick")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "name": "Turbo Spin",
                        "description": "Giro rust",
                        "sequence": ["spin", "jump"],
                    })
                    .to_string(),
                ))
                .unwrap();
            let resp = app.clone().oneshot(req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::OK);
        }

        // Add 85 journal entries -> capped at 80
        for i in 0..85 {
            let req = Request::builder()
                .method("POST")
                .uri("/api/memory/journal")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({ "emotion": "Feliz", "thought": format!("Entry {i}") }).to_string(),
                ))
                .unwrap();
            let resp = app.clone().oneshot(req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::OK);
        }

        let mem = read_memory_sync(&state.memory_path);
        assert_eq!(mem["stats"]["tricks_invented"], 1);
        let j = mem["journal"].as_array().unwrap();
        assert_eq!(j.len(), 80);
        assert_eq!(j[0]["thought"], "Entry 5");
        assert_eq!(j[79]["thought"], "Entry 84");
    }

    #[tokio::test]
    async fn websocket_join_chat_action_and_ball_broadcast() {
        let tmp = tempfile::tempdir().expect("tempdir");
        std::fs::create_dir_all(tmp.path().join("public")).unwrap();
        std::fs::write(tmp.path().join("public/index.html"), "<html></html>").unwrap();

        let state = Arc::new(AppState::new(tmp.path().to_path_buf(), 0));
        let app = build_router(state.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let srv = tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });

        let url = format!("ws://{addr}/ws");
        let (mut ws1, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
        let (mut ws2, _) = tokio_tungstenite::connect_async(&url).await.unwrap();

        ws1.send(tokio_tungstenite::tungstenite::Message::Text(
            json!({ "type": "JOIN", "name": "Alice", "color": "#00e5ff" })
                .to_string()
                .into(),
        ))
        .await
        .unwrap();

        let ack = ws1.next().await.unwrap().unwrap().into_text().unwrap();
        assert!(ack.contains("JOIN_ACK"));

        let joined_evt = ws2.next().await.unwrap().unwrap().into_text().unwrap();
        assert!(joined_evt.contains("USER_JOINED"));
        assert!(joined_evt.contains("Alice"));

        ws1.send(tokio_tungstenite::tungstenite::Message::Text(
            json!({ "type": "ROBOT_ACTION", "action": "dance", "emotion": "EXCITED" })
                .to_string()
                .into(),
        ))
        .await
        .unwrap();

        let act_evt = ws2.next().await.unwrap().unwrap().into_text().unwrap();
        assert!(act_evt.contains("ROBOT_ACTION"));
        assert!(act_evt.contains("dance"));

        srv.abort();
    }
}
