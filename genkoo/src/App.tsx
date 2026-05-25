import React, { useState } from 'react';
import { Dashboard } from './Dashboard';
import { Editor } from './Editor';

function App() {
  // 「現在の画面がどちらか」を記録するState（状態）を定義します
  // 初期値は 'dashboard' にしておきます
  const [currentView, setCurrentView] = useState<'dashboard' | 'editor'>('dashboard');

  return (
    <div className="app-container" style={{ minHeight: '100vh', backgroundColor: '#f9f9f9' }}>
      {/* 条件分岐（三項演算子）を使って、
        currentView が 'dashboard' なら <Dashboard /> を、
        そうでなければ（'editor' なら） <Editor /> を画面に表示します。
      */}
      {currentView === 'dashboard' ? (
        <Dashboard onNavigate={() => setCurrentView('editor')} />
      ) : (
        <Editor onNavigate={() => setCurrentView('dashboard')} />
      )}
    </div>
  );
}

export default App;