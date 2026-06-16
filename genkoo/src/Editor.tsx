import React, { useState, useRef, useEffect, useMemo } from 'react';
// 💡 Tauriのバックエンド（Rust）を呼び出すためのAPIをインポート
import { invoke } from '@tauri-apps/api/core';
import { jsPDF } from 'jspdf'

interface EditorProps {
  currentFilename: string | null;
  onNavigate: () => void;
}

// 💡 禁則処理用の文字定義
const KINSOKU_GYOUTOU = "、。」』）】｝っゃゅょッャュョー〜…・？！"; // 行頭禁則（ぶら下げ対象）
const KINSOKU_GYOUMATSU = "「『（【｛〈《〔［";               // 行末禁則（追い出し対象）

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
  // ✨画面起動時にファイルの中身をロードする処理
  useEffect(() => {
    const loadFileContent = async () => {
      const defaultText = 'これは本格的なＢ４判ルビスペース付き原稿用紙フォーマットのエディタです。\n\n\nここに２行の空行を挟んで、場面が転換します。\n４００文字に達すると自動的に次の紙が作られます。'
      if (!currentFilename) {
        setRawText(defaultText);
        return;
      }

      try {
        const content = await invoke<string>('read_novel', { filename: currentFilename });
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
  const paperRef = useRef<HTMLDivElement>(null); 
  const hiddenTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 各マスのDOM要素への参照を保持するMap（ページ・マスごとに一意のキーで管理）
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // ========================================================
  // 💡 禁則処理（ぶら下げ・追い出し）を考慮した精密流し込みロジック
  // ========================================================
  const gridData = useMemo(() => {
    const cells: { char: string; rawIdx: number }[] = [];
    // rawTextの各文字インデックスが、cellsのどの位置に対応するかの高速写像マップ
    const rawToGridMap: number[] = new Array(rawText.length + 1).fill(0);
    
    const lines = rawText.split('\n');
    let globalRawIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let linePos = 0; // 現在の列の何マス目か (0 〜 19)
      let j = 0;

      while (j < line.length) {
        const char = line[j];
        const currentRawIdx = globalRawIdx + j;

        // 【行末禁則：追い出し】20マス目（linePos === 19）に開き括弧が来たら、このマスを空けて次の列の先頭へ
        if (linePos === 19 && KINSOKU_GYOUMATSU.includes(char)) {
          cells.push({ char: '', rawIdx: currentRawIdx });
          rawToGridMap[currentRawIdx] = cells.length - 1;
          linePos = 0;
          continue; 
        }

        // 【行頭禁則：ぶら下げ】20マス目（linePos === 19）の時、次の文字が句読点や閉じ括弧なら1つのマスに合体させる
        if (linePos === 19 && j + 1 < line.length && KINSOKU_GYOUTOU.includes(line[j + 1])) {
          const nextChar = line[j + 1];
          cells.push({ char: char + nextChar, rawIdx: currentRawIdx });
          
          rawToGridMap[currentRawIdx] = cells.length - 1;
          rawToGridMap[currentRawIdx + 1] = cells.length - 1; // 句読点の位置もこのマスを指すように
          
          j += 2;
          linePos = 0; 
          continue;
        }

        // 通常の流し込み
        cells.push({ char: char, rawIdx: currentRawIdx });
        rawToGridMap[currentRawIdx] = cells.length - 1;
        
        linePos++;
        if (linePos === 20) {
          linePos = 0;
        }
        j++;
      }

      // 段落の終わり（改行コードの処理）
      const nextLineRawIdx = globalRawIdx + line.length;
      if (i < lines.length - 1) {
        const remaining = 20 - (linePos % 20);
        const fillCount = remaining === 20 ? 20 : remaining;
        for (let r = 0; r < fillCount; r++) {
          cells.push({ char: '', rawIdx: nextLineRawIdx });
        }
        rawToGridMap[nextLineRawIdx] = cells.length; // 改行位置のカーソルは次の行の先頭マスへ
      } else {
        rawToGridMap[nextLineRawIdx] = cells.length;
      }

      globalRawIdx += line.length + 1;
    }

    return { cells, rawToGridMap };
  }, [rawText]);

  const totalGridChars = gridData.cells.length;
  const paperCount = Math.max(1, Math.ceil((totalGridChars + 1) / charsPerPage));
  const totalChars = rawText.replace(/\n/g, '').length;

  // 1ページ400マスずつの2次元配列に分配
  const pagesGridData = useMemo(() => {
    const arr: { char: string; rawIdx: number }[][] = [];
    for (let i = 0; i < paperCount; i++) {
      const pageSlice = gridData.cells.slice(i * charsPerPage, (i + 1) * charsPerPage);
      while (pageSlice.length < charsPerPage) {
        pageSlice.push({ char: '', rawIdx: rawText.length });
      }
      arr.push(pageSlice);
    }
    return arr;
  }, [gridData.cells, paperCount, rawText.length]);

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

  // 写像マップを使用して、隠しtextareaの位置を特定
  const updateHiddenTextareaPosition = (currentSelIndex: number) => {
    const { cells, rawToGridMap } = gridData;
    let globalGridCellIdx = rawToGridMap[currentSelIndex];
    
    if (globalGridCellIdx === undefined || globalGridCellIdx >= cells.length) {
      globalGridCellIdx = Math.max(0, cells.length - 1);
    }

    const targetPageIdx = Math.floor(globalGridCellIdx / charsPerPage);
    const targetCharIdx = globalGridCellIdx % charsPerPage;

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
  }, [selectionIndex, rawText, gridData]);

  // オートセーブロジック
  useEffect(() => {
    if (!currentFilename) return;

    const timer = setTimeout(async () => {
      try {
        await invoke<string>('save_novel',{
          filename: currentFilename,
          text: rawText
        })
      } catch (error) {
        console.error('【Autosave】自動保存に失敗しました:', error);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [rawText, currentFilename]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawText(e.target.value);
    setSelectionIndex(e.target.selectionStart);
  };

  const handleTextareaSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setSelectionIndex(e.currentTarget.selectionStart);
  };

  // クリックしたマスから正確なインデックスを復元
  const handleCellClick = (pageIdx: number, charIdx: number) => {
    const targetCellGlobalIdx = pageIdx * charsPerPage + charIdx;
    const { cells } = gridData;

    if (targetCellGlobalIdx < cells.length) {
      setSelectionIndex(cells[targetCellGlobalIdx].rawIdx);
    } else {
      setSelectionIndex(rawText.length);
    }
    
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

// 【全ページ一括出力・縦書き括弧完全対応版 PDF出力コード】
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

      // 3. B4用紙サイズ（横364mm × 縦257mm）の基準設計
      const pdfWidth = 364;
      const pdfHeight = 257;
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [pdfWidth, pdfHeight]
      });

      const cellW = 11.5;       // 1マスのヨコ幅（mm）
      const cellH = 10.45;      // 1マスのタテ高
      const gapX = 3.0;         // 列と列の間の隙間
      const centerSpace = 20.0; // 中央の「柱」の幅（mm）
      const rowsPerColumn = 20; // 1列20マス

      const gridTopY = 24.0;    // マス目の最上端のY座標
      const gridBottomY = gridTopY + (rowsPerColumn * cellH);
      const centerX = 20 + (324 / 2); // 182mm

      // ----------------------------------------------------
      // 4. 【全ページをループ処理で1つのPDFに結合流し込み】
      // ----------------------------------------------------
      pagesGridData.forEach((pageData, pageIndex) => {
        // 2ページ目以降の処理の際は、PDFに新しい仮想ページを挿入する
        if (pageIndex > 0) {
          pdf.addPage([pdfWidth, pdfHeight], 'landscape');
        }

        // --- 5. 各ページごとの原稿用紙の枠線・グリッド精密線画 ---
        pdf.setDrawColor(160, 205, 175); // 上品な緑色
        
        // 外枠（二重線）の描画
        pdf.setLineWidth(0.6);
        pdf.rect(20, 20, 324, 217); // 外枠
        pdf.setLineWidth(0.3);
        pdf.rect(21, 21, 322, 215); // 内枠
        
        // 中央の柱（魚尾エリア）の太い縦線
        pdf.setLineWidth(0.5);
        pdf.line(centerX - 10, 21, centerX - 10, 236);
        pdf.line(centerX + 10, 21, centerX + 10, 236);

        // グリッド線（全400マス）の描画
        pdf.setLineWidth(0.15);
        for (let colIndex = 0; colIndex < 20; colIndex++) {
          let startX = 364 - 30; // 右側の余白からスタートして左に進む
          if (colIndex < 10) {
            startX -= colIndex * (cellW + gapX);
          } else {
            startX -= (10 * (cellW + gapX)) + centerSpace + ((colIndex - 10) * (cellW + gapX));
          }

          pdf.line(startX, gridTopY, startX, gridBottomY);
          pdf.line(startX - cellW, gridTopY, startX - cellW, gridBottomY);

          for (let rowIndex = 0; rowIndex <= rowsPerColumn; rowIndex++) {
            const currentY = gridTopY + (rowIndex * cellH);
            pdf.line(startX, currentY, startX - cellW, currentY);
          }
        }

        // --- 6. ページごとのフォント再アクティブ化と文字サイズ設定 ---
        if (fontBase64) {
          pdf.addFileToVFS(`NotoSerifJP-${pageIndex}.ttf`, fontBase64);
          pdf.addFont(`NotoSerifJP-${pageIndex}.ttf`, `NotoSerifJP-${pageIndex}`, "normal");
          pdf.setFont(`NotoSerifJP-${pageIndex}`, "normal");
        } else {
          pdf.setFont("MS Gothic", "normal");
        }
        
        pdf.setFontSize(14.5); 
        pdf.setTextColor(40, 40, 40);

        // --- 7. 【文字流し込み & 縦書き括弧置換・特殊記号補正ロジック】 ---
        pageData.forEach(({ char, }, index) => {
          if (!char || char.trim() === "") return;

          const colIndex = Math.floor(index / rowsPerColumn); // 0 〜 19 列
          const rowIndex = index % rowsPerColumn;             // 0 〜 19 マス

          let startX = 364 - 30;
          if (colIndex < 10) {
            startX -= colIndex * (cellW + gapX);
          } else {
            startX -= (10 * (cellW + gapX)) + centerSpace + ((colIndex - 10) * (cellW + gapX));
          }

          const basePdfX = startX - 8.8;
          const basePdfY = gridTopY + (rowIndex * cellH) + 8.4;

          // 【修正】ぶら下げ（1マスに2文字格納されている場合）の分離対応
          const isBurasage = char.length > 1;
          const firstChar = isBurasage ? char[0] : char;
          const secondChar = isBurasage ? char[1] : '';

          // --- ① 1文字目（通常の文字）の描画処理 ---
          let targetChar = firstChar;
          let offsetX = 0;
          let offsetY = 0;

          // 縦書きの記号・括弧の精密位置補正
          if (firstChar === 'ー' || firstChar === '―' || firstChar === '─' || firstChar === '-') {
            targetChar = '丨'; offsetX = 0.3; offsetY = -0.5;
          } else if (firstChar === '、' || firstChar === '，' || firstChar === '。' || firstChar === '．') {
            offsetX = 4.2; offsetY = -5.0;
          } else if (firstChar === 'っ' || firstChar === 'ゃ' || firstChar === 'ゅ' || firstChar === 'ょ' || 
                     firstChar === 'ッ' || firstChar === 'ャ' || firstChar === 'ュ' || firstChar === 'ョ') {
            offsetX = 1.5; offsetY = -1.2;
          } 
          else if (firstChar === '「') { targetChar = '﹁'; offsetX = 0.0; offsetY = -1.0; }
          else if (firstChar === '」') { targetChar = '﹂'; offsetX = 0.0; offsetY = -1.0; }
          else if (firstChar === '（') { targetChar = '︵'; offsetX = 0.0; offsetY = -1.0; }
          else if (firstChar === '）') { targetChar = '︶'; offsetX = 0.0; offsetY = -1.0; }
          else if (firstChar === '『') { targetChar = '﹃'; offsetX = 0.0; offsetY = -1.0; }
          else if (firstChar === '』') { targetChar = '﹄'; offsetX = 0.0; offsetY = -1.0; }
          else if (firstChar === '【') { targetChar = '︻'; offsetX = 0.0; offsetY = -1.0; }
          else if (firstChar === '】') { targetChar = '︼'; offsetX = 0.0; offsetY = -1.0; }
          else if (firstChar === '〔') { targetChar = '︹'; offsetX = 0.0; offsetY = -1.0; }
          else if (firstChar === '〕') { targetChar = '︺'; offsetX = 0.0; offsetY = -1.0; }

          // 1文字目を描画
          pdf.text(targetChar, basePdfX + offsetX, basePdfY + offsetY);

          // --- ② 2文字目（ぶら下がっている閉じカッコなど）の描画処理 ---
          if (isBurasage) {
            let targetSecondChar = secondChar;
            let secondOffsetX = 0;
            //  1マスの高さ（cellH = 10.45mm）分、下にずらして21マス目の位置（ぶら下げエリア）に描画
            let secondOffsetY = cellH; 

            // ぶら下がった記号の縦書き置換＆位置調整
            if (secondChar === '、' || secondChar === '，' || secondChar === '。' || secondChar === '．') {
              secondOffsetX = 4.2; secondOffsetY += -5.0;
            } else if (secondChar === '」') { 
              targetSecondChar = '﹂'; secondOffsetX = 0.0; secondOffsetY += -1.0; 
            } else if (secondChar === '』') { 
              targetSecondChar = '﹄'; secondOffsetX = 0.0; secondOffsetY += -1.0; 
            } else if (secondChar === '）') { 
              targetSecondChar = '︶'; secondOffsetX = 0.0; secondOffsetY += -1.0; 
            } else if (secondChar === '】') { 
              targetSecondChar = '︼'; secondOffsetX = 0.0; secondOffsetY += -1.0; 
            }

            // ぶら下げ文字（2文字目）を描画
            pdf.text(targetSecondChar, basePdfX + secondOffsetX, basePdfY + secondOffsetY);
          }
        });
        // --- 8. 【新設】左上の余白にページ数を描画する ---
        pdf.setFontSize(10);
        pdf.setTextColor(160, 205, 175); // 控えめなグレー
        //  X=20（外枠の左端）, Y=15（外枠の上側余白）の位置に「1 / 3」のように描画します
        pdf.text(`${pageIndex + 1} / ${paperCount}`, 20, 15);
        
        //  ページ左下にロゴ表示
        pdf.setFontSize(10);
        pdf.setTextColor(160,205,175);
        pdf.text("20×20 Genkoo", 22, 243);

        // --- 8. 中央の柱（魚尾）の飾り文字の描画 ---
        pdf.setFontSize(10);
        pdf.setTextColor(164, 203, 175); 
        pdf.text("▼", centerX - 1.5, 27);
        pdf.text("▲", centerX - 1.5, 233);
        
      });

      // 9. すべてのページが結合されたPDFバイナリをRust経由で保存
      const pdfBase64 = pdf.output('datauristring').split(',')[1];
      await invoke('save_file_binary', { 
        path: selectedPath, 
        base64Data: pdfBase64 
      });
      
      alert("すべてのページが1つに統合され、括弧の向きも縦書き用に完全修正されたPDFが出力されました！");
    } catch (err) {
      console.error("PDF出力エラー:", err);
      alert("PDFの出力に失敗しました: " + err);
    }
  };

  const handleSaveAndNavigate = async () => {
    const targetName = currentFilename || "無題の小説.txt";
    try {
      await invoke<string>('save_novel', { 
        filename: targetName, 
        text: rawText 
      });
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
                    
                    const cellObj = pageChars[charIndex] || { char: '', rawIdx: 0 };
                    const char = cellObj.char;

                    // ✨ 💡 ぶら下げ（2文字格納されている場合）の分離処理
                    const isBurasage = char.length > 1;
                    const displayText = isBurasage ? char[0] : char;
                    const burasageChar = isBurasage ? char[1] : '';

                    let isCaretHere = false;
                    if (isFocused && gridData.rawToGridMap[selectionIndex] === (pageIndex * charsPerPage + charIndex)) {
                      isCaretHere = true;
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
                            fontFamily: '"Noto Serif JP", "MS Mincho", serif',
                            fontSize: '18px',
                            color: '#2c3e50',
                            writingMode: 'vertical-rl',
                            WebkitWritingMode: 'vertical-rl',
                            direction: 'ltr', // ✨ 💡 ① 親の direction: 'rtl' によるカッコ反転現象を完全に防ぐ
                            position: 'relative',
                            userSelect: 'none',
                            overflow: 'visible', 
                          }}
                        >
                          {/* 1文字目（通常の文字）だけをマス内に表示 */}
                          {displayText}

                          {/* ✨ 💡 ② ぶら下げ文字（句読点）をマスの完全に外側（下）に独立して絶対配置 */}
                          {isBurasage && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '27px', // ちょうどマスの高さ分下（21マス目の位置）に突き出す
                                right: '0px',
                                width: '28px',
                                height: '27px',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                writingMode: 'vertical-rl',
                                WebkitWritingMode: 'vertical-rl',
                                direction: 'ltr',
                                fontSize: '18px',
                                color: '#2c3e50',
                                pointerEvents: 'none',
                              }}
                            >
                              {burasageChar}
                            </div>
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

                        {/* 左側のルビススペース（5px） */}
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

      <style>{`
        @keyframes blink {
          from, to { opacity: 0 }
          50% { opacity: 1 }
        }
      `}</style>

      {/* フッターエリア */}
      <div style={{ padding: '0 10px', marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '15px' }} onClick={(e) => e.stopPropagation()}>
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