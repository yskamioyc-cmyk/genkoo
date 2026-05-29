import React, { useEffect, useState } from 'react';
// 💡 Tauriバックエンドを呼び出すためのインポート
import { invoke } from '@tauri-apps/api/core';

// 💡 型定義を拡張：新規作成だけでなく、既存ファイル選択時にも対応できるように filename を渡せるようにします
interface DashboardProps {
  onNavigate: (filename: string | null) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 💡 画面が表示された瞬間に、Rust側からファイル一覧を取得する
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const fileList = await invoke<string[]>('get_novel_list');
        setFiles(fileList);
      } catch (err) {
        console.error("ファイル一覧の取得に失敗:", err);
        setError("ファイルの読み込み中にエラーが発生しました。");
      }
    };
    fetchFiles();
  }, []);

  return (
    <div style={{ padding: '30px', fontFamily: 'sans-serif', backgroundColor: '#f5f6fa', minHeight: '100vh', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: '#fff', padding: '25px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        
        <h2 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>管理画面</h2>
        <p style={{ color: '#7f8c8d', fontSize: '14px', marginBottom: '20px' }}>保存済みの小説テキストファイル一覧です。クリックするとエディタで続きを書けます。</p>
        
        {/* エラー表示 */}
        {error && <p style={{ color: '#e74c3c', fontWeight: 'bold' }}>{error}</p>}

        {/* 💡 ファイル一覧を表示するリスト */}
        <div style={{ marginBottom: '25px' }}>
          {files.length === 0 ? (
            <p style={{ color: '#bdc3c7', fontStyle: 'italic', padding: '15px 0', textAlign: 'center', border: '1px dashed #dcdde1', borderRadius: '6px' }}>
              保存されたファイルがまだありません。
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {files.map((filename) => (
                <li 
                  key={filename}
                  onClick={() => onNavigate(filename)} // 💡 クリックしたらファイル名を渡して画面遷移
                  style={{
                    padding: '12px 15px',
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #dcdde1',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontWeight: '500',
                    color: '#2c3e50'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#eef2f3';
                    e.currentTarget.style.borderColor = '#22703f';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8f9fa';
                    e.currentTarget.style.borderColor = '#dcdde1';
                  }}
                >
                  <span>📄 {filename}</span>
                  <span style={{ fontSize: '12px', color: '#22703f' }}>編集する →</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        {/* 新規作成ボタン */}
        <button 
          onClick={() => onNavigate(null)} // 新規は null を渡す
          style={{ 
            width: '100%',
            padding: '12px', 
            fontSize: '15px', 
            fontWeight: 'bold',
            cursor: 'pointer',
            backgroundColor: '#22703f',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            boxShadow: '0 4px 6px rgba(34,112,63,0.15)',
          }}
        >
          ＋ 新しい原稿を書く（新規作成）
        </button>

      </div>
    </div>
  );
};