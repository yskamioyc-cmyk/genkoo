import React, { useState, useEffect } from 'react';

export const Editor: React.FC<{ onNavigate: () => void }> = ({ onNavigate }) => {
  // 全体の生テキストを管理
  const [rawText, setRawText] = useState<string>(
    'これは本格的なＢ４判ルビスペース付き原稿用紙フォーマットのエディタです。中央には魚尾（柱）が配置され、各行の左側にはルビを振るための専用領域が設けられています。４００文字に達すると自動的に次の紙が作られます。'
  );

  const charsPerPage = 400;

  // テキストを400文字ずつのページに分割する（最低1ページ）
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
        
        {/* ページの数だけ原稿用紙を出力 */}
        {pages.map((pageContent, pageIndex) => {
          const displayChars = pageContent.split('');
          const paddedChars = Array.from({ length: charsPerPage }, (_, i) => displayChars[i] || '');

          return (
            <div 
              key={pageIndex}
              style={{
                position: 'relative',
                // B4判の美しい比率を維持する固定サイズ設定（横920px × 縦650px）
                width: '920px',
                height: '650px',
                padding: '55px 0', // 上下中央に寄せるためのパディング
                backgroundColor: '#fffdf9', // 和紙のあたたかみのある白
                boxShadow: '0 12px 24px rgba(0,0,0,0.08)',
                borderRadius: '4px',
                border: '1px solid #dcdde1',
                boxSizing: 'border-box',
                display: 'flex',
                justifyContent: 'center' // 💡 グリッド全体をB4用紙の左右中央に配置
              }}
            >
              {/* ページ番号表示 */}
              <div style={{ position: 'absolute', top: '15px', left: '25px', color: 'rgba(34, 112, 63, 0.5)', fontSize: '12px', fontWeight: 'bold' }}>
                {pageIndex + 1} / {paperCount}
              </div>

              {/* 💡 本格的なルビ行＋本文行＋中央魚尾を内包するグリッドコンテナ */}
              <div
                style={{
                  display: 'grid',
                  // 縦方向（Rows）：1マス27pxの高さ × 20文字 ＝ 540px
                  gridTemplateRows: 'repeat(20, 27px)',
                  
                  // 横方向（Columns）：各行は「本文マス(28px)」＋「ルビ用スペース(10px)」
                  // 中央に30pxの魚尾用の余白
                  gridTemplateColumns: `
                    repeat(10, 28px 10px) 
                    30px 
                    repeat(10, 28px 10px)
                  `,
                  gridAutoFlow: 'column',
                  
                  // 💡 ズレを解決：マス目の合計幅（790px）と完全に一致させる
                  width: '790px',  
                  height: '540px', 
                  
                  border: '3px double rgba(34, 112, 63, 0.7)', // 原稿用紙特有の二本線の外枠
                  backgroundColor: '#fffdf9',
                  boxSizing: 'border-box',
                  direction: 'rtl', // 右から左へ配置
                }}
              >
                {/* 400文字のマス目マッピング */}
                {paddedChars.map((char, charIndex) => {
                  const isLeftHalf = charIndex >= 200;
                  
                  // 中央の柱（魚尾）を跨ぐためのグリッド位置計算
                  const columnIndex = isLeftHalf 
                    ? Math.floor(charIndex / 20) * 2 + 2 
                    : Math.floor(charIndex / 20) * 2 + 1;

                  const rowIndex = (charIndex % 20) + 1;

                  return (
                    <React.Fragment key={charIndex}>
                      {/* 本文が収まる正方形のマス目 */}
                      <div
                        style={{
                          gridColumn: columnIndex,
                          gridRow: rowIndex,
                          width: '28px',
                          height: '27px',
                          border: '1px solid rgba(34, 112, 63, 0.25)', // 薄い緑のマス線
                          boxSizing: 'border-box',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          fontFamily: '"Noto Serif JP", "MS Mincho", serif',
                          fontSize: '18px',
                          color: '#2c3e50',
                          direction: 'ltr',
                        }}
                      >
                        {char}
                      </div>

                      {/* ルビ用スペース（境界線なしの透明な隙間） */}
                      <div
                        style={{
                          gridColumn: columnIndex + 1,
                          gridRow: rowIndex,
                          width: '10px',
                          height: '27px',
                          boxSizing: 'border-box',
                          borderBottom: '1px dashed rgba(34, 112, 63, 0.03)', // 目立たないガイド線
                        }}
                      />
                    </React.Fragment>
                  );
                })}

                {/* 中央の柱（魚尾・飾り領域）の描画 */}
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

              {/* 💡 最前面に重ねる透明なテキスト入力エリア（幅を790pxに完全一致させてズレを完全解消） */}
              <textarea
                value={pageContent}
                maxLength={charsPerPage}
                onChange={(e) => handlePageChange(pageIndex, e.target.value)}
                placeholder={pageIndex === 0 ? "ここに文章を入力してください..." : ""}
                style={{
                  position: 'absolute',
                  top: '55px',
                  // 💡 紙のちょうど中央に配置されるよう、左右の正確な位置を固定
                  left: '65px', 
                  width: '790px', // 💡 下のマス目全体の幅と完全同期
                  height: '540px',
                  
                  writingMode: 'vertical-rl',
                  WebkitWritingMode: 'vertical-rl',
                  fontSize: '18px',
                  fontFamily: '"Noto Serif JP", "MS Mincho", serif',
                  
                  // 入力カーソルが本文のマス目にぴったり重なるようにピッチを調整
                  lineHeight: '38px',       // 本文(28px) ＋ ルビ(10px) ＝ 38px周期
                  letterSpacing: '9px',     // 縦方向の文字中心を合わせるための微調整余白
                  
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  boxSizing: 'border-box',
                  padding: 0,
                  margin: 0,
                  caretColor: '#2c3e50',    // カーソルのみ表示
                  color: 'transparent',     // 入力文字は透明化
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
          onClick={onNavigate} 
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