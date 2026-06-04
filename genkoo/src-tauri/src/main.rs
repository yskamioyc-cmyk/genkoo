// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_dialog::DialogExt; 
use std::fs;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use base64::{Engine as _, engine::general_purpose};

// 💡 確実にファイルを読み書きするための「共通の保存ディレクトリ」を計算する関数
fn get_save_directory() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

// 💡 小説を自動保存するコマンド
#[tauri::command]
fn save_novel(filename: String, text: String) -> Result<String, String> {
    let mut save_path = get_save_directory();

    // ⚠️ 注意：この save_novel は現在固定名になっていますが、
    // エディタ画面側も将来的に選択したファイル名で保存できるようにするため、
    // 今回はダッシュボード側のリネーム・新規作成の基盤をまず作ります。
    let mut clean_name = filename.clone();
    if !clean_name.ends_with(".txt") {
        clean_name.push_str(".txt");
    }

    save_path.push(&clean_name);
    println!("【Backend】小説を保存します: {:?}", save_path);
    
    fs::write(&save_path, text)
        .map_err(|e| format!("ファイルの書き込みに失敗しました: {}", e))?;
        
    Ok(format!("「{}」を自動保存しました", clean_name))
}

// 💡 ファイル一覧を取得するコマンド
#[tauri::command]
fn get_novel_list() -> Result<Vec<String>, String> {
    let target_dir = get_save_directory();
    let mut file_list = Vec::new();

    if let Ok(entries) = fs::read_dir(target_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("txt") {
                if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
                    file_list.push(filename.to_string());
                }
            }
        }
    }
    Ok(file_list)
}

// ✨【新設】指定されたファイル名から小説データを読み込むコマンド
#[tauri::command(rename_all = "snake_case")]
fn read_novel(filename: String) -> Result<String, String> {
    let mut file_path = get_save_directory();

    // 拡張子 .txt の自動補正
    let mut clean_name = filename.clone();
    if !clean_name.ends_with(".txt") {
        clean_name.push_str(".txt");
    }

    file_path.push(&clean_name);
    println!("【Backend】ファイルを読み込みます: {:?}", file_path);

    // ファイルが存在すれば読み込み、なければ初期テキスト用に空文字を返すかエラーにする
    if file_path.exists() {
        fs::read_to_string(file_path)
            .map_err(|e| format!("ファイルの読み込みに失敗しました: {}", e))
    } else {
        // まだ中身がない場合は空文字を返す（安全設計）
        Ok("".to_string())
    }
}

// ✨【新設】ファイル名を変更（リネーム）するコマンド
#[tauri::command(rename_all = "snake_case")]
fn rename_novel(old_name: String, new_name: String) -> Result<(), String> {
    let base_dir = get_save_directory();
    let old_path = base_dir.join(&old_name);
    
    // 入力された新しい名前に「.txt」がついていなければ自動付与
    let mut clean_new_name = new_name.clone();
    if !clean_new_name.ends_with(".txt") {
        clean_new_name.push_str(".txt");
    }
    let new_path = base_dir.join(&clean_new_name);

    println!("【Backend】ファイル名を変更します: {:?} -> {:?}", old_path, new_path);

    fs::rename(old_path, new_path)
        .map_err(|e| format!("ファイル名の変更に失敗しました: {}", e))?;
    Ok(())
}

// ✨【新設】指定されたファイル名の小説データを削除するコマンド
#[tauri::command(rename_all = "snake_case")]
fn delete_novel(filename: String) -> Result<(), String> {
    let mut file_path = get_save_directory();
    file_path.push(&filename);

    println!("【Backend】ファイルを削除します: {:?}", file_path);

    if file_path.exists() {
        fs::remove_file(file_path)
            .map_err(|e| format!("ファイルの削除に失敗しました: {}", e))?;
        Ok(())
    } else {
        Err("削除対象のファイルが見つかりません。".to_string())
    }
}

// ✨【新設】指定された名前で新しく白紙のテキストファイルを作成するコマンド
#[tauri::command]
fn create_new_novel(filename: String) -> Result<String, String> {
    let base_dir = get_save_directory();
    
    let mut clean_name = filename.clone();
    if !clean_name.ends_with(".txt") {
        clean_name.push_str(".txt");
    }
    let file_path = base_dir.join(&clean_name);

    println!("【Backend】新規ファイルを作成します: {:?}", file_path);

    // すでに同名ファイルがある場合は上書きせずエラーにする安全設計
    if file_path.exists() {
        return Err("既に同じ名前のファイルが存在します。".to_string());
    }

    // 空のテキストファイルを作成
    fs::write(&file_path, "")
        .map_err(|e| format!("新規ファイルの作成に失敗しました: {}", e))?;

    Ok(clean_name)
}

// 💡 保存先を選択するダイアログを表示するコマンド
#[tauri::command]
fn show_save_dialog(handle: tauri::AppHandle, default_name: String) -> Option<String> {
    let file_path = handle.dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("PDF Document", &["pdf"])
        .blocking_save_file();
        
    file_path.map(|path| path.to_string())
}

// 💡 フロントから届いたBase64形式のPDFバイナリを指定パスへ書き込むコマンド
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
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            save_novel,
            get_novel_list,
            create_new_novel,
            rename_novel,      // ✨ 追加 // 追加
            delete_novel,
            read_novel,   // ✨ 追加
            show_save_dialog,
            save_file_binary
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}