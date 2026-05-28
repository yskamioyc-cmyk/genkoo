import React, { useState, useRef, useEffect, useMemo } from 'react';
// 💡 Tauriのバックエンド（Rust）を呼び出すためのAPIをインポート
import { invoke } from '@tauri-apps/api/core';

export const Editor: React.FC<{ onNavigate: () => void }> = ({ onNavigate }) => {
  // 💡 初期テキスト（改行や、複数連続の空行を含んだテキスト形式）
  const [rawText, setRawText] = useState<string>(
    'これは本格的なＢ４判ルビスペース付き原稿用紙フォーマットのエディタです。\n\n\nここに２行の空行を挟んで、場面が転換します。\n４００文字に達すると自動的に次の紙が作られます。'
  );

  // 💡 現在カーソルがある全体の文字インデックス
  const [selectionIndex, setSelectionIndex] = useState<number>(0);
  // 💡 エディタ全体にフォーカスが当たっているか
  const [isFocused, setIsFocused] = useState<boolean>(false);

  const charsPerPage = 400;
  const deskRef = useRef<HTMLDivElement>(null);
  const hiddenTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ==========================================
  // 💡 【大改良】連続改行（空行）に完全対応した原稿用紙マッピングロジック
  // ==========================================
  const gridChars = useMemo(() => {
    const chars: string[] = [];
    const lines = rawText.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineChars = line.split('');
      
      // 1. まずその行に入っている文字を詰め込む
      for (let j = 0; j < lineChars.length; j++) {
        chars.push(lineChars[j]);
      }

      // 2. 💡 【重要】最終行より前、あるいは文字が入っているか、あるいは「連続してエンターが押された空行」の場合
      //    その行（20マス）の残りをすべて確実に空文字で埋めて、強制的に次の行へ移行させます。
      if (i < lines.length - 1) {
        const currentLinePosition = chars.length % 20;
        const remaining = 20 - currentLinePosition;
        // remaining === 20 の場合は、すでにぴったり20マス（ちょうど1行埋まった状態）
        // それ以外（行の途中、あるいは完全な空行で currentLinePosition が 0 の場合）は20マス埋める
        if (remaining !== 20 || lineChars.length === 0) {
          const fillCount = remaining === 20 ? 20 : remaining;
          for (let r = 0; r < fillCount; r++) {
            chars.push(''); // 原稿用紙上の見えない空欄マスにする
          }
        }
      }
    }
    return chars;
  }, [rawText]);

  // マス目上の総文字数（空欄埋め含む）から、正確な動的ページ数を計算
  const totalGridChars = gridChars.length;
  const paperCount = Math.max(1, Math.ceil((totalGridChars + 1) / charsPerPage));

  // 画面表示用の文字数（改行コードを除去した、純粋な執筆文字数）
  const totalChars = rawText.replace(/\n/g, '').length;

  // 各ページごとのグリッド文字（400要素ずつ）に分割
  const pagesGridData = useMemo(() => {
    const arr: string[][] = [];
    for (let i = 0; i < paperCount; i++) {
      const pageSlice = gridChars.slice(i * charsPerPage, (i + 1) * charsPerPage);
      // 400要素に満たない場合は空文字で埋める
      while (pageSlice.length < charsPerPage) {
        pageSlice.push('');
      }
      arr.push(pageSlice);
    }
    return arr;
  }, [gridChars, paperCount]);

  // 新しいページが追加されたら自動的に一番下へスクロール
  useEffect(() => {
    if (deskRef.current) {
      deskRef.current.scrollTop = deskRef.current.scrollHeight;
    }
  }, [paperCount]);

  // 隠しtextareaのカーソル位置をStateと完全に同期させる
  useEffect(() => {
    if (hiddenTextareaRef.current) {
      hiddenTextareaRef.current.selectionStart = selectionIndex;
      hiddenTextareaRef.current.selectionEnd = selectionIndex;
    }
  }, [selectionIndex]);

  // 隠しテキストエリアで文字が入力された（エンター含む）時の処理
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawText(e.target.value);
    setSelectionIndex(e.target.selectionStart);
  };

  // キーボードによるカーソル移動を同期
  const handleTextareaSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setSelectionIndex(e.currentTarget.selectionStart);
  };

  // 💡 マス目がクリックされた時、そのマスに対応するrawTextの正しい位置を算出してフォーカス
  const handleCellClick = (pageIdx: number, charIdx: number) => {
    const targetCellGlobalIdx = pageIdx * charsPerPage + charIdx;

    let currentGridIdx = 0;
    let rawIdx = 0;
    const lines = rawText.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineLen = lines[i].length;
      
      // グリッド上、この行に割り当てられるマス数（文字数 + 改行までの空欄補正）
      let gridLineDelta = lineLen;
      if (i < lines.length - 1) {
        const tempTotal = currentGridIdx + lineLen;
        const rem = 20 - (tempTotal % 20);
        gridLineDelta += (rem === 20 ? 20 : rem);
      }

      if (targetCellGlobalIdx >= currentGridIdx && targetCellGlobalIdx < currentGridIdx + gridLineDelta) {
        // クリックした位置がこの行の中にある場合
        const offset = targetCellGlobalIdx - currentGridIdx;
        if (offset <= lineLen) {
          rawIdx += offset;
        } else {
          // 空白スキップエリアをクリックした場合は、その行の文字の末尾（改行コードの直前）に置く
          rawIdx += lineLen;
        }
        break;
      }
      
      currentGridIdx += gridLineDelta;
      rawIdx += lineLen + 1; // +1 は 改行コード(\n)分
    }

    const finalIdx = Math.min(Math.max(0, rawIdx), rawText.length);
    setSelectionIndex(finalIdx);
    setIsFocused(true);
    if (hiddenTextareaRef.current) {
      hiddenTextareaRef.current.focus();
    }
  };

  // エディタの空白部分がクリックされたら、末尾にフォーカス
  const handleDeskClick = () => {
    setSelectionIndex(rawText.length);
    setIsFocused(true);
    if (hiddenTextareaRef.current) {
      hiddenTextareaRef.current.focus();
    }
  };

  // 保存処理
  const handleSaveAndNavigate = async () => {
    try {
      const message = await invoke<string>('save_novel', { text: rawText });
      console.log(message);
      alert('保存しました！');
      onNavigate();
    } catch (error) {
      console.error('保存に失敗しました:', error);
      alert('保存中にエラーが発生しました: ' + error);
    }
  };

  return (
    <div 
      onClick={handleDeskClick}
      style={{ padding: '20px', fontFamily: 'sans-serif', backgroundColor: '#eef2f3', minHeight: '100vh', boxSizing: 'border-box' }}
    >
      
      {/* ヘッダーエリア */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '0 10px' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0, color: '#2c3e50', fontSize: '20px' }}>Genkoo エディタ</h2>
        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#34495e' }}>
          文字数：{totalChars}文字 / 原稿用紙：{paperCount}枚
        </div>
      </div>

      {/* 原稿用紙が縦に並ぶデスク領域 */}
      <div 
        ref={deskRef}
        style={{ 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '50px',
          overflowY: 'auto', 
          padding: '20px 0',
          maxHeight: 'calc(100vh - 160px)',
        }}
      >
        
        {pagesGridData.map((pageChars, pageIndex) => {
          return (
            <div 
              key={pageIndex}
              onClick={(e) => e.stopPropagation()} 
              style={{
                position: 'relative',
                width: '940px', 
                height: '650px',
                padding: '52px 0', 
                backgroundColor: '#fffdf9',
                boxShadow: '0 12px 24px rgba(0,0,0,0.08)',
                borderRadius: '4px',
                border: '1px solid #dcdde1',
                boxSizing: 'border-box',
                display: 'flex',
                justifyContent: 'center',
                cursor: 'text',
              }}
            >
              {/* ページ番号表示 */}
              <div style={{ position: 'absolute', top: '15px', left: '25px', color: 'rgba(34, 112, 63, 0.5)', fontSize: '12px', fontWeight: 'bold' }}>
                {pageIndex + 1} / {paperCount}
              </div>

              {/* 原稿用紙の外枠線 */}
              <div
                style={{
                  position: 'relative',
                  width: '798px',          
                  height: '546px', 
                  border: '3px double rgba(34, 112, 63, 0.7)',
                  backgroundColor: '#fffdf9',
                  boxSizing: 'border-box',
                }}
              >
                {/* 完璧に1対1で対応する不動のCSSグリッドレイアウト */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateRows: 'repeat(20, 27px)',
                    gridTemplateColumns: `
                      repeat(10, 28px 10px) 
                      38px                   
                      repeat(10, 28px 10px)
                    `,
                    gridAutoFlow: 'column',
                    width: '100%',
                    height: '100%',
                    direction: 'rtl',
                  }}
                >
                  {Array.from({ length: charsPerPage }).map((_, charIndex) => {
                    const isLeftHalf = charIndex >= 200;
                    const columnIndex = isLeftHalf 
                      ? Math.floor(charIndex / 20) * 2 + 2 
                      : Math.floor(charIndex / 20) * 2 + 1;

                    const rowIndex = (charIndex % 20) + 1;
                    const char = pageChars[charIndex] || '';

                    // 💡 カーソル表示位置を連続改行に対応させて厳密にマッピング
                    let currentGridIdx = 0;
                    let isCaretHere = false;
                    
                    if (isFocused) {
                      const lines = rawText.split('\n');
                      let tempRawIdx = 0;
                      
                      for (let i = 0; i < lines.length; i++) {
                        const lineLen = lines[i].length;
                        const targetGlobalCell = pageIndex * charsPerPage + charIndex;

                        let gridLineDelta = lineLen;
                        if (i < lines.length - 1) {
                          const tempTotal = currentGridIdx + lineLen;
                          const rem = 20 - (tempTotal % 20);
                          gridLineDelta += (rem === 20 ? 20 : rem);
                        }

                        // カーソル選択位置（selectionIndex）がこの行のデータ内にあるか
                        if (selectionIndex >= tempRawIdx && selectionIndex <= tempRawIdx + lineLen) {
                          const rawOffset = selectionIndex - tempRawIdx;
                          if (targetGlobalCell === currentGridIdx + rawOffset) {
                            isCaretHere = true;
                          }
                          break;
                        }

                        currentGridIdx += gridLineDelta;
                        tempRawIdx += lineLen + 1;
                      }
                    }

                    return (
                      <React.Fragment key={charIndex}>
                        {/* 文字マス目 */}
                        <div
                          onClick={() => handleCellClick(pageIndex, charIndex)}
                          style={{
                            gridColumn: columnIndex,
                            gridRow: rowIndex,
                            width: '28px',
                            height: '27px',
                            border: '1px solid rgba(34, 112, 63, 0.23)',
                            boxSizing: 'border-box',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            fontFamily: '"Noto Serif JP", "MS Mincho", serif',
                            fontSize: '18px',
                            color: '#2c3e50',
                            writingMode: 'vertical-rl',
                            WebkitWritingMode: 'vertical-rl',
                            position: 'relative',
                            userSelect: 'none',
                          }}
                        >
                          {char}

                          {/* 点滅するキャレット線を配置 */}
                          {isCaretHere && (
                            <div 
                              style={{
                                position: 'absolute',
                                top: '2px',
                                left: '4px',
                                right: '4px',
                                height: '2px',
                                backgroundColor: '#22703f',
                                animation: 'blink 1s step-end infinite',
                              }}
                            />
                          )}
                        </div>

                        {/* ルビ用の隙間スペース */}
                        <div
                          onClick={() => handleCellClick(pageIndex, charIndex)}
                          style={{
                            gridColumn: columnIndex + 1,
                            gridRow: rowIndex,
                            width: '10px',
                            height: '27px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </React.Fragment>
                    );
                  })}

                  {/* 中央の柱（魚尾）レイヤー */}
                  <div
                    style={{
                      gridColumn: 21,
                      gridRow: '1 / span 20',
                      width: '38px', 
                      height: '540px',
                      borderLeft: '1px solid rgba(34, 112, 63, 0.35)',
                      borderRight: '1px solid rgba(34, 112, 63, 0.35)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      color: 'rgba(34, 112, 63, 0.4)',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      userSelect: 'none',
                      backgroundColor: '#fffdf9',
                      padding: '10px 0',
                      boxSizing: 'border-box'
                    }}
                  >
                    <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '8px solid rgba(34, 112, 63, 0.4)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flexGrow: 1, justifyContent: 'center' }}>
                      <div style={{ letterSpacing: '2px' }}>バランス</div>
                      <div>２０×２０</div>
                      <div style={{ fontSize: '10px', opacity: 0.8 }}>Genkoo</div>
                    </div>
                    <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '8px solid rgba(34, 112, 63, 0.4)' }} />
                  </div>
                </div>

              </div>
            </div>
          );
        })}

      </div>

      {/* すべてのタイピング、連続改行（エンター）を完璧に受け付ける隠しエリア */}
      <textarea
        ref={hiddenTextareaRef}
        value={rawText}
        onChange={handleTextareaChange}
        onSelect={handleTextareaSelect}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={{
          position: 'fixed',
          top: '-1000px',
          left: '-1000px',
          width: '10px',
          height: '10px',
          opacity: 0,
        }}
      />

      {/* カーソル点滅用のCSSアニメーション */}
      <style>{`
        @keyframes blink {
          from, to { opacity: 0 }
          50% { opacity: 1 }
        }
      `}</style>

      {/* フッターエリア */}
      <div style={{ padding: '0 10px', marginTop: '10px', display: 'flex', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
        <button 
          onClick={handleSaveAndNavigate}
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