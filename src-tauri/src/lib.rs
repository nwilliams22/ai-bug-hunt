/// The desktop shell is deliberately empty of logic.
///
/// Everything the course does — routing, scoring, the timed session, progress —
/// runs in the same bundled `dist/` that the self-hosted page serves, so the two
/// builds can never drift. Nothing here reaches the filesystem or the network;
/// progress lives in the webview's local storage exactly as it does in a browser.
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Bug Finder");
}
