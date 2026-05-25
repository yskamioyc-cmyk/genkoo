import React from 'react';

// この画面を外から呼び出せるように定義します（コンポーネント）
export const Dashboard: React.FC<{ onNavigate: () => void }> = ({ onNavigate }) => {
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>管理画面（Dashboard）</h2>
      <p>保存済み・編集可能なテキストファイルの一覧がここに並びます。</p>
      
      {/* クリックしたらエディタ画面に移動するボタン */}
      <button 
        onClick={onNavigate} 
        style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
      >
        新しい原稿を書く（エディタを開く）
      </button>
    </div>
  );
};