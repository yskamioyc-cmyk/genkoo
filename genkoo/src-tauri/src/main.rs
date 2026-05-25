use std::fs::File;
use std::io::Write;

// 💡 フロントエンドから呼び出せる保存コマンドを定義
#[tauri::command]
fn save_novel(text: String) -> Result<String, String> {
    // 今回はシンプルに、アプリ実行場所に「novel.txt」として保存
    // 将来的にはパスを選択させたり、タイトル名で保存できるように拡張できます
    let mut file = File::create("novel.txt").map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    
    Ok("ファイルが正常に保存されました。".to_string())
}

fn main() {
    tauri::Builder::default()
        // 💡 登録したコマンドをTauriに認識させる
        .invoke_handler(tauri::generate_handler![save_novel])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}