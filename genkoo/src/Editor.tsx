import React, { useState, useRef, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { jsPDF } from 'jspdf';

interface EditorProps {
  currentFilename: string | null;
  onNavigate: () => void;
}

const KINSOKU_GYOUTOU = "、。」』）】｝っゃゅょッャュョー〜…・？！"; 
const KINSOKU_GYOUMATSU = "「『（【｛〈《〔［";               

// ✨ セルの型定義に、ぶら下げフラグと半角文字列フラグを追加
interface GridCell {
  char: string;
  rawIdx: number;
  isBurasage?: boolean;
  isHalfWidth?: boolean;
}

export const Editor: React.FC<EditorProps> = ({ currentFilename, onNavigate }) => {
  const [rawText, setRawText] = useState<string>("");
  const [selectionIndex, setSelectionIndex] = useState<number>(0);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [activeCellCoords, setActiveCellCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const charsPerPage = 400;

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
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // ========================================================
  // 💡 禁則処理 ＋ 【半角プロポーショナル対応】 精密流し込みロジック
  // ========================================================
  const gridData = useMemo(() => {
    const cells: GridCell[] = [];
    const rawToGridMap: number[] = new Array(rawText.length + 1).fill(0);
    
    const lines = rawText.split('\n');
    let globalRawIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let linePos = 0; 
      let j = 0;

      while (j < line.length) {
        const char = line[j];
        const currentRawIdx = globalRawIdx + j;

        // ✨ 半角英数字・記号の連続を検知してグループ化する処理
        const isHalfWidthAscii = (c: string) => /^[\x20-\x7E]$/.test(c);
        
        if (isHalfWidthAscii(char)) {
          let hwStr = "";
          const startRawIdx = currentRawIdx;
          const remainingCellsInLine = 20 - linePos;
          
          // 1マスに収まる半角文字数の目安（必要に応じて 3.0 などに調整してください）
          const charsPerCell = 2.5; 
          const maxCharsInLine = Math.floor(remainingCellsInLine * charsPerCell);
          
          let count = 0;
          while (j < line.length && isHalfWidthAscii(line[j]) && count < Math.max(1, maxCharsInLine)) {
            hwStr += line[j];
            j++;
            count++;
          }

          // 💡 修正ポイント: Math.ceil から Math.round に変更することで、
          // 少しのはみ出しなら1マスに収め、無駄な空きマスを作らないようにする
          const consumedCells = Math.max(1, Math.round(hwStr.length / charsPerCell));

          // 最初のマスに半角文字列全体を格納
          cells.push({ char: hwStr, rawIdx: startRawIdx, isHalfWidth: true });
          const firstCellIndex = cells.length - 1;
          // ... 以下略
          
          // その文字列に含まれるすべての文字のカーソル位置を最初のマスにマッピング
          for (let k = 0; k < hwStr.length; k++) {
            rawToGridMap[startRawIdx + k] = firstCellIndex;
          }

          linePos++;
          if (linePos === 20) linePos = 0;

          // 視覚的なオーバーフローを許容するため、使用したマス分だけダミーマス（空文字）で埋める
          for (let c = 1; c < consumedCells; c++) {
            cells.push({ char: '', rawIdx: startRawIdx + hwStr.length - 1 });
            linePos++;
            if (linePos === 20) linePos = 0;
          }
          
          continue; 
        }

        // 【行末禁則：追い出し】
        if (linePos === 19 && KINSOKU_GYOUMATSU.includes(char)) {
          cells.push({ char: '', rawIdx: currentRawIdx });
          rawToGridMap[currentRawIdx] = cells.length - 1;
          linePos = 0;
          continue; 
        }

        // 【行頭禁則：ぶら下げ】
        if (linePos === 19 && j + 1 < line.length && KINSOKU_GYOUTOU.includes(line[j + 1])) {
          const nextChar = line[j + 1];
          cells.push({ char: char + nextChar, rawIdx: currentRawIdx, isBurasage: true });
          
          rawToGridMap[currentRawIdx] = cells.length - 1;
          rawToGridMap[currentRawIdx + 1] = cells.length - 1; 
          
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

      // 段落の終わり
      const nextLineRawIdx = globalRawIdx + line.length;
      if (i < lines.length - 1) {
        const remaining = 20 - (linePos % 20);
        const fillCount = remaining === 20 ? 20 : remaining;
        for (let r = 0; r < fillCount; r++) {
          cells.push({ char: '', rawIdx: nextLineRawIdx });
        }
        rawToGridMap[nextLineRawIdx] = cells.length; 
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

  const pagesGridData = useMemo(() => {
    const arr: GridCell[][] = [];
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

  useEffect(() => {
    if (!currentFilename) return;
    const timer = setTimeout(async () => {
      try {
        await invoke<string>('save_novel',{ filename: currentFilename, text: rawText })
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

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const { cells, rawToGridMap } = gridData;
    let currentGridIdx = rawToGridMap[selectionIndex];
    
    if (currentGridIdx === undefined) return;

    let nextGridIdx = currentGridIdx;

    if (e.key === 'ArrowDown') {
      nextGridIdx = Math.min(cells.length - 1, currentGridIdx + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      nextGridIdx = Math.max(0, currentGridIdx - 1);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
      nextGridIdx = Math.min(cells.length - 1, currentGridIdx + 20);
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      nextGridIdx = Math.max(0, currentGridIdx - 20);
      e.preventDefault();
    } else {
      return;
    }

    if (cells[nextGridIdx]) {
      const targetRawIdx = cells[nextGridIdx].rawIdx;
      setSelectionIndex(targetRawIdx);

      if (hiddenTextareaRef.current) {
        hiddenTextareaRef.current.selectionStart = targetRawIdx;
        hiddenTextareaRef.current.selectionEnd = targetRawIdx;
      }
    }
  };

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

  // 【全ページ一括出力・縦書き括弧・半角完全対応版 PDF出力コード】
  const handleExportPDF = async () => {
    try {
      const defaultName = currentFilename ? currentFilename.replace('.txt', '.pdf') : "原稿用紙_出力.pdf";
      const selectedPath = await invoke<string | null>('show_save_dialog', { defaultName });
      
      if (!selectedPath) return;

      let fontBase64 = "";
      try {
        const response = await fetch('/fonts/NotoSerifJP-Regular.ttf');
        if (!response.ok) throw new Error("Font file not found in public/fonts/");
        const blob = await response.blob();
        fontBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]); 
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (fontErr) {
        console.error("フォント読み込み失敗:", fontErr);
        alert("フォントが読み込めませんでした。標準フォントで代用します。");
      }

      const pdfWidth = 364;
      const pdfHeight = 257;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [pdfWidth, pdfHeight] });

      const cellW = 11.5;      
      const cellH = 10.45;     
      const gapX = 3.0;        
      const centerSpace = 20.0;
      const rowsPerColumn = 20;

      const gridTopY = 24.0;   
      const gridBottomY = gridTopY + (rowsPerColumn * cellH);
      const centerX = 20 + (324 / 2); 

      pagesGridData.forEach((pageData, pageIndex) => {
        if (pageIndex > 0) pdf.addPage([pdfWidth, pdfHeight], 'landscape');

        pdf.setDrawColor(160, 205, 175);
        pdf.setLineWidth(0.6);
        pdf.rect(20, 20, 324, 217); 
        pdf.setLineWidth(0.3);
        pdf.rect(21, 21, 322, 215); 
        
        pdf.setLineWidth(0.5);
        pdf.line(centerX - 10, 21, centerX - 10, 236);
        pdf.line(centerX + 10, 21, centerX + 10, 236);

        pdf.setLineWidth(0.15);
        for (let colIndex = 0; colIndex < 20; colIndex++) {
          let startX = 364 - 30; 
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

        if (fontBase64) {
          pdf.addFileToVFS(`NotoSerifJP-${pageIndex}.ttf`, fontBase64);
          pdf.addFont(`NotoSerifJP-${pageIndex}.ttf`, `NotoSerifJP-${pageIndex}`, "normal");
          pdf.setFont(`NotoSerifJP-${pageIndex}`, "normal");
        } else {
          pdf.setFont("MS Gothic", "normal");
        }
        
        pdf.setFontSize(14.5); 
        pdf.setTextColor(40, 40, 40);

        pageData.forEach((cellObj, index) => {
          const char = cellObj.char;
          if (!char || char.trim() === "") return;

          const isBurasage = !!cellObj.isBurasage;
          const isHalfWidth = !!cellObj.isHalfWidth;
          const firstChar = isBurasage ? char[0] : char;
          const secondChar = isBurasage ? char[1] : '';

          const colIndex = Math.floor(index / rowsPerColumn); 
          const rowIndex = index % rowsPerColumn;             

          let startX = 364 - 30;
          if (colIndex < 10) {
            startX -= colIndex * (cellW + gapX);
          } else {
            startX -= (10 * (cellW + gapX)) + centerSpace + ((colIndex - 10) * (cellW + gapX));
          }

          const basePdfX = startX - 8.8;
          const basePdfY = gridTopY + (rowIndex * cellH) + 8.4;

          // ✨ 半角英数字のプロポーショナルPDF出力（90度時計回りに回転）
          if (isHalfWidth) {
            pdf.text(char, basePdfX + 2.5, basePdfY - 4.0, { angle: -90 });
            return;
          }

          let targetChar = firstChar;
          let offsetX = 0;
          let offsetY = 0;

          if (firstChar === 'ー' || firstChar === '―' || firstChar === '─' || firstChar === '-') { targetChar = '丨'; offsetX = 0.3; offsetY = -0.5; } 
          else if (firstChar === '、' || firstChar === '，' || firstChar === '。' || firstChar === '．') { offsetX = 4.2; offsetY = -5.0; } 
          else if (firstChar === 'っ' || firstChar === 'ゃ' || firstChar === 'ゅ' || firstChar === 'ょ' || firstChar === 'ッ' || firstChar === 'ャ' || firstChar === 'ュ' || firstChar === 'ョ') { offsetX = 1.5; offsetY = -1.2; } 
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
          else if (firstChar === '〈') { targetChar = '︿'; offsetX = 0.0; offsetY = -1.0; }
          else if (firstChar === '〉') { targetChar = '﹀'; offsetX = 0.0; offsetY = -1.0; }
          else if (firstChar === '《') { targetChar = '︽'; offsetX = 0.0; offsetY = -1.0; }
          else if (firstChar === '》') { targetChar = '︾'; offsetX = 0.0; offsetY = -1.0; }

          pdf.text(targetChar, basePdfX + offsetX, basePdfY + offsetY);

          if (isBurasage) {
            let targetSecondChar = secondChar;
            let secondOffsetX = 0;
            let secondOffsetY = cellH; 

            if (secondChar === '、' || secondChar === '，' || secondChar === '。' || secondChar === '．') { secondOffsetX = 4.2; secondOffsetY += -5.0; } 
            else if (secondChar === '」') { targetSecondChar = '﹂'; secondOffsetX = 0.0; secondOffsetY += -1.0; } 
            else if (secondChar === '』') { targetSecondChar = '﹄'; secondOffsetX = 0.0; secondOffsetY += -1.0; } 
            else if (secondChar === '）') { targetSecondChar = '︶'; secondOffsetX = 0.0; secondOffsetY += -1.0; } 
            else if (secondChar === '】') { targetSecondChar = '︼'; secondOffsetX = 0.0; secondOffsetY += -1.0; }

            pdf.text(targetSecondChar, basePdfX + secondOffsetX, basePdfY + secondOffsetY);
          }
        });
        
        pdf.setFontSize(10);
        pdf.setTextColor(160, 205, 175); 
        pdf.text(`${pageIndex + 1} / ${paperCount}`, 20, 15);
        pdf.text("20×20 Genkoo", 22, 243);
        pdf.setTextColor(164, 203, 175); 
        pdf.text("▼", centerX - 1.5, 27);
        pdf.text("▲", centerX - 1.5, 233);
      });

      const pdfBase64 = pdf.output('datauristring').split(',')[1];
      await invoke('save_file_binary', { path: selectedPath, base64Data: pdfBase64 });
      
      alert("すべてのページが1つに統合され、括弧の向きも縦書き用に完全修正されたPDFが出力されました！");
    } catch (err) {
      console.error("PDF出力エラー:", err);
      alert("PDFの出力に失敗しました: " + err);
    }
  };

  const handleSaveAndNavigate = async () => {
    const targetName = currentFilename || "無題の小説.txt";
    try {
      await invoke<string>('save_novel', { filename: targetName, text: rawText });
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '0 10px' }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0, color: '#2c3e50', fontSize: '20px' }}>Genkoo エディタ</h2>
        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#34495e' }}>
          文字数：{totalChars}文字 / 原稿用紙：{paperCount}枚
        </div>
      </div>

      <div 
        ref={deskRef}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '50px', overflowY: 'auto', padding: '20px 0', maxHeight: 'calc(100vh - 160px)', position: 'relative' }}
      >
        {pagesGridData.map((pageChars, pageIndex) => {
          return (
            <div 
              key={pageIndex}
              ref={pageIndex === 0 ? paperRef : null}
              onClick={(e) => e.stopPropagation()} 
              style={{ position: 'relative', width: '950px', height: '650px', padding: '52px 0', backgroundColor: '#fffdf9', boxShadow: '0 12px 24px rgba(0,0,0,0.08)', borderRadius: '4px', border: '1px solid #dcdde1', boxSizing: 'border-box', display: 'flex', justifyContent: 'center', cursor: 'text' }}
            >
              <div style={{ position: 'absolute', top: '15px', left: '25px', color: 'rgba(34, 112, 63, 0.5)', fontSize: '12px', fontWeight: 'bold' }}>
                {pageIndex + 1} / {paperCount}
              </div>

              {/* 💡【新設】原稿用紙のロゴ（左下・二重線の枠外すぐ下） */}
              <div style={{
                position: 'absolute',
                bottom: '22px',       // 💡 二重線の枠の下端と綺麗に揃う高さ
                left: '72px',         // 💡 二重線の枠の左端と綺麗に揃う位置
                color: 'rgba(34, 112, 63, 0.4)', // 💡 枠線と同じ緑色（透明度40%）
                fontSize: '11px',
                fontWeight: 'bold',
                fontFamily: 'sans-serif',
                userSelect: 'none',   // テキスト選択の邪魔にならないようにする
                pointerEvents: 'none' // クリックイベントを透過させる
              }}>
                20×20 Genkoo
              </div>

              <div style={{ position: 'relative', width: '808px', height: '546px', border: '3px double rgba(34, 112, 63, 0.7)', backgroundColor: '#fffdf9', boxSizing: 'border-box' }}>
                <div style={{ display: 'grid', gridTemplateRows: 'repeat(20, 27px)', gridTemplateColumns: `repeat(10, 5px 28px 5px) 48px repeat(10, 5px 28px 5px)`, gridAutoFlow: 'column', width: '100%', height: '100%', direction: 'rtl' }}>
                  {Array.from({ length: charsPerPage }).map((_, charIndex) => {
                    const isLeftHalf = charIndex >= 200;
                    const localColumnGroup = Math.floor((charIndex % 200) / 20); 
                    const baseColumnStart = isLeftHalf ? (localColumnGroup * 3) + 31 + 1 : (localColumnGroup * 3) + 1;      
                    const rowIndex = (charIndex % 20) + 1;
                    
                    const cellObj = pageChars[charIndex] || { char: '', rawIdx: 0 };
                    const char = cellObj.char;

                    // ✨ 💡 ぶら下げ・半角文字のフラグ判定
                    const isBurasage = !!cellObj.isBurasage;
                    const isHalfWidth = !!cellObj.isHalfWidth;
                    
                    const displayText = isBurasage ? char[0] : char;
                    const burasageChar = isBurasage ? char[1] : '';

                    let isCaretHere = false;
                    if (isFocused && gridData.rawToGridMap[selectionIndex] === (pageIndex * charsPerPage + charIndex)) {
                      isCaretHere = true;
                    }

                    const cellKey = `${pageIndex}-${charIndex}`;

                    return (
                      <React.Fragment key={charIndex}>
                        <div onClick={() => handleCellClick(pageIndex, charIndex)} style={{ gridColumn: baseColumnStart, gridRow: rowIndex, width: '5px', height: '27px', boxSizing: 'border-box' }} />
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
                            justifyContent: isHalfWidth ? 'flex-start' : 'center', // ✨ 半角の時は上揃えにしてあふれさせる
                            alignItems: 'center',
                            fontFamily: '"Noto Serif JP", "MS Mincho", serif',
                            fontSize: '18px',
                            color: '#2c3e50',
                            writingMode: 'vertical-rl',
                            WebkitWritingMode: 'vertical-rl',
                            direction: 'ltr', 
                            position: 'relative',
                            userSelect: 'none',
                            overflow: 'visible', // ✨ マス目外へのオーバーフローを許可
                          }}
                        >
                          {/* 1文字目 または 半角プロポーショナル文字列の表示 */}
                          {isHalfWidth ? (
                            <span style={{ whiteSpace: 'nowrap', marginTop: '4px' }}>
                              {char}
                            </span>
                          ) : (
                            displayText
                          )}

                          {/* ✨ 💡 ② ぶら下げ文字（句読点）をマスの外側（下）に独立して絶対配置 */}
                          {isBurasage && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '27px', 
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

                          {isCaretHere && (
                            <div style={{ position: 'absolute', top: '2px', left: '4px', right: '4px', height: '2px', backgroundColor: '#22703f', animation: 'blink 1s step-end infinite' }} />
                          )}
                        </div>
                        <div onClick={() => handleCellClick(pageIndex, charIndex)} style={{ gridColumn: baseColumnStart + 2, gridRow: rowIndex, width: '5px', height: '27px', boxSizing: 'border-box' }} />
                      </React.Fragment>
                    );
                  })}

                  <div style={{ gridColumn: 31, gridRow: '1 / span 20', width: '48px', height: '540px', padding: '10px 5px', borderLeft: '1px solid rgba(34, 112, 63, 0.35)', borderRight: '1px solid rgba(34, 112, 63, 0.35)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', color: 'rgba(34, 112, 63, 0.4)', fontSize: '11px', fontWeight: 'bold', userSelect: 'none', backgroundColor: '#fffdf9', boxSizing: 'border-box' }}>
                    <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '8px solid rgba(34, 112, 63, 0.4)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flexGrow: 1, justifyContent: 'center' }}>
                      <div style={{ letterSpacing: '2px' }}>　</div><div>　</div><div style={{ fontSize: '10px', opacity: 0.8 }}>　</div>
                    </div>
                    <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '8px solid rgba(34, 112, 63, 0.4)' }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <textarea
          ref={hiddenTextareaRef}
          value={rawText}
          onChange={handleTextareaChange}
          onSelect={handleTextareaSelect}
          onKeyDown={handleTextareaKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={{ position: 'absolute', top: activeCellCoords ? `${activeCellCoords.top}px` : '0px', left: activeCellCoords ? `${activeCellCoords.left}px` : '0px', width: activeCellCoords ? `${activeCellCoords.width}px` : '28px', height: activeCellCoords ? `${activeCellCoords.height}px` : '27px', opacity: 0, pointerEvents: 'none', zIndex: 1, writingMode: 'vertical-rl', WebkitWritingMode: 'vertical-rl' }}
        />
      </div>

      <style>{`
        @keyframes blink {
          from, to { opacity: 0 }
          50% { opacity: 1 }
        }
      `}</style>

      <div style={{ padding: '0 10px', marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '15px' }} onClick={(e) => e.stopPropagation()}>
        <button 
          onClick={handleExportPDF}
          style={{ padding: '10px 30px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: '#ffffff', color: '#22703f', border: '2px solid #22703f', borderRadius: '6px', transition: 'all 0.2s' }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#eaf4ed'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
        >
          PDFに出力する
        </button>
        <button 
          onClick={handleSaveAndNavigate}
          style={{ padding: '10px 30px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: '#22703f', color: '#fff', border: 'none', borderRadius: '6px', boxShadow: '0 4px 6px rgba(34,112,63,0.15)' }}
        >
          保存して管理画面に戻る
        </button>
      </div>
    </div>
  );
};