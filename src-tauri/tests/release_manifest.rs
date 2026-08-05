// Guards the shape of the published release manifest against the ACTUAL type the
// updater plugin deserializes into.
//
// A single platform entry missing `signature` makes serde reject the whole file
// — including the Windows entry — and every desktop install then reports
// "обновления недоступны". That shipped once (1.6.0); this test is why it will
// not ship again.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[test]
fn published_manifest_parses() {
    let raw = include_str!("fixtures/latest.json");
    let parsed: Result<tauri_plugin_updater::RemoteRelease, _> = serde_json::from_str(raw);
    assert!(
        parsed.is_ok(),
        "плагин обновлений не смог разобрать latest.json: {:?}",
        parsed.err()
    );
}
