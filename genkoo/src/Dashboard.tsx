import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface DashboardProps {
  onNavigate: (filename: string | null) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ─── 💡 ダイアログ（モーダル）用の状態管理 ───
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  
  const [newFileName, setNewFileName] = useState('');
  const [selectedOldName, setSelectedOldName] = useState('');
  const [renameTargetName, setRenameTargetName] = useState('');

  // ファイル一覧を再取得する共通処理
  const fetchFiles = async () => {
    try {
      const fileList = await invoke<string[]>('get_novel_list');
      setFiles(fileList);
      setError(null);
    } catch (err) {
      console.error("ファイル一覧の取得に失敗:", err);
      setError("ファイルの読み込み中にエラーが発生しました。");
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  // ─── ✨ ① 新規ファイル作成処理 ───
  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;

    try {
      const createdName = await invoke<string>('create_new_novel', { filename: newFileName.trim() });
      setIsCreateModalOpen(false);
      setNewFileName('');
      onNavigate(createdName);
    } catch (err) {
      setError(err as string);
    }
  };

  // ─── ✨ ② ファイル名変更（リネーム）処理 ───
  const handleRenameFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTargetName.trim() || !selectedOldName) return;

    try {
      await invoke('rename_novel', { 
        old_name: selectedOldName, 
        new_name: renameTargetName.trim() 
      });
      setIsRenameModalOpen(false);
      setRenameTargetName('');
      setSelectedOldName('');
      fetchFiles();
    } catch (err) {
      setError(err as string);
    }
  };

  return (
    <div style={{ 
      padding: '60px 40px', 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', 
      backgroundColor: '#f9f8f6', // ✨ 原稿用紙の背景に調和する、少し温かみのある生成りホワイト
      minHeight: '100vh', 
      boxSizing: 'border-box',
      color: '#2c3e50', // 文字色は読みやすい上品なダークグレー
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      position: 'relative'
    }}>
      <div style={{ width: '100%', maxWidth: '1000px' }}>
        
        {/* ─── 🏷️ ヘッダーロゴエリア ─── */}
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <h1 style={{ 
            fontSize: '38px', 
            fontWeight: '800', 
            letterSpacing: '3px', 
            margin: '0 0 8px 0',
            color: '#22703f' // ✨ エディタのメインカラーである美しい緑色に統一！
          }}>
            Genkoo
          </h1>
          <p style={{ color: '#7f8c8d', fontSize: '14px', margin: 0, fontWeight: '500' }}>
            Web-based Manuscript Paper Editor
          </p>
        </div>

        {/* ─── 🗂️ メインコンテンツ（左右2カラム構造） ─── */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1.2fr', 
          gap: '30px',
          alignItems: 'start'
        }}>
          
          {/* 👇 左側：アクションカード（新規作成） */}
          <div 
            onClick={() => setIsCreateModalOpen(true)}
            style={{ 
              backgroundColor: '#ffffff', // 清潔感のある白カード
              border: '2px dashed #bdc3c7',
              borderRadius: '16px',
              padding: '60px 30px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.04)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#22703f';
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = '0 10px 25px rgba(34,112,63,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#bdc3c7';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.04)';
            }}
          >
            <div style={{ 
              fontSize: '52px', 
              color: '#22703f', 
              marginBottom: '15px',
              lineHeight: 1 
            }}>
              ＋
            </div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '700', color: '#2c3e50' }}>新規小説を作成</h3>
            <p style={{ margin: 0, color: '#7f8c8d', fontSize: '13px', lineHeight: '1.6' }}>
              新しい原稿用紙を開き、<br />ルビ付きの美しい縦書き執筆を始めます。
            </p>
          </div>

          {/* 👇 右側：最近のファイル・一覧エリア */}
          <div style={{ 
            backgroundColor: '#ffffff', // 清潔感のある白カード
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '30px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
            minHeight: '260px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <h3 style={{ 
              margin: '0 0 20px 0', 
              fontSize: '15px', 
              fontWeight: '700', 
              color: '#7f8c8d',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>📂 最近の執筆データ</span>
              <span style={{ fontSize: '12px', color: '#22703f', backgroundColor: '#eaf4ed', padding: '2px 8px', borderRadius: '12px' }}>
                {files.length} 件のデータ
              </span>
            </h3>

            {error && (
              <div style={{ color: '#e74c3c', fontSize: '13px', padding: '10px 12px', backgroundColor: '#fdf2f2', borderRadius: '6px', marginBottom: '15px', fontWeight: '500' }}>
                ⚠️ {error}
              </div>
            )}

            {/* ファイルリスト部分 */}
            {files.length === 0 ? (
              <div style={{ 
                flex: 1, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: '#95a5a6',
                fontSize: '14px',
                border: '1px dashed #e2e8f0',
                borderRadius: '10px',
                padding: '40px 0'
              }}>
                保存された小説がありません
              </div>
            ) : (
              <ul style={{ 
                listStyle: 'none', 
                padding: 0, 
                margin: 0,
                maxHeight: '300px',
                overflowY: 'auto'
              }}>
                {files.map((filename, index) => (
                  <li 
                    key={index}
                    style={{ 
                      padding: '14px 18px', 
                      marginBottom: '12px', 
                      backgroundColor: '#f8fafc', // ほんのり明るいグレーの行背景
                      borderRadius: '10px', 
                      border: '1px solid #edf2f7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* 左側：ファイル名クリックで編集へ */}
                    <div 
                      onClick={() => onNavigate(filename)}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#22703f';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#2c3e50';
                      }}
                    >
                      <span style={{ fontSize: '18px' }}>📄</span>
                      <span style={{ fontSize: '14px', fontWeight: '600' }}>
                        {filename}
                      </span>
                    </div>

                    {/* 右側：名前変更（リネーム）ボタン */}
                    <button
                      onClick={() => {
                        setSelectedOldName(filename);
                        setRenameTargetName(filename.replace('.txt', ''));
                        setIsRenameModalOpen(true);
                      }}
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        color: '#64748b',
                        padding: '6px 14px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#22703f';
                        e.currentTarget.style.backgroundColor = '#eaf4ed';
                        e.currentTarget.style.color = '#22703f';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#cbd5e1';
                        e.currentTarget.style.backgroundColor = '#ffffff';
                        e.currentTarget.style.color = '#64748b';
                      }}
                    >
                      名前変更
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </div>

      {/* ─── 💮 新規作成用 名前入力ダイアログ ─── */}
      {isCreateModalOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#2c3e50', fontWeight: '700' }}>✍️ 新規小説のタイトル</h3>
            <form onSubmit={handleCreateFile}>
              <input 
                type="text" 
                placeholder="例: 吾輩は猫である" 
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                autoFocus
                style={modalInputStyle}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setIsCreateModalOpen(false)} style={cancelButtonStyle}>キャンセル</button>
                <button type="submit" style={confirmButtonStyle}>作成して執筆する</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 💮 名前変更用 入力ダイアログ ─── */}
      {isRenameModalOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', color: '#2c3e50', fontWeight: '700' }}>✏️ ファイル名の変更</h3>
            <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#7f8c8d' }}>元のファイル: {selectedOldName}</p>
            <form onSubmit={handleRenameFile}>
              <input 
                type="text" 
                placeholder="新しいタイトルを入力" 
                value={renameTargetName}
                onChange={(e) => setRenameTargetName(e.target.value)}
                autoFocus
                style={modalInputStyle}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setIsRenameModalOpen(false)} style={cancelButtonStyle}>キャンセル</button>
                <button type="submit" style={{ ...confirmButtonStyle, backgroundColor: '#22703f' }}>名前を変更する</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

// ─── 🎨 ダイアログ（モーダル）用のライトモダン共通スタイル ───
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(44, 62, 80, 0.4)', // 上品で柔らかい半透明ダークブルーの遮蔽背景
  display: 'flex', alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(4px)' // 背景をほんのりぼかす高級感ある演出
};

const modalContentStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '30px',
  width: '100%',
  maxWidth: '400px',
  boxShadow: '0 20px 50px rgba(0,0,0,0.1)'
};

const modalInputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', marginBottom: '20px',
  backgroundColor: '#f8fafc', border: '1px solid #cbd5e1',
  borderRadius: '8px', color: '#2c3e50', fontSize: '14px',
  boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.2s'
};

const cancelButtonStyle: React.CSSProperties = {
  backgroundColor: 'transparent', border: 'none', color: '#7f8c8d',
  padding: '8px 16px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
};

const confirmButtonStyle: React.CSSProperties = {
  backgroundColor: '#22703f', border: 'none', color: '#fff',
  padding: '10px 20px', borderRadius: '8px', cursor: 'pointer',
  fontSize: '14px', fontWeight: '700', boxShadow: '0 4px 10px rgba(34,112,63,0.2)'
};