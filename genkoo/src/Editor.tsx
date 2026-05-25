import React, { useState } from 'react';
// 💡 Tauriのバックエンド（Rust）を呼び出すためのAPIをインポート
import { invoke } from '@tauri-apps/api/core';

export const Editor: React.FC<{ onNavigate: () => void }> = ({ onNavigate }) => {
  const [rawText, setRawText] = useState<string>(
    'これは本格的なＢ４判ルビスペース付き原稿用紙フォーマットのエディタです。中央には魚尾（柱）が配置され、各行の左側にはルビを振るための専用領域が設けられています。４００文字に達すると自動的に次の紙が作られます。'
  );

  const charsPerPage = 400;

  const getPages = (text: string): string[] => {
    const pages: string[] = [];
    if (text.length === 0) return [''];
    for (let i = 0; i < text.length; i += charsPerPage) {
      pages.push(text.substring(i, i + charsPerPage));
    }
    return pages;
  };

  const pages = getPages(rawText);
  const totalChars = rawText.length;
  const paperCount = pages.length;

  const handlePageChange = (pageIndex: number, pageText: string) => {
    const newPages = [...pages];
    newPages[pageIndex] = pageText;
    setRawText(newPages.join(''));
  };

  // 💡 データの保存処理を行う関数
  const handleSaveAndNavigate = async () => {
    try {
      // Rust側の「save_novel」コマンドを呼び出し、引数として生テキストを渡す
      const message = await invoke<string>('save_novel', { text: rawText });
      console.log(message); // デバッグ用
      alert('保存しました！'); // 簡易的な通知
      
      // 保存が成功したら、管理画面に戻る navigationを実行
      onNavigate();
    } catch (error) {
      console.error('保存に失敗しました:', error);
      alert('保存中にエラーが発生しました: ' + error);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', backgroundColor: '#eef2f3', minHeight: '100vh', boxSizing: 'border-box' }}>
      
      {/* ヘッダーエリア */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '0 10px' }}>
        <h2 style={{ margin: 0, color: '#2c3e50', fontSize: '20px' }}>Genkoo エディタ</h2>
        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#34495e' }}>
          文字数：{totalChars}文字 / 原稿用紙：{paperCount}枚
        </div>
      </div>

      {/* 原稿用紙が並ぶデスク領域 */}
      <div style={{ 
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '50px',
        overflowY: 'auto', 
        padding: '20px 0',
        maxHeight: 'calc(100vh - 160px)'
      }}>
        
        {pages.map((pageContent, pageIndex) => {
          const displayChars = pageContent.split('');
          const paddedChars = Array.from({ length: charsPerPage }, (_, i) => displayChars[i] || '');

          return (
            <div 
              key={pageIndex}
              style={{
                position: 'relative',
                width: '920px',
                height: '650px',
                padding: '52px 0', 
                backgroundColor: '#fffdf9',
                boxShadow: '0 12px 24px rgba(0,0,0,0.08)',
                borderRadius: '4px',
                border: '1px solid #dcdde1',
                boxSizing: 'border-box',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              {/* ページ番号表示 */}
              <div style={{ position: 'absolute', top: '15px', left: '25px', color: 'rgba(34, 112, 63, 0.5)', fontSize: '12px', fontWeight: 'bold' }}>
                {pageIndex + 1} / {paperCount}
              </div>

              {/* グリッドコンテナ */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: 'repeat(20, 27px)',
                  gridTemplateColumns: `
                    repeat(10, 28px 10px) 
                    30px 
                    repeat(10, 28px 10px)
                  `,
                  gridAutoFlow: 'column',
                  width: '790px',  
                  height: '546px', 
                  border: '3px double rgba(34, 112, 63, 0.7)',
                  backgroundColor: '#fffdf9',
                  boxSizing: 'border-box',
                  direction: 'rtl',
                }}
              >
                {paddedChars.map((char, charIndex) => {
                  const isLeftHalf = charIndex >= 200;
                  const columnIndex = isLeftHalf 
                    ? Math.floor(charIndex / 20) * 2 + 2 
                    : Math.floor(charIndex / 20) * 2 + 1;

                  const rowIndex = (charIndex % 20) + 1;

                  return (
                    <React.Fragment key={charIndex}>
                      <div
                        style={{
                          gridColumn: columnIndex,
                          gridRow: rowIndex,
                          width: '28px',
                          height: '27px',
                          border: '1px solid rgba(34, 112, 63, 0.25)',
                          boxSizing: 'border-box',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          fontFamily: '"Noto Serif JP", "MS Mincho", serif',
                          fontSize: '18px',
                          color: '#2c3e50',
                          writingMode: 'vertical-rl',
                          WebkitWritingMode: 'vertical-rl',
                        }}
                      >
                        {char}
                      </div>

                      <div
                        style={{
                          gridColumn: columnIndex + 1,
                          gridRow: rowIndex,
                          width: '10px',
                          height: '27px',
                          boxSizing: 'border-box',
                          borderBottom: '1px dashed rgba(34, 112, 63, 0.03)',
                        }}
                      />
                    </React.Fragment>
                  );
                })}

                {/* 中央の柱（魚尾） */}
                <div
                  style={{
                    gridColumn: 21,
                    gridRow: '1 / span 20',
                    width: '30px',
                    height: '540px',
                    borderLeft: '1px solid rgba(34, 112, 63, 0.35)',
                    borderRight: '1px solid rgba(34, 112, 63, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: 'rgba(34, 112, 63, 0.4)',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    userSelect: 'none',
                    backgroundColor: '#fffdf9'
                  }}
                >
                  <div style={{ letterSpacing: '2px' }}>バランス</div>
                  <div style={{ margin: '12px 0', transform: 'rotate(90deg)' }}>【</div>
                  <div>２０×２０</div>
                  <div style={{ margin: '12px 0', transform: 'rotate(90deg)' }}>】</div>
                  <div style={{ fontSize: '10px', opacity: 0.8 }}>Genkoo</div>
                </div>

              </div>

              {/* 透明なテキスト入力エリア */}
              <textarea
                value={pageContent}
                maxLength={charsPerPage}
                onChange={(e) => handlePageChange(pageIndex, e.target.value)}
                placeholder={pageIndex === 0 ? "ここに文章を入力してください..." : ""}
                style={{
                  position: 'absolute',
                  top: '55px', 
                  left: '65px', 
                  width: '790px', 
                  height: '540px',
                  writingMode: 'vertical-rl',
                  WebkitWritingMode: 'vertical-rl',
                  fontSize: '18px',
                  fontFamily: '"Noto Serif JP", "MS Mincho", serif',
                  lineHeight: '38px',       
                  letterSpacing: '9px',     
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box',
                  padding: 0,
                  margin: 0,
                  caretColor: '#2c3e50',    
                  color: 'transparent',     
                  overflow: 'hidden'
                }}
              />

            </div>
          );
        })}

      </div>

      {/* フッターエリア */}
      <div style={{ padding: '0 10px', marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
        <button 
          onClick={handleSaveAndNavigate} // 💡 修正した関数を割り当て
          style={{ 
            padding: '10px 30px', 
            fontSize: '14px', 
            fontWeight: 'bold',
            cursor: 'pointer', 
            backgroundColor: '#22703f', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '6px',
            boxShadow: '0 4px 6px rgba(34,112,63,0.15)',
          }}
        >
          保存して管理画面に戻る
        </button>
      </div>

    </div>
  );
};