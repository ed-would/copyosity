//! CLI helper: `cargo run --bin seed-demo` (from `src-tauri/`).
//! Writes demo entries into the user's Copyosity app-data database.

use copyosity_lib::db::Database;
use copyosity_lib::demo_seed;
use std::path::PathBuf;

fn app_data_dir() -> PathBuf {
    let home = std::env::var("HOME").expect("HOME environment variable");
    PathBuf::from(home).join("Library/Application Support/com.vkovalskii.copyosity")
}

fn main() {
    let dir = app_data_dir();
    std::fs::create_dir_all(&dir).expect("create app data dir");
    let db = Database::new(dir).expect("open database");
    let report = demo_seed::seed(&db).expect("seed demo entries");
    eprintln!(
        "Demo seed complete: removed {}, inserted {} entries.",
        report.removed, report.inserted
    );
}
