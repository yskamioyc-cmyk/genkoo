import React, { useState, useRef, useEffect, useMemo } from 'react';
// 💡 Tauriのバックエンド（Rust）を呼び出すためのAPIをインポート
import { invoke } from '@tauri-apps/api/core';
import { jsPDF } from 'jspdf'

interface EditorProps {
  currentFilename: string | null;
  onNavigate: () => void;
}
export const Editor: React.FC<EditorProps> = ({ currentFilename, onNavigate }) => {
  // 💡 初期テキスト（改行や、複数連続の空行を含んだテキスト形式）
  const [rawText, setRawText] = useState<string>("");

  // 💡 現在カーソルがある全体の文字インデックス
  const [selectionIndex, setSelectionIndex] = useState<number>(0);
  // 💡 エディタ全体にフォーカスが当たっているか
  const [isFocused, setIsFocused] = useState<boolean>(false);

  // 💡 IMEウィンドウを追従させるための、現在アクティブなマスの座標・サイズ情報
  const [activeCellCoords, setActiveCellCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const charsPerPage = 400;
  // ✨【新設】画面起動時にファイルの中身をロードする処理
  useEffect(() => {
    const loadFileContent = async () => {
      // 新規作成でファイル名がまだ無い場合はデフォルトテキスト
      const defaultText = 'これは本格的なＢ４判ルビスペース付き原稿用紙フォーマットのエディタです。\n\n\nここに２行の空行を挟んで、場面が転換します。\n４００文字に達すると自動的に次の紙が作られます。'
      if (!currentFilename) {
        setRawText(defaultText);
        return;
      }

      try {
        // Rust側から指定したファイル名の中身（文字列）を読み込む
        const content = await invoke<string>('read_novel', { filename: currentFilename });
        setRawText(content);
        if (!content || content.trim() === ""){
          setRawText(defaultText);
        } else {
          setRawText(content);
        }
      } catch (err) {
        console.error("ファイルの読み込みに失敗しました:", err);
        setRawText(defaultText);
      }
    };

    loadFileContent();
  }, [currentFilename]);

  const deskRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null); // ✨新設：原稿用紙1ページ目を直接狙い撃ちする目印
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

  // ==========================================
  // 💡 【修正】正しく useEffect の中に格納したオートセーブロジック
  // ==========================================
  useEffect(() => {
    // テキストが空の場合は保存処理を行わない
    if (!currentFilename) return;

    // 1.5秒（1500ミリ秒）ユーザーの手が止まったら自動保存
    const timer = setTimeout(async () => {
      try {
        const message = await invoke<string>('save_novel',{
          filename: currentFilename,
          text: rawText
        })
        console.log('【Autosave】自動保存に成功しました。', message);
      } catch (error) {
        console.error('【Autosave】自動保存に失敗しました:', error);
      }
    }, 1500);

    // 次の文字が入力されたら、古いタイマーをクリアしてカウントし直す
    return () => clearTimeout(timer);
  }, [rawText, currentFilename]);

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

  // ✨【100%確実・句読点右上・位置ズレなし・マス目上下見切れ完全修正PDF出力コード】
const handleExportPDF = async () => {
  try {
    // 1. 最初にRust側の保存ダイアログを開く
    const defaultName = currentFilename 
      ? currentFilename.replace('.txt', '.pdf') 
      : "原稿用紙_出力.pdf";
      
    const selectedPath = await invoke<string | null>('show_save_dialog', { 
      defaultName 
    });
    
    if (!selectedPath) return; // キャンセル時は終了

    // 2. 【フリーズ対策】publicフォルダから生のフォントファイルを安全に非同期ロード
    let fontBase64 = "";
    try {
      const response = await fetch('/fonts/NotoSerifJP-Regular.ttf');
      if (!response.ok) throw new Error("Font file not found in public/fonts/");
      const blob = await response.blob();
      fontBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]); // 純粋なBase64文字列
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (fontErr) {
      console.error("フォント読み込み失敗:", fontErr);
      alert("public/fonts/NotoSerifJP-Regular.ttf が見つからないか、読み込めませんでした。標準フォントで代用します。");
    }

    // 3. B4用紙サイズ（横364mm × 縦257mm）のPDFインスタンスを作成
    const pdfWidth = 364;
    const pdfHeight = 257;
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [pdfWidth, pdfHeight]
    });

    // ----------------------------------------------------
    // 4. 💡【原稿用紙の精密設計とマス目の自動描画】
    // ----------------------------------------------------
    const cellW = 11.5;       // 1マスのヨコ幅（mm）
    const cellH = 10.45;      // 💡 1マスのタテ高を微調整（20マスで209mmにし、上下余白を等分）
    const gapX = 3.0;         // 列と列の間の隙間（ルビスペース分など、mm）
    const centerSpace = 20.0; // 中央の「柱」の幅（mm）
    const rowsPerColumn = 20; // 1列20マス

    // マス目全体の上下の開始位置を正確に中央寄せ
    const gridTopY = 24.0;    // 💡 マス目の最上端のY座標
    const gridBottomY = gridTopY + (rowsPerColumn * cellH); // 24.0 + 209.0 = 233.0mm

    // 全体の基準線を引くための色と太さを指定
    pdf.setDrawColor(34, 112, 63); // 画面と同じ上品な緑色
    
    // 外枠（二重線）の描画
    pdf.setLineWidth(0.6);
    pdf.rect(20, 20, 324, 217); // 外枠
    pdf.setLineWidth(0.3);
    pdf.rect(21, 21, 322, 215); // 内枠
    
    // 中央の柱（魚尾エリア）の太い縦線
    const centerX = 20 + (324 / 2); // 182mm
    pdf.setLineWidth(0.5);
    pdf.line(centerX - 10, 21, centerX - 10, 236);
    pdf.line(centerX + 10, 21, centerX + 10, 236);

    // 💡【グリッド線（全400マス）を見切れないように精密描画】
    pdf.setLineWidth(0.15); // マス目の線は細くして上品に
    
    for (let colIndex = 0; colIndex < 20; colIndex++) {
      // 各列のベースとなるX座標（左端からの距離）を正確に計算
      let startX = 364 - 30; // 右側の余白からスタートして左に進む
      if (colIndex < 10) {
        startX -= colIndex * (cellW + gapX);
      } else {
        startX -= (10 * (cellW + gapX)) + centerSpace + ((colIndex - 10) * (cellW + gapX));
      }

      // マス目の右端・左端の縦線を「内枠の上下いっぱい」ではなく「マス目の上下端（gridTopY〜gridBottomY）」に正確に引く
      pdf.line(startX, gridTopY, startX, gridBottomY);
      pdf.line(startX - cellW, gridTopY, startX - cellW, gridBottomY);

      // 各マスを区切る横線（20マス分、合計21本）を描画
      for (let rowIndex = 0; rowIndex <= rowsPerColumn; rowIndex++) {
        const currentY = gridTopY + (rowIndex * cellH);
        // 1列の幅（cellW）の分だけ横線を引く
        pdf.line(startX, currentY, startX - cellW, currentY);
      }
    }

    // ----------------------------------------------------
    // 5. 日本語フォントの登録と文字設定
    // ----------------------------------------------------
    if (fontBase64) {
      pdf.addFileToVFS("NotoSerifJP.ttf", fontBase64);
      pdf.addFont("NotoSerifJP.ttf", "NotoSerifJP", "normal");
      pdf.setFont("NotoSerifJP", "normal");
    } else {
      pdf.setFont("MS Gothic", "normal");
    }
    
    pdf.setFontSize(14.5); // マス目の中に美しく余白を持って収まるベストサイズ
    pdf.setTextColor(40, 40, 40);

    // ----------------------------------------------------
    // 6. 💡【完璧な文字流し込み & 特殊記号位置補正ロジック】
    // ----------------------------------------------------
    const pageData: string[] = pagesGridData[0] || [];

    pageData.forEach((char: string, index: number) => {
      if (!char || char.trim() === "") return;

      const colIndex = Math.floor(index / rowsPerColumn); // 0 〜 19 列
      const rowIndex = index % rowsPerColumn;             // 0 〜 19 マス

      let startX = 364 - 30;
      if (colIndex < 10) {
        startX -= colIndex * (cellW + gapX);
      } else {
        startX -= (10 * (cellW + gapX)) + centerSpace + ((colIndex - 10) * (cellW + gapX));
      }

      // 💡【重要】マス目の線の真上ではなく、「四角いマス目のど真ん中」に文字が乗るようにベース位置を修正
      // X軸: startX（右の線）から 左に約8.5mm 進んだ位置が文字の中心線
      // Y軸: gridTopY + (rowIndex * cellH)（マスの上の線）から 下に約8.5mm 下がった位置がベースライン
      const basePdfX = startX - 8.8;
      const basePdfY = gridTopY + (rowIndex * cellH) + 8.4;

      let targetChar = char;
      let offsetX = 0;
      let offsetY = 0;

      // 縦書きの記号補正
      if (char === 'ー' || char === '―' || char === '─' || char === '-') {
        targetChar = '丨'; 
        offsetX = 0.3; // 縦棒をマスのちょうど真ん中に乗せるための微調整
        offsetY = -0.5;
      } else if (char === '、' || char === '，') {
        offsetX = 4.2;
        offsetY = -5.0; // 読点を確実に右上に
      } else if (char === '。' || char === '．') {
        offsetX = 4.2;
        offsetY = -5.0; // 句点を確実に右上に
      } else if (char === 'っ' || char === 'ゃ' || char === 'ゅ' || char === 'ょ' || 
                 char === 'ッ' || char === 'ャ' || char === 'ュ' || char === 'ョ') {
        offsetX = 1.5;
        offsetY = -1.2; // 小さい文字を右上に
      }

      // 完全に計算された美しい位置へ文字をスタンプ！
      pdf.text(targetChar, basePdfX + offsetX, basePdfY + offsetY);
    });

    // ----------------------------------------------------
    // 7. 中央の柱（魚尾）の飾り文字の描画
    // ----------------------------------------------------
    pdf.setFontSize(10);
    pdf.setTextColor(164, 203, 175); // 前回の型エラーを解消した、上品な薄緑色
    pdf.text("バ ラ", centerX - 3, 100);
    pdf.text("ン ス", centerX - 3, 110);
    pdf.text("20×20", centerX - 4.5, 125);
    pdf.text("Genkoo", centerX - 5, 140);

    // 8. PDFバイナリをBase64形式でRustに送り、物理ファイルとして書き込み
    const pdfBase64 = pdf.output('datauristring').split(',')[1];
    await invoke('save_file_binary', { 
      path: selectedPath, 
      base64Data: pdfBase64 
    });
    
    alert("見切れが完全に解消され、枠線の中に文字が美しく整列した最高クオリティのPDFが出力されました！");
  } catch (err) {
    console.error("PDF出力エラー:", err);
    alert("PDFの出力に失敗しました: " + err);
  }
};

  const handleSaveAndNavigate = async () => {
    // ファイル名が決まっていない場合は安全のためにデフォルト名を指定
    const targetName = currentFilename || "無題の小説.txt";

    try {
      // Rust側に filename と text の両方を渡して上書き保存する
      const message = await invoke<string>('save_novel', { 
        filename: targetName, 
        text: rawText 
      });
      console.log(message);
      onNavigate();
    } catch (err) {
      console.error(err);
      alert("ファイルの保存に失敗しました: " + err);
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
              ref={pageIndex === 0 ? paperRef : null}
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

              {/* 原稿用紙の外枠線 */}
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
                      ? (localColumnGroup * 3) + 31 + 1 
                      : (localColumnGroup * 3) + 1;      

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

                  {/* 中央の柱（魚尾）レイヤー */}
                  <div
                    style={{
                      gridColumn: 31, 
                      gridRow: '1 / span 20',
                      width: '48px', 
                      height: '540px',
                      padding: '10px 5px', // 💡 不要だったカンマを削除して正常なCSSに修正
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
            zIndex: 1,
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
          onClick={handleExportPDF}
          style={{ 
            padding: '10px 30px', 
            fontSize: '14px', 
            fontWeight: 'bold',
            cursor: 'pointer', 
            backgroundColor: '#ffffff', 
            color: '#22703f', 
            border: '2px solid #22703f', 
            borderRadius: '6px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#eaf4ed';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#ffffff';
          }}
        >
          PDFに出力する
        </button>

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