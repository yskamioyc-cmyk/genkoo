// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_dialog::DialogExt; 
use std::fs::File;
use std::io::Write;
use base64::{Engine as _, engine::general_purpose};

// 💡 エラーの原因だった「save_novel」関数を定義します
#[tauri::command]
fn save_novel(text: String) -> Result<String, String> {
    println!("【Backend】小説が保存されました: {}文字", text.len());
    // 必要に応じて、ここにテキストファイルの書き込み処理などを記述します
    Ok("小説を自動保存しました".to_string())
}

// 💡 1. 保存先を選択するダイアログを表示するコマンド
#[tauri::command]
fn show_save_dialog(handle: tauri::AppHandle, default_name: String) -> Option<String> {
    let file_path = handle.dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("PDF Document", &["pdf"])
        .blocking_save_file(); // ダイアログが閉じるまで待機
        
    file_path.map(|path| path.to_string())
}

// 💡 2. フロントから届いたBase64形式のPDFバイナリを指定パスへ書き込むコマンド
#[tauri::command]
fn save_file_binary(path: String, base64_data: String) -> Result<(), String> {
    let bytes = general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| e.to_string())?;
        
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init()) // 💡 ダイアログプラグインの有効化
        .invoke_handler(tauri::generate_handler![
            save_novel,       // 💡 これでエラーにならなくなります
            show_save_dialog, 
            save_file_binary  
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}