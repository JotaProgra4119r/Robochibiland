#[tokio::main]
async fn main() {
    if let Err(err) = robochibi_server::run_server().await {
        eprintln!("❌ Error fatal en servidor RoboChibiLand: {err}");
        std::process::exit(1);
    }
}
