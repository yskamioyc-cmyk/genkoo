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

  // 💡 IMEウィンドウを追従させるための、現在アクティブなマスの座標・サイズ情報
  const [activeCellCoords, setActiveCellCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const charsPerPage = 400;
  const deskRef = useRef<HTMLDivElement>(null);
  const hiddenTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 各マスのDOM要素への参照を保持するMap（ページ・マスごとに一意のキーで管理）
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // ==========================================
  // 💡 連続改行（空行）に完全対応した原稿用紙マッピングロジック
  // ==========================================
  const gridChars = useMemo(() => {
    const chars: string[] = [];
    const lines = rawText.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineChars = line.split('');
      
      for (let j = 0; j < lineChars.length; j++) {
        chars.push(lineChars[j]);
      }

      if (i < lines.length - 1) {
        const currentLinePosition = chars.length % 20;
        const remaining = 20 - currentLinePosition;
        if (remaining !== 20 || lineChars.length === 0) {
          const fillCount = remaining === 20 ? 20 : remaining;
          for (let r = 0; r < fillCount; r++) {
            chars.push(''); 
          }
        }
      }
    }
    return chars;
  }, [rawText]);

  const totalGridChars = gridChars.length;
  const paperCount = Math.max(1, Math.ceil((totalGridChars + 1) / charsPerPage));
  const totalChars = rawText.replace(/\n/g, '').length;

  const pagesGridData = useMemo(() => {
    const arr: string[][] = [];
    for (let i = 0; i < paperCount; i++) {
      const pageSlice = gridChars.slice(i * charsPerPage, (i + 1) * charsPerPage);
      while (pageSlice.length < charsPerPage) {
        pageSlice.push('');
      }
      arr.push(pageSlice);
    }
    return arr;
  }, [gridChars, paperCount]);

  useEffect(() => {
    if (deskRef.current) {
      deskRef.current.scrollTop = deskRef.current.scrollHeight;
    }
  }, [paperCount]);

  useEffect(() => {
    if (hiddenTextareaRef.current) {
      hiddenTextareaRef.current.selectionStart = selectionIndex;
      hiddenTextareaRef.current.selectionEnd = selectionIndex;
    }
  }, [selectionIndex]);

  // カーソルが乗っている現在のマスの位置を特定し、隠しtextareaをそこに瞬間移動させる
  const updateHiddenTextareaPosition = (currentSelIndex: number) => {
    const lines = rawText.split('\n');
    let currentGridIdx = 0;
    let tempRawIdx = 0;
    let targetPageIdx = 0;
    let targetCharIdx = 0;
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const lineLen = lines[i].length;
      let gridLineDelta = lineLen;
      if (i < lines.length - 1) {
        const tempTotal = currentGridIdx + lineLen;
        const rem = 20 - (tempTotal % 20);
        gridLineDelta += (rem === 20 ? 20 : rem);
      }

      if (currentSelIndex >= tempRawIdx && currentSelIndex <= tempRawIdx + lineLen) {
        const rawOffset = currentSelIndex - tempRawIdx;
        const globalGridCellIdx = currentGridIdx + rawOffset;
        targetPageIdx = Math.floor(globalGridCellIdx / charsPerPage);
        targetCharIdx = globalGridCellIdx % charsPerPage;
        found = true;
        break;
      }

      currentGridIdx += gridLineDelta;
      tempRawIdx += lineLen + 1;
    }

    if (!found) {
      const lastGridIdx = Math.max(0, totalGridChars - 1);
      targetPageIdx = Math.floor(lastGridIdx / charsPerPage);
      targetCharIdx = lastGridIdx % charsPerPage;
    }

    const cellKey = `${targetPageIdx}-${targetCharIdx}`;
    const cellDom = cellRefs.current.get(cellKey);
    if (cellDom && deskRef.current) {
      const cellRect = cellDom.getBoundingClientRect();
      const deskRect = deskRef.current.getBoundingClientRect();

      setActiveCellCoords({
        top: cellRect.top - deskRect.top + deskRef.current.scrollTop,
        left: cellRect.left - deskRect.left + deskRef.current.scrollLeft,
        width: cellRect.width,
        height: cellRect.height,
      });
    }
  };

  useEffect(() => {
    updateHiddenTextareaPosition(selectionIndex);
  }, [selectionIndex, rawText]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawText(e.target.value);
    setSelectionIndex(e.target.selectionStart);
  };

  const handleTextareaSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setSelectionIndex(e.currentTarget.selectionStart);
  };

  const handleCellClick = (pageIdx: number, charIdx: number) => {
    const targetCellGlobalIdx = pageIdx * charsPerPage + charIdx;
    let currentGridIdx = 0;
    let rawIdx = 0;
    const lines = rawText.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineLen = lines[i].length;
      let gridLineDelta = lineLen;
      if (i < lines.length - 1) {
        const tempTotal = currentGridIdx + lineLen;
        const rem = 20 - (tempTotal % 20);
        gridLineDelta += (rem === 20 ? 20 : rem);
      }

      if (targetCellGlobalIdx >= currentGridIdx && targetCellGlobalIdx < currentGridIdx + gridLineDelta) {
        const offset = targetCellGlobalIdx - currentGridIdx;
        if (offset <= lineLen) {
          rawIdx += offset;
        } else {
          rawIdx += lineLen;
        }
        break;
      }
      currentGridIdx += gridLineDelta;
      rawIdx += lineLen + 1;
    }

    const finalIdx = Math.min(Math.max(0, rawIdx), rawText.length);
    setSelectionIndex(finalIdx);
    setIsFocused(true);
    if (hiddenTextareaRef.current) {
      hiddenTextareaRef.current.focus();
    }
  };

  const handleDeskClick = () => {
    setSelectionIndex(rawText.length);
    setIsFocused(true);
    if (hiddenTextareaRef.current) {
      hiddenTextareaRef.current.focus();
    }
  };

  const handleSaveAndNavigate = async () => {
    try {
      const message = await invoke<string>('save_novel', { text: rawText });
      alert(message);
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
          position: 'relative', 
        }}
      >
        
        {pagesGridData.map((pageChars, pageIndex) => {
          return (
            <div 
              key={pageIndex}
              onClick={(e) => e.stopPropagation()} 
              style={{
                position: 'relative',
                // 💡 魚尾スペースが 38px -> 48px に10px広がったため、用紙全体の幅も 940px -> 950px に10px広げてバランスを維持します
                width: '950px', 
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

              {/* 原稿用紙の外枠線 (中央が10px広がったため、外枠の幅も 798px -> 808px に合わせて拡張) */}
              <div
                style={{
                  position: 'relative',
                  width: '808px',          
                  height: '546px', 
                  border: '3px double rgba(34, 112, 63, 0.7)',
                  backgroundColor: '#fffdf9',
                  boxSizing: 'border-box',
                }}
              >
                {/* 1列を「5px(右ルビ) + 28px(文字) + 5px(左ルビ)」に3分割する超精密グリッド */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateRows: 'repeat(20, 27px)',
                    gridTemplateColumns: `
                      repeat(10, 5px 28px 5px) 
                      48px                   
                      repeat(10, 5px 28px 5px)
                    `,
                    gridAutoFlow: 'column',
                    width: '100%',
                    height: '100%',
                    direction: 'rtl',
                  }}
                >
                  {Array.from({ length: charsPerPage }).map((_, charIndex) => {
                    const isLeftHalf = charIndex >= 200;
                    
                    const localColumnGroup = Math.floor((charIndex % 200) / 20); // 0〜9列目
                    const baseColumnStart = isLeftHalf 
                      ? (localColumnGroup * 3) + 31 + 1 // 後半：柱(31番目)を超えた位置からスタート
                      : (localColumnGroup * 3) + 1;      // 前半：右端からスタート

                    const rowIndex = (charIndex % 20) + 1;
                    const char = pageChars[charIndex] || '';

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

                    const cellKey = `${pageIndex}-${charIndex}`;

                    return (
                      <React.Fragment key={charIndex}>
                        {/* 右側のルビスペース（5px） */}
                        <div
                          onClick={() => handleCellClick(pageIndex, charIndex)}
                          style={{
                            gridColumn: baseColumnStart,
                            gridRow: rowIndex,
                            width: '5px',
                            height: '27px',
                            boxSizing: 'border-box',
                          }}
                        />

                        {/* 文字マス目本体（中央の28pxに固定配置） */}
                        <div
                          ref={(el) => {
                            if (el) cellRefs.current.set(cellKey, el);
                            else cellRefs.current.delete(cellKey);
                          }}
                          onClick={() => handleCellClick(pageIndex, charIndex)}
                          style={{
                            gridColumn: baseColumnStart + 1, 
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

                          {/* 点滅するキャレット線 */}
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

                        {/* 左側のルビスペース（5px） */}
                        <div
                          onClick={() => handleCellClick(pageIndex, charIndex)}
                          style={{
                            gridColumn: baseColumnStart + 2,
                            gridRow: rowIndex,
                            width: '5px',
                            height: '27px',
                            boxSizing: 'border-box',
                          }}
                        />
                      </React.Fragment>
                    );
                  })}

                  {/* 💡 【大改造】中央の柱（魚尾）レイヤー
                      幅を 38px -> 48px に広げ、padding を設定することで、ロジックを壊さずに左右へ5pxずつの追加余白を作ります */}
                  <div
                    style={{
                      gridColumn: 31, 
                      gridRow: '1 / span 20',
                      width: '48px', // 💡 38px から 48px へ (+10px)
                      height: '540px',
                      // 左右に 5px ずつの「内側余白（パディング）」を持たせ、文字要素を中に閉じ込めます
                      padding: '10px 5px', 
                      // 💡 左右の緑線を実質5px内側に引っ込めるため、線の代わりに内側の飾り枠として box-shadow で表現、
                      // または左右の境界線の位置を維持します（今回は外枠に10px足したため、左右の緑の縦線は以前と同じくマス目に密着しつつ、魚尾の文字との間に完璧な5pxの空隙が生まれます）
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

        {/* 動的に配置される隠しエディタ */}
        <textarea
          ref={hiddenTextareaRef}
          value={rawText}
          onChange={handleTextareaChange}
          onSelect={handleTextareaSelect}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={{
            position: 'absolute',
            top: activeCellCoords ? `${activeCellCoords.top}px` : '0px',
            left: activeCellCoords ? `${activeCellCoords.left}px` : '0px',
            width: activeCellCoords ? `${activeCellCoords.width}px` : '28px',
            height: activeCellCoords ? `${activeCellCoords.height}px` : '27px',
            opacity: 0,
            pointerEvents: 'none', 
            get zIndex() { return 1; },
            writingMode: 'vertical-rl',
            WebkitWritingMode: 'vertical-rl',
          }}
        />

      </div>

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