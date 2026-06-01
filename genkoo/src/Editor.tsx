import React, { useState, useRef, useEffect, useMemo } from 'react';
// 💡 Tauriのバックエンド（Rust）を呼び出すためのAPIをインポート
import { invoke } from '@tauri-apps/api/core';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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
  // 💡 現在カーソルが位置しているセルのキー ("page-char") を管理してキャレット描画を完全同期
  const [activeCellKey, setActiveCellKey] = useState<string>('');

  const charsPerPage = 400;
  const deskRef = useRef<HTMLDivElement>(null);
  const hiddenTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 各マスのDOM要素への参照を保持するMap（ページ・マスごとに一意のキーで管理）
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // ==========================================
  // 💡 原稿用紙データ生成（禁則追い込み対応）
  // ==========================================
  const { gridChars, gridRawIndices } = useMemo(() => {
    const chars: string[] = [];
    const rawIndices: [number, number][] = []; 
    
    const lines = rawText.split('\n');
    const gyotoKinsoku = ['。', '、', '」', '』', '）', 'ー', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'っ', 'ゃ', 'ゅ', 'ょ'];
    const gyomatsuKinsoku = ['「', '『', '（'];

    let currentRawIdx = 0; 

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineChars = line.split('');
      let currentLineLength = 0;

      for (let j = 0; j < lineChars.length; j++) {
        const char = lineChars[j];
        const nextChar = lineChars[j + 1];

        // ── 1. 行末禁則の判定（始めカッコが20マス目に来る場合、空マス化） ──
        if (currentLineLength === 19 && gyomatsuKinsoku.includes(char)) {
          chars.push('');
          rawIndices.push([-1, -1]); 
          currentLineLength = 0;
        }

        // ── 2. 行頭禁則の判定（次の文字が句読点等で、今が20マス目の場合、追い込み処理） ──
        if (nextChar && gyotoKinsoku.includes(nextChar) && currentLineLength === 19) {
          chars.push(char + nextChar); 
          rawIndices.push([currentRawIdx, currentRawIdx + 2]); 
          
          currentRawIdx += 2; 
          j++; 
          currentLineLength = 0;
          continue;
        }

        // ── 3. 通常の文字配置 ──
        chars.push(char);
        rawIndices.push([currentRawIdx, currentRawIdx + 1]);
        
        currentRawIdx++;
        currentLineLength++;

        if (currentLineLength === 20) {
          currentLineLength = 0;
        }
      }

      // ── 4. 改行（エンター）があった場合の残りのマス埋め処理 ──
      if (i < lines.length - 1) {
        if (currentLineLength > 0) {
          const remaining = 20 - currentLineLength;
          for (let r = 0; r < remaining; r++) {
            chars.push('');
            rawIndices.push([currentRawIdx, currentRawIdx]); 
          }
        } else if (lineChars.length === 0) {
          for (let r = 0; r < 20; r++) {
            chars.push('');
            rawIndices.push([currentRawIdx, currentRawIdx]);
          }
        }
        currentRawIdx++; 
        currentLineLength = 0;
      }
    }

    return { gridChars: chars, gridRawIndices: rawIndices };
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

  // ページ数増加時のスクロール制御
  const prevPaperCountRef = useRef<number>(paperCount);
  useEffect(() => {
    if (paperCount > prevPaperCountRef.current && deskRef.current) {
      deskRef.current.scrollTop = deskRef.current.scrollHeight;
    }
    prevPaperCountRef.current = paperCount;
  }, [paperCount]);

  useEffect(() => {
    if (hiddenTextareaRef.current) {
      hiddenTextareaRef.current.selectionStart = selectionIndex;
      hiddenTextareaRef.current.selectionEnd = selectionIndex;
    }
  }, [selectionIndex]);

  // 隠しテキストエリアとキャレットの位置更新
  const updateHiddenTextareaPosition = (currentSelIndex: number) => {
    let targetGridIdx = gridRawIndices.findIndex(([start, end]) => {
      if (start === -1) return false;
      return currentSelIndex >= start && currentSelIndex < end;
    });
    
    if (targetGridIdx === -1) {
      const lastValidIdx = [...gridRawIndices].reverse().findIndex(([start]) => start !== -1 && start < currentSelIndex);
      if (lastValidIdx !== -1) {
        const actualLastIdx = gridRawIndices.length - 1 - lastValidIdx;
        targetGridIdx = Math.min(actualLastIdx + 1, totalGridChars);
      } else {
        targetGridIdx = 0;
      }
    }

    const targetPageIdx = Math.floor(targetGridIdx / charsPerPage);
    const targetCharIdx = targetGridIdx % charsPerPage;

    const cellKey = `${targetPageIdx}-${targetCharIdx}`;
    setActiveCellKey(cellKey);

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
    const t = setTimeout(() => {
      updateHiddenTextareaPosition(selectionIndex);
    }, 0);
    return () => clearTimeout(t);
  }, [selectionIndex, rawText, gridRawIndices]);

  // オートセーブロジック
  useEffect(() => {
    if (!rawText) return;

    const timer = setTimeout(async () => {
      try {
        await invoke('save_novel', { text: rawText });
        console.log('【Autosave】自動保存に成功しました。');
      } catch (error) {
        console.error('【Autosave】自動保存に失敗しました:', error);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [rawText]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawText(e.target.value);
    setSelectionIndex(e.target.selectionStart);
  };

  const handleTextareaSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setSelectionIndex(e.currentTarget.selectionStart);
  };

  const handleCellClick = (pageIdx: number, charIdx: number) => {
    const globalGridIdx = pageIdx * charsPerPage + charIdx;
    const range = gridRawIndices[globalGridIdx];
    
    let targetRawIdx = range ? range[0] : -1;
    
    if (targetRawIdx === -1 || targetRawIdx === undefined) {
      targetRawIdx = rawText.length;
    }

    setSelectionIndex(targetRawIdx);
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

  // ==========================================
  // 💡 保存先選択ダイアログ ＆ 横向き・見切れ防止PDF出力
  // ==========================================
  const handleExportPDF = async () => {
    const deskElement = document.getElementById('genko-paper-desk');
    if (!deskElement) return;

    try {
      // 1. Tauri側の「名前を付けて保存」ダイアログを呼び出す
      const selectedPath = await invoke<string | null>('show_save_dialog', {
        defaultName: 'genko_output.pdf'
      });

      // キャンセルされた場合は処理を中断
      if (!selectedPath) return;

      // 2. 原稿用紙デスク内の「各用紙（ページ）」を1枚ずつ綺麗にパースしてPDF化する
      const paperElements = deskElement.querySelectorAll('[data-genko-page]');
      if (paperElements.length === 0) {
        alert('出力する原稿用紙が見つかりませんでした。');
        return;
      }

      // jsPDFの初期化：横向き('l'), 単位はミリ('mm'), サイズはB4
      const pdf = new jsPDF({
        orientation: 'l',
        unit: 'mm',
        format: 'b4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < paperElements.length; i++) {
        const pageEl = paperElements[i] as HTMLElement;

        // html2canvasで各ページを個別に高画質キャプチャ
        const canvas = await html2canvas(pageEl, {
          scale: 2, 
          useCORS: true,
          backgroundColor: '#fffdf9', 
        });

        const imgData = canvas.toDataURL('image/png');

        // 2ページ目以降はPDFに新しいページを追加
        if (i > 0) {
          pdf.addPage('b4', 'l');
        }

        // 用紙の横幅いっぱいに画像が収まるようにアスペクト比を計算
        const imgWidth = pdfWidth; 
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        let finalWidth = imgWidth;
        let finalHeight = imgHeight;
        if (imgHeight > pdfHeight) {
          finalHeight = pdfHeight;
          finalWidth = (canvas.width * pdfHeight) / canvas.height;
        }

        const xOffset = (pdfWidth - finalWidth) / 2;
        const yOffset = (pdfHeight - finalHeight) / 2;

        pdf.addImage(imgData, 'PNG', xOffset, yOffset, finalWidth, finalHeight);
      }

      // 3. 生成したPDFデータをバイナリ（Base64）に変換し、Rust経由で指定パスに保存
      const pdfOutputB64 = pdf.output('datauristring').split(',')[1];
      await invoke('save_file_binary', {
        path: selectedPath,
        base64Data: pdfOutputB64
      });

      alert('PDFファイルが指定された場所に保存されました！');
    } catch (error) {
      console.error('PDF出力・保存エラー:', error);
      alert('PDFの保存中にエラーが発生しました。');
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
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#34495e' }}>
            文字数：{totalChars}文字 / 原稿用紙：{paperCount}枚
          </div>
          <button
            onClick={handleExportPDF}
            style={{
              padding: '6px 15px',
              fontSize: '13px',
              fontWeight: 'bold',
              backgroundColor: '#3498db',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(52,152,219,0.2)'
            }}
          >
            PDFで出力する
          </button>
        </div>
      </div>

      {/* 原稿用紙が縦に並ぶデスク領域 */}
      <div 
        ref={deskRef}
        id="genko-paper-desk"
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
              data-genko-page="true"
              onClick={(e) => e.stopPropagation()} 
              style={{
                position: 'relative',
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

              {/* 原稿用紙的外枠線 */}
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
                {/* グリッドシステム */}
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
                    
                    const localColumnGroup = Math.floor((charIndex % 200) / 20); 
                    const baseColumnStart = isLeftHalf 
                      ? (localColumnGroup * 3) + 31 + 1 
                      : (localColumnGroup * 3) + 1;      

                    const rowIndex = (charIndex % 20) + 1;
                    const char = pageChars[charIndex] || '';
                    const cellKey = `${pageIndex}-${charIndex}`;

                    const isCaretHere = isFocused && activeCellKey === cellKey;

                    // 追い込みマスの判定
                    const isKinsokuPacked = char.length > 1;
                    // 💡 安全のために条件式の位置を事前に計算してエラーを徹底回避
                    const packedSymbolRightOffset = isKinsokuPacked && ['、', '。'].includes(char[1]) ? '2px' : '6px';

                    return (
                      <React.Fragment key={charIndex}>
                        {/* 右側のルビスペース */}
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

                        {/* 文字マス目本体 */}
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
                            fontFamily: '"Noto Serif JP", "Hiragino Mincho ProN", "MS Mincho", serif',
                            fontSize: '18px',
                            color: '#2c3e50',
                            position: 'relative',
                            userSelect: 'none',
                          }}
                        >
                          {/* 追い込み時もメイン文字のサイズを18pxに100%維持 */}
                          {isKinsokuPacked ? (
                            <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                              <span style={{ fontSize: '18px', transform: 'translateY(-2px)' }}>
                                {char[0]}
                              </span>
                              <span style={{ 
                                position: 'absolute', 
                                bottom: '-1px', 
                                right: packedSymbolRightOffset, 
                                fontSize: '11px',
                                fontWeight: 'bold',
                                lineHeight: 1
                              }}>
                                {char[1]}
                              </span>
                            </div>
                          ) : (
                            <span style={{ writingMode: 'vertical-rl', WebkitWritingMode: 'vertical-rl' }}>
                              {char}
                            </span>
                          )}

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

                        {/* 左側のルビスペース */}
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

                  {/* 中央の柱（魚尾）レイヤー */}
                  <div
                    style={{
                      gridColumn: 31, 
                      gridRow: '1 / span 20',
                      width: '48px', 
                      height: '540px',
                      padding: '10px 5px', 
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
                      <div style={{ letterSpacing: '2px' }}>　　　　</div>
                      <div>　　　　</div>
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
            zIndex: 1,
            writingMode: 'vertical-rl',
            WebkitWritingMode: 'vertical-rl',
          }}
        />

      </div>

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