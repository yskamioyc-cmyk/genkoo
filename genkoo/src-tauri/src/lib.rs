use std::fs;
use std::path::PathBuf;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// 💡 既存のsave_novelコマンド（引数や返り値の型はプロジェクトに合わせて適宜調整してください）
#[tauri::command]
fn save_novel(text: String) -> Result<String, String> {
    // 例として「novel.txt」に上書き保存するシンプルな実装例
    fs::write("novel.txt", text).map_err(|e| e.to_string())?;
    Ok("保存しました！".to_string())
}

// 💡 1. src-tauri内の.txtファイル名一覧を返すコマンド
#[tauri::command]
fn get_novel_list() -> Result<Vec<String>, String> {
    // カレントディレクトリ(src-tauri)を取得
    let mut txt_files = Vec::new();
    let paths = fs::read_dir(".").map_err(|e| e.to_string())?;

    for path in paths {
        if let Ok(entry) = path {
            let p = entry.path();
            // 拡張子が.txtのファイルだけをピックアップ
            if p.is_file() && p.extension().and_then(|s| s.to_str()) == Some("txt") {
                if let Some(file_name) = p.file_name().and_then(|s| s.to_str()) {
                    txt_files.push(file_name.to_string());
                }
            }
        }
    }
    Ok(txt_files)
}

// 💡 2. 選択されたファイルの中身を読み込むコマンド
#[tauri::command]
fn load_novel(filename: String) -> Result<String, String> {
    let path = PathBuf::from(&filename);
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(content)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            save_novel, 
            get_novel_list, 
            load_novel
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}