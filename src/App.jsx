import { useState, useEffect, useCallback } from 'react';
import {
  initialUsers,
  initialShifts,
  initialRequests,
  initialApproved,
  initialSales
} from './data';

const load = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const save = (key, v) => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
};

const groups = ['店長', 'キッチン', 'ホール'];
const days = Array.from({ length: 15 }, (_, i) => i + 1);

// ── Helpers for new Excel-like layout ──
function parseShiftForNewLayout(val) {
  if (!val || val === '/' || val === '-') return null;
  const parts = val.split('-');
  if (parts.length !== 2) return null;
  const s = parseFloat(parts[0]);
  const e = parts[1] === 'L' ? 22 : parseFloat(parts[1]);
  if (isNaN(s) || isNaN(e)) return null;
  if (e <= 16) return { Ls: s, Le: e, Ds: null, De: null };
  if (s >= 16) return { Ls: null, Le: null, Ds: s, De: e };
  return { Ls: s, Le: 15, Ds: 16, De: e };
}

function parseManagerShift(val) {
  if (!val || val === '/' || val === '-') return null;
  const parts = val.split('-');
  if (parts.length !== 2) return null;
  return { start: parts[0], end: parts[1] === 'L' ? '22' : parts[1] };
}

function getKohoCount(userId, targetDay, shifts, daysList) {
  const userShifts = shifts[userId]?.shifts || {};
  let count = 0;
  for (const d of daysList) {
    if (d >= targetDay) break;
    const v = userShifts[d];
    if (!v || v === '/' || v === '-') count++;
  }
  return count + 1;
}

function getDayOfWeek(day) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day).getDay();
}

function sumDays(daysList, fn) {
  let s = 0;
  for (const d of daysList) s += fn(d) || 0;
  return s;
}

const WEEK1 = days.slice(0, 7);
const WEEK2 = days.slice(7);

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loginStep, setLoginStep] = useState('select');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [users, setUsers] = useState(() => load('su', initialUsers));
  const [shifts, setShifts] = useState(() => load('sd', initialShifts));
  const [requests, setRequests] = useState(() => load('sr', initialRequests));
  const [approved, setApproved] = useState(() => load('sa', initialApproved));
  const [sales, setSales] = useState(() => load('ss', initialSales));

  // NEW: 製麺アサイン / 午前不足/午後不足 / 売上昼ディナー
  const [seimen, setSeimen] = useState(() => load('sm', {}));
  const [shortageAM, setShortageAM] = useState(() => load('sham', {}));
  const [shortagePM, setShortagePM] = useState(() => load('shpm', {}));
  const [salesLunch, setSalesLunch] = useState(() => load('slu', {}));
  const [salesDinner, setSalesDinner] = useState(() => load('sdi', {}));

  const [viewMode, setViewMode] = useState('employee');
  const [activeTab, setActiveTab] = useState('calendar');
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingSales, setEditingSales] = useState(null);
  const [newUserForm, setNewUserForm] = useState({ name: '', pin: '', group: 'ホール' });
  const [requestForms, setRequestForms] = useState({});
  const [showCellModal, setShowCellModal] = useState(null);

  useEffect(() => { save('su', users); }, [users]);
  useEffect(() => { save('sd', shifts); }, [shifts]);
  useEffect(() => { save('sr', requests); }, [requests]);
  useEffect(() => { save('sa', approved); }, [approved]);
  useEffect(() => { save('ss', sales); }, [sales]);
  useEffect(() => { save('sm', seimen); }, [seimen]);
  useEffect(() => { save('sham', shortageAM); }, [shortageAM]);
  useEffect(() => { save('shpm', shortagePM); }, [shortagePM]);
  useEffect(() => { save('slu', salesLunch); }, [salesLunch]);
  useEffect(() => { save('sdi', salesDinner); }, [salesDinner]);

  const usersByGroup = {};
  groups.forEach(g => { usersByGroup[g] = users.filter(u => u.group === g); });

  // ── ログイン ──
  const handleSelectUser = (e) => {
    const id = e.target.value;
    setSelectedUserId(id);
    setPinInput('');
    setLoginError('');
    if (id) setLoginStep('pin');
  };

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pinInput)) { setLoginError('4桁の数字を入力してください'); return; }
    const user = users.find(u => u.id === parseInt(selectedUserId));
    if (user && user.pin === pinInput) {
      setCurrentUser(user);
      setLoginStep('select');
      setSelectedUserId('');
      setPinInput('');
      setLoginError('');
    } else {
      setLoginError('PINコードが間違っています');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setLoginStep('select');
    setSelectedUserId('');
    setPinInput('');
    setViewMode('employee');
    setActiveTab('calendar');
  };

  const goBackToSelect = () => {
    setLoginStep('select');
    setSelectedUserId('');
    setPinInput('');
    setLoginError('');
  };

  // ── ユーザー管理 ──
  const handleAddUser = (e) => {
    e.preventDefault();
    if (users.find(u => u.name === newUserForm.name)) { alert('同名のユーザーが既にいます'); return; }
    const newId = Math.max(...users.map(u => u.id), 0) + 1;
    setUsers([...users, { id: newId, name: newUserForm.name, pin: newUserForm.pin, group: newUserForm.group, role: 'staff' }]);
    setShifts({ ...shifts, [newId]: { name: newUserForm.name, shifts: {} } });
    setNewUserForm({ name: '', pin: '', group: 'ホール' });
    setShowUserModal(false);
  };

  const handleDeleteUser = (uid) => {
    if (!window.confirm('本当に削除しますか？')) return;
    setUsers(users.filter(u => u.id !== uid));
    const s = { ...shifts }; delete s[uid]; setShifts(s);
  };

  const handleChangePin = (uid, newPin) => {
    if (!/^\d{4}$/.test(newPin)) { alert('4桁の数字を入力してください'); return; }
    setUsers(users.map(u => u.id === uid ? { ...u, pin: newPin } : u));
  };

  // ── シフト希望 ──
  const handleRequestSubmit = (day) => {
    if (!currentUser) return;
    const f = requestForms[day];
    if (!f || !f.start || !f.end) return;
    const key = `${currentUser.id}-${day}`;
    setRequests({ ...requests, [key]: { userId: currentUser.id, userName: currentUser.name, day, start: f.start, end: f.end, timestamp: new Date().toISOString() } });
    setRequestForms({ ...requestForms, [day]: { start: '', end: '' } });
  };

  const handleDeleteRequest = (day) => {
    if (!currentUser) return;
    const r = { ...requests }; delete r[`${currentUser.id}-${day}`]; setRequests(r);
  };

  // ── 店長アクション ──
  const handleCellClick = (userId, day) => {
    if (!isManager) return;
    const cellVal = shifts[userId]?.shifts?.[day];
    setShowCellModal({ userId, day, currentVal: cellVal || '/' });
  };

  const handleCellApprove = (start, end) => {
    if (!showCellModal) return;
    const { userId, day } = showCellModal;
    const newVal = `${start}-${end}`;
    const userShifts = shifts[userId]?.shifts || {};
    setShifts({ ...shifts, [userId]: { ...shifts[userId], shifts: { ...userShifts, [day]: newVal } } });
    const ak = `${userId}-${day}`; const aa = { ...approved, [ak]: { userId, day, shift: newVal, approvedAt: new Date().toISOString() } };
    setApproved(aa);
    const r = { ...requests }; delete r[ak]; setRequests(r);
    setShowCellModal(null);
  };

  const handleCellReject = () => {
    if (!showCellModal) return;
    const { userId, day } = showCellModal;
    const userShifts = shifts[userId]?.shifts || {};
    setShifts({ ...shifts, [userId]: { ...shifts[userId], shifts: { ...userShifts, [day]: '-' } } });
    const rk = `${userId}-${day}-rejected`; const aa = { ...approved, [rk]: { userId, day, shift: '-', rejectedAt: new Date().toISOString() } };
    setApproved(aa);
    const r = { ...requests }; delete r[`${userId}-${day}`]; setRequests(r);
    setShowCellModal(null);
  };

  const handleCellClear = () => {
    if (!showCellModal) return;
    const { userId, day } = showCellModal;
    const userShifts = shifts[userId]?.shifts || {};
    const s = { ...shifts, [userId]: { ...shifts[userId], shifts: { ...userShifts } } };
    delete s[userId].shifts[day];
    setShifts(s);
    setShowCellModal(null);
  };

  // ── 売上 ──
  const handleSaveSales = (day) => {
    setSales({ ...sales, [day]: editingSales === day ? { ...sales[day] } : {} });
    setEditingSales(null);
  };

  // ── 計算 ──
  const calculateHours = useCallback((shift) => {
    if (!shift || shift === '-' || shift === '/') return 0;
    const parts = shift.split('-');
    if (parts.length !== 2) return 0;
    const s = parseFloat(parts[0]);
    let e = parts[1] === 'L' ? 22 : parseFloat(parts[1]);
    if (isNaN(s) || isNaN(e)) return 0;
    return e - s;
  }, []);

  const getManagerBreakHours = useCallback(() => {
    const manager = users.find(u => u.role === 'manager');
    if (!manager) return 0;
    const mShifts = shifts[manager.id]?.shifts || {};
    let breakDays = 0;
    days.forEach(d => {
      const v = mShifts[d];
      if (v && v !== '-' && v !== '/') breakDays++;
    });
    return breakDays * 1.5;
  }, [users, shifts]);

  const getDailyStatsRaw = useCallback((day) => {
    let h = 0, c = 0;
    Object.values(shifts).forEach(u => {
      const v = u.shifts[day];
      if (v && v !== '-' && v !== '/') { h += calculateHours(v); c++; }
    });
    return { totalHours: h, staffCount: c };
  }, [shifts, calculateHours]);

  const getDailyStats = useCallback((day) => {
    const raw = getDailyStatsRaw(day);
    const manager = users.find(u => u.role === 'manager');
    const mShifts = manager ? shifts[manager.id]?.shifts || {} : {};
    const mVal = mShifts[day];
    const managerWorks = mVal && mVal !== '-' && mVal !== '/';
    const breakH = managerWorks ? 1.5 : 0;
    return { totalHours: raw.totalHours - breakH, staffCount: raw.staffCount, managerBreak: breakH, rawHours: raw.totalHours };
  }, [getDailyStatsRaw, users, shifts]);

  const getMonthlyStats = useCallback(() => {
    let h = 0, d = 0, brk = 0;
    days.forEach(day => {
      const { totalHours, managerBreak } = getDailyStats(day);
      h += totalHours;
      brk += managerBreak;
      if (totalHours > 0 || managerBreak > 0) d++;
    });
    return { totalHours: h, totalDays: d, totalManagerBreak: brk };
  }, [getDailyStats]);

  const isManager = currentUser?.role === 'manager';
  const monthlyStats = currentUser ? getMonthlyStats() : { totalHours: 0, totalDays: 0, totalManagerBreak: 0 };

  const getDaySalesData = (day) => {
    const ds = sales[day] || {};
    const currentSales = ds.current || 0;
    const { totalHours, rawHours } = getDailyStats(day);
    const apHours = rawHours;
    const laborSalesRatio = apHours > 0 ? currentSales / apHours : 0;
    return { sales: currentSales, apHours, laborSalesRatio };
  };

  // キッチン・ホールの順序
  const kitchenUsers = users.filter(u => u.group === 'キッチン');
  const hallUsers = users.filter(u => u.group === 'ホール');

  // ── ログイン画面 ──
  if (!currentUser) {
    const selectedUser = selectedUserId ? users.find(u => u.id === parseInt(selectedUserId)) : null;
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">📋</div>
            <h1 className="text-2xl font-bold text-gray-900">シフト管理</h1>
            <p className="text-gray-500 text-sm mt-1">ログインしてください</p>
          </div>
          {loginStep === 'select' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名前を選択</label>
                <select value={selectedUserId} onChange={handleSelectUser} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm bg-white appearance-none">
                  <option value="">-- 選択してください --</option>
                  {groups.map(group => {
                    const gUsers = usersByGroup[group];
                    if (gUsers.length === 0) return null;
                    return (<optgroup key={group} label={`◆ ${group}`}>
                      {gUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </optgroup>);
                  })}
                </select>
              </div>
              <div className="text-xs text-gray-400 text-center">続いてPINコードを入力します→→</div>
            </div>
          ) : (
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-sm text-gray-500">選択中</div>
                <div className="text-lg font-bold text-gray-900">{selectedUser?.name}</div>
                <div className="text-xs text-gray-400">{selectedUser?.group}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PINコード（4桁）</label>
                <input type="password" inputMode="numeric" maxLength={4} value={pinInput} onChange={e => { setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setLoginError(''); }} className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-[0.5em]" placeholder="・ ・ ・ ・" autoFocus required />
              </div>
              {loginError && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm text-center">{loginError}</div>}
              <button type="submit" disabled={pinInput.length !== 4} className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors">ログイン</button>
              <button type="button" onClick={goBackToSelect} className="w-full text-sm text-gray-500 hover:text-gray-700">戻る</button>
            </form>
          )}
          <div className="mt-6 p-3 bg-gray-50 rounded-xl text-xs text-gray-500">
            <p className="mb-1">テスト用PIN:</p>
            <p>店長: 1111 / スタッフ: 0000</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900">シフト管理</h1>
              <p className="text-xs text-gray-500">
                {currentUser.name}
                {isManager && <span className="ml-2 bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px]">店長</span>}
                <span className="ml-2 text-gray-400">{currentUser.group}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              {isManager && (
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-medium ${viewMode === 'employee' ? 'text-blue-600' : 'text-gray-400'}`}>スタッフ用</span>
                  <button onClick={() => setViewMode(viewMode === 'employee' ? 'manager' : 'employee')} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${viewMode === 'manager' ? 'bg-blue-600' : 'bg-gray-300'}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${viewMode === 'manager' ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                  </button>
                  <span className={`text-[10px] font-medium ${viewMode === 'manager' ? 'text-blue-600' : 'text-gray-400'}`}>部長提出用</span>
                </div>
              )}
              <button onClick={handleLogout} className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">ログアウト</button>
            </div>
          </div>
        </div>
      </header>

      {isManager && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-700">
          <span className="font-medium">🔧 店長モード</span> 表のセルをクリックして採用・不採用、製麺・不足・売上を編集できます
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex flex-wrap gap-1.5 mb-4">
          <TabBtn active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')}>シフト表</TabBtn>
          {!isManager && <TabBtn active={activeTab === 'request'} onClick={() => setActiveTab('request')}>シフト提出</TabBtn>}
          {isManager && <>
            <TabBtn active={activeTab === 'approval'} onClick={() => setActiveTab('approval')}>シフト承認{Object.keys(requests).length > 0 && <span className="ml-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{Object.keys(requests).length}</span>}</TabBtn>
            <TabBtn active={activeTab === 'users'} onClick={() => setActiveTab('users')}>ユーザー管理</TabBtn>
            <TabBtn active={activeTab === 'sales'} onClick={() => setActiveTab('sales')}>売上管理</TabBtn>
          </>}
        </div>

        {activeTab === 'calendar' && (
          <ShiftTableView
            users={users}
            shifts={shifts}
            days={days}
            viewMode={viewMode}
            isManager={isManager}
            sales={sales}
            getDailyStats={getDailyStats}
            getDaySalesData={getDaySalesData}
            handleCellClick={handleCellClick}
            kitchenUsers={kitchenUsers}
            hallUsers={hallUsers}
            seimen={seimen}
            setSeimen={setSeimen}
            shortageAM={shortageAM}
            setShortageAM={setShortageAM}
            shortagePM={shortagePM}
            setShortagePM={setShortagePM}
            salesLunch={salesLunch}
            setSalesLunch={setSalesLunch}
            salesDinner={salesDinner}
            setSalesDinner={setSalesDinner}
          />
        )}

        {/* ── シフト提出 ── */}
        {activeTab === 'request' && !isManager && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-2">シフト希望を提出</h2>
              <p className="text-xs text-gray-500 mb-4">各日の開始時間と終了時間を自由に入力してください。</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {days.map(day => {
                  const key = `${currentUser.id}-${day}`;
                  const req = requests[key];
                  const app = shifts[currentUser.id]?.shifts[day];
                  const isApproved = app && app !== '-';
                  const isRejected = app === '-';
                  const f = requestForms[day] || { start: '', end: '' };
                  return (
                    <div key={day} className={`border rounded-xl p-3 ${isApproved ? 'bg-blue-50 border-blue-200' : isRejected ? 'bg-red-50 border-red-200' : req ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
                      <div className="text-sm font-bold text-gray-700 mb-2">{day}日</div>
                      {isApproved ? (
                        <div className="text-xs text-blue-700 font-medium text-center py-2">✅ {app}</div>
                      ) : isRejected ? (
                        <div className="text-xs text-red-600 text-center py-2">❌ 不採用</div>
                      ) : req ? (
                        <div className="space-y-1">
                          <div className="text-xs text-green-700 font-medium">{req.start} → {req.end}</div>
                          <button onClick={() => handleDeleteRequest(day)} className="text-[10px] text-red-500 hover:text-red-700">取り消す</button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex gap-1">
                            <input type="text" inputMode="numeric" placeholder="開始" value={f.start} onChange={e => setRequestForms({ ...requestForms, [day]: { ...f, start: e.target.value.replace(/[^0-9.]/g, '') } })} className="w-1/2 px-2 py-1.5 border rounded-lg text-xs text-center" />
                            <span className="text-xs text-gray-400 self-center">→</span>
                            <input type="text" inputMode="numeric" placeholder="終了" value={f.end} onChange={e => setRequestForms({ ...requestForms, [day]: { ...f, end: e.target.value.replace(/[^0-9.Ll]/g, '').toUpperCase() } })} className="w-1/2 px-2 py-1.5 border rounded-lg text-xs text-center" />
                          </div>
                          <button onClick={() => handleRequestSubmit(day)} disabled={!f.start || !f.end} className="w-full bg-blue-600 text-white py-1.5 rounded-lg text-[11px] font-medium hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400">提出</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── シフト承認 ── */}
        {activeTab === 'approval' && isManager && (
          <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">シフト承認</h2>
            {Object.keys(requests).length === 0 ? (
              <p className="text-gray-400 text-sm">承認待ちの希望はありません</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(requests).map(([key, r]) => (
                  <div key={key} className="border rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <div className="font-medium text-gray-900 text-sm">{r.userName} — {r.day}日</div>
                      <div className="text-xs text-gray-500">希望: {r.start} → {r.end}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleCellApprove(r.start, r.end)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">採用</button>
                      <button onClick={() => {
                        const s = shifts[r.userId]?.shifts || {};
                        setShifts({ ...shifts, [r.userId]: { ...shifts[r.userId], shifts: { ...s, [r.day]: '-' } } });
                        const rk = `${r.userId}-${r.day}-rejected`;
                        setApproved({ ...approved, [rk]: { userId: r.userId, day: r.day, shift: '-', rejectedAt: new Date().toISOString() } });
                        const nr = { ...requests }; delete nr[key]; setRequests(nr);
                      }} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700">不採用</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ユーザー管理 ── */}
        {activeTab === 'users' && isManager && (
          <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-semibold text-gray-900">ユーザー管理</h2>
              <button onClick={() => setShowUserModal(true)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">追加</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead><tr className="bg-gray-50">
                  <th className="px-3 py-2 text-left font-medium text-gray-500 border-b">名前</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 border-b">グループ</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 border-b">PIN</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 border-b">操作</th>
                </tr></thead>
                <tbody>
                  {users.filter(u => u.role !== 'manager').map(u => (
                    <tr key={u.id} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-800">{u.name}</td>
                      <td className="px-3 py-2 text-gray-500">{u.group}</td>
                      <td className="px-3 py-2">
                        <input type="text" maxLength={4} id={`pin-${u.id}`} defaultValue={u.pin} className="w-16 px-1.5 py-1 border rounded text-center text-xs" />
                        <button onClick={() => handleChangePin(u.id, document.getElementById(`pin-${u.id}`).value)} className="ml-1 text-blue-600 hover:text-blue-800 text-[10px]">変更</button>
                      </td>
                      <td className="px-3 py-2"><button onClick={() => handleDeleteUser(u.id)} className="text-red-500 hover:text-red-700 text-[10px]">削除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 売上管理 ── */}
        {activeTab === 'sales' && isManager && (
          <SalesView
            days={days}
            sales={sales}
            setSales={setSales}
            editingSales={editingSales}
            setEditingSales={setEditingSales}
            handleSaveSales={handleSaveSales}
            monthlyStats={monthlyStats}
            getManagerBreakHours={getManagerBreakHours}
            getMonthlyStats={getMonthlyStats}
            users={users}
            isManager={isManager}
            shifts={shifts}
            kitchenUsers={kitchenUsers}
            hallUsers={hallUsers}
            seimen={seimen}
            setSeimen={setSeimen}
            shortageAM={shortageAM}
            setShortageAM={setShortageAM}
            shortagePM={shortagePM}
            setShortagePM={setShortagePM}
            salesLunch={salesLunch}
            setSalesLunch={setSalesLunch}
            salesDinner={salesDinner}
            setSalesDinner={setSalesDinner}
          />
        )}
      </main>

      {/* ── セル編集モーダル ── */}
      {showCellModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xs">
            <h3 className="text-base font-semibold text-gray-900 mb-1">シフトセル編集</h3>
            <p className="text-xs text-gray-500 mb-4">
              {users.find(u => u.id === showCellModal.userId)?.name} — {showCellModal.day}日
            </p>
            {showCellModal.currentVal === '-' ? (
              <div className="space-y-3">
                <div className="bg-red-50 rounded-xl p-3 text-center text-sm text-red-600 font-medium">現在: 不採用 (-)</div>
                <button onClick={handleCellClear} className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200">クリアする</button>
              </div>
            ) : showCellModal.currentVal !== '/' ? (
              <div className="space-y-3">
                <div className="bg-blue-50 rounded-xl p-3 text-center text-sm text-blue-700 font-medium">現在: {showCellModal.currentVal}</div>
                <button onClick={handleCellReject} className="w-full bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-700">不採用にする</button>
                <button onClick={handleCellClear} className="w-full bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200">クリアする</button>
              </div>
            ) : (
              <CellEditForm onApprove={handleCellApprove} onReject={handleCellReject} />
            )}
            <button onClick={() => setShowCellModal(null)} className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600">キャンセル</button>
          </div>
        </div>
      )}

      {/* ── ユーザー追加モーダル ── */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-4">ユーザー追加</h3>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div><label className="block text-xs font-medium text-gray-700 mb-1">名前</label><input type="text" value={newUserForm.name} onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })} className="w-full px-3 py-2 border rounded-xl text-sm" required /></div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">PIN（4桁）</label><input type="text" maxLength={4} value={newUserForm.pin} onChange={e => setNewUserForm({ ...newUserForm, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-full px-3 py-2 border rounded-xl text-sm text-center" required /></div>
              <div><label className="block text-xs font-medium text-gray-700 mb-1">グループ</label>
                <select value={newUserForm.group} onChange={e => setNewUserForm({ ...newUserForm, group: e.target.value })} className="w-full px-3 py-2 border rounded-xl text-sm">
                  {groups.filter(g => g !== '店長').map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowUserModal(false)} className="flex-1 px-3 py-2 border rounded-xl text-sm text-gray-700 hover:bg-gray-50">キャンセル</button>
                <button type="submit" className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">追加</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── シフト表コンポーネント ──
function ShiftTableView({
  users, shifts, days, viewMode, isManager, sales,
  getDailyStats, getDaySalesData, handleCellClick,
  kitchenUsers, hallUsers,
  seimen, setSeimen,
  shortageAM, setShortageAM,
  shortagePM, setShortagePM,
  salesLunch, setSalesLunch,
  salesDinner, setSalesDinner,
}) {
  const showManagerFormat = viewMode === 'manager';
  const allStaff = users.filter(u => u.role !== 'manager');
  const managerUser = users.find(u => u.role === 'manager');

  const dayInfo = days.map(d => ({ d, dow: getDayOfWeek(d) }));
  const w1 = days.slice(0, 7), w2 = days.slice(7);

  // ── Employee mode (old compact style) ──
  if (!showManagerFormat) {
    return (
      <div className="bg-white border border-gray-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 px-1.5 py-1 text-left text-[9px] font-medium text-gray-500 border border-gray-300 min-w-[75px]">氏名</th>
                {days.map(d => <th key={d} className="px-1 py-1 text-center text-[9px] font-medium text-gray-500 border border-gray-300 w-[52px]">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {managerUser && <StaffRowOld user={managerUser} shifts={shifts} days={days} isManager={isManager} handleCellClick={handleCellClick} />}
              <tr><td colSpan={days.length + 1} className="px-1.5 py-0.5 text-[9px] font-bold text-gray-500 bg-gray-100 border border-gray-300">キッチン</td></tr>
              {kitchenUsers.map(u => <StaffRowOld key={u.id} user={u} shifts={shifts} days={days} isManager={isManager} handleCellClick={handleCellClick} />)}

              {/* 製麺 + 不足 + 売上行 (employee view, inline) */}
              <tr className="bg-indigo-50">
                <td className="sticky left-0 z-10 px-1.5 py-1 text-[9px] font-bold text-indigo-700 border border-gray-300 bg-indigo-50 whitespace-nowrap">🍜 製麺</td>
                {days.map(d => {
                  const val = seimen[d] || '';
                  return <td key={d} className="px-0.5 py-0.5 text-center border border-gray-300 bg-indigo-50">
                    {isManager ? (
                      <select value={val} onChange={e => setSeimen({ ...seimen, [d]: e.target.value })} className="w-full text-[9px] px-0.5 py-0.5 border border-gray-300 rounded bg-white">
                        <option value="">-</option>
                        {allStaff.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                      </select>
                    ) : <span className="text-[9px] font-bold text-indigo-700">{val || '/'}</span>}
                  </td>;
                })}
              </tr>
              <tr className="bg-red-50">
                <td className="sticky left-0 z-10 px-1.5 py-1 text-[9px] font-bold text-red-700 border border-gray-300 bg-red-50 whitespace-nowrap">☀ 午前不足</td>
                {days.map(d => {
                  const val = shortageAM[d];
                  return <td key={d} className="px-0.5 py-0.5 text-center border border-gray-300 bg-red-50">
                    {isManager ? <input type="number" value={val ?? ''} onChange={e => setShortageAM({ ...shortageAM, [d]: e.target.value === '' ? undefined : parseInt(e.target.value) })} className="w-full text-[9px] px-0.5 py-0.5 border border-gray-300 rounded bg-white text-center font-bold" />
                    : <span className="text-[9px] font-bold text-red-600">{val != null ? val : '-'}</span>}
                  </td>;
                })}
              </tr>
              <tr className="bg-orange-50">
                <td className="sticky left-0 z-10 px-1.5 py-1 text-[9px] font-bold text-orange-700 border border-gray-300 bg-orange-50 whitespace-nowrap">🌅 午後不足</td>
                {days.map(d => {
                  const val = shortagePM[d];
                  return <td key={d} className="px-0.5 py-0.5 text-center border border-gray-300 bg-orange-50">
                    {isManager ? <input type="number" value={val ?? ''} onChange={e => setShortagePM({ ...shortagePM, [d]: e.target.value === '' ? undefined : parseInt(e.target.value) })} className="w-full text-[9px] px-0.5 py-0.5 border border-gray-300 rounded bg-white text-center font-bold" />
                    : <span className="text-[9px] font-bold text-orange-600">{val != null ? val : '-'}</span>}
                  </td>;
                })}
              </tr>

              <tr><td colSpan={days.length + 1} className="px-1.5 py-0.5 text-[9px] font-bold text-gray-500 bg-gray-100 border border-gray-300">ホール</td></tr>
              {hallUsers.map(u => <StaffRowOld key={u.id} user={u} shifts={shifts} days={days} isManager={isManager} handleCellClick={handleCellClick} />)}

              {/* 売上 rows */}
              <tr className="bg-cyan-50">
                <td className="sticky left-0 z-10 px-1.5 py-1 text-[9px] font-bold text-cyan-700 border border-gray-300 bg-cyan-50 whitespace-nowrap">💰 売上 昼</td>
                {days.map(d => {
                  const v = salesLunch[d] || { main: '', sub: '' };
                  return <td key={d} className="px-0.5 py-0.5 text-center border border-gray-300 bg-cyan-50">
                    {isManager ? <div className="flex flex-col items-center gap-0"><input type="number" value={v.main} onChange={e => setSalesLunch({ ...salesLunch, [d]: { ...v, main: e.target.value } })} className="w-full text-[9px] px-0.5 py-0 border border-gray-300 rounded bg-white text-center font-medium" placeholder="予測" /><input type="number" value={v.sub} onChange={e => setSalesLunch({ ...salesLunch, [d]: { ...v, sub: e.target.value } })} className="w-full text-[8px] px-0.5 py-0 border border-gray-300 rounded bg-white text-center text-gray-500" placeholder="(実績)" /></div>
                    : <span className="text-[9px] font-medium text-cyan-700">{v.main || '-'}{v.sub ? ` (${v.sub})` : ''}</span>}
                  </td>;
                })}
              </tr>
              <tr className="bg-blue-50">
                <td className="sticky left-0 z-10 px-1.5 py-1 text-[9px] font-bold text-blue-700 border border-gray-300 bg-blue-50 whitespace-nowrap">🌙 売上 ディナー</td>
                {days.map(d => {
                  const v = salesDinner[d] || { main: '', sub: '' };
                  return <td key={d} className="px-0.5 py-0.5 text-center border border-gray-300 bg-blue-50">
                    {isManager ? <div className="flex flex-col items-center gap-0"><input type="number" value={v.main} onChange={e => setSalesDinner({ ...salesDinner, [d]: { ...v, main: e.target.value } })} className="w-full text-[9px] px-0.5 py-0 border border-gray-300 rounded bg-white text-center font-medium" placeholder="予測" /><input type="number" value={v.sub} onChange={e => setSalesDinner({ ...salesDinner, [d]: { ...v, sub: e.target.value } })} className="w-full text-[8px] px-0.5 py-0 border border-gray-300 rounded bg-white text-center text-gray-500" placeholder="(実績)" /></div>
                    : <span className="text-[9px] font-medium text-blue-700">{v.main || '-'}{v.sub ? ` (${v.sub})` : ''}</span>}
                  </td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-2 py-1 border-t border-gray-300 text-[9px] text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
          <span><span className="text-gray-300 font-light">/</span> = 未提出</span>
          <span><span className="text-red-400 font-bold">-</span> = 不採用</span>
          <span><span className="text-blue-600 font-bold">09─22</span> = 採用</span>
        </div>
      </div>
    );
  }

  // ── Manager mode: Excel-like layout ──
  const totalCols = 1 + days.length + 1 + 6;

  return (
    <div className="bg-white border border-gray-300 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: '10px' }}>
          <thead>
            {/* Header row: day numbers + DOW + 前半合計 + green weekly sub-headers */}
            <tr className="bg-gray-50">
              <th rowSpan={2} className="sticky left-0 z-10 bg-gray-50 px-1.5 py-0.5 text-left font-medium text-gray-500 border border-gray-300 min-w-[75px]">氏名</th>
              {dayInfo.map(({ d, dow }) => {
                const bg = dow === 0 ? 'bg-red-100' : dow === 6 ? 'bg-blue-100' : 'bg-green-100';
                return <th key={d} className={`px-0.5 py-0.5 text-center font-medium text-gray-700 border border-gray-300 ${bg} w-[52px]`}>
                  <div className="text-[9px]">{d}</div>
                  <div className={`text-[8px] ${dow === 0 ? 'text-red-600' : dow === 6 ? 'text-blue-600' : 'text-green-700'}`}>{['日','月','火','水','木','金','土'][dow]}</div>
                </th>;
              })}
              <th rowSpan={2} className="px-1 py-0.5 text-center font-medium text-gray-500 border border-gray-300 w-[52px]">前半<br/>合計</th>
              <th colSpan={3} className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300 w-[55px]">第1週</th>
              <th colSpan={3} className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300 w-[55px]">第2週</th>
            </tr>
            <tr className="bg-green-50">
              {['売上','時間','人時'].map(h => <th key={h} className="px-0.5 py-0.5 text-center font-medium text-green-700 bg-green-100 border border-gray-300 text-[8px] w-[55px]">{h}</th>)}
              {['売上','時間','人時'].map(h => <th key={h} className="px-0.5 py-0.5 text-center font-medium text-green-700 bg-green-100 border border-gray-300 text-[8px] w-[55px]">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {/* ── KPI rows ── */}
            <KpiRow label="売上予測(千円)" days={days} w1={w1} w2={w2} fn={d => (sales[d]?.current || 0) / 1000} getDailyStats={getDailyStats} />
            <KpiRow label="前年売上" days={days} w1={w1} w2={w2} fn={d => sales[d]?.prevYear || 0} getDailyStats={getDailyStats} />
            <KpiRow label="前年比(%)" days={days} w1={w1} w2={w2} fn={d => { const p = sales[d]?.prevYear; const c = sales[d]?.current; return (p && p > 0) ? ((c - p) / p * 100).toFixed(1) : '-'; }} getDailyStats={getDailyStats} isRatio />
            <KpiRow label="前年ﾗﾝﾁ売上" days={days} w1={w1} w2={w2} fn={d => sales[d]?.prevYearLunch || 0} getDailyStats={getDailyStats} />
            <KpiRow label="前年ﾃﾞｨﾅｰ売上" days={days} w1={w1} w2={w2} fn={d => sales[d]?.prevYearDinner || 0} getDailyStats={getDailyStats} />

            {/* ── Staff section ── */}
            <tr><td colSpan={totalCols} className="px-1.5 py-0.5 font-bold text-gray-500 bg-gray-100 border border-gray-300">スタッフ</td></tr>

            {/* Manager: 2 rows (出/退) */}
            {managerUser && <StaffPair user={managerUser} shifts={shifts} days={days} dayInfo={dayInfo} isManager={isManager} handleCellClick={handleCellClick} isManagerUser />}

            <tr><td colSpan={totalCols} className="px-1.5 py-0.5 font-bold text-gray-500 bg-gray-100 border border-gray-300">キッチン</td></tr>
            {kitchenUsers.map(u => <StaffPair key={u.id} user={u} shifts={shifts} days={days} dayInfo={dayInfo} isManager={isManager} handleCellClick={handleCellClick} />)}

            {/* 製麺 + 不足 rows (span 2 rows height equivalent) */}
            <SpecialRow label="🍜 製麺" days={days} data={seimen} setData={setSeimen} isManager={isManager} allStaff={allStaff} cellType="select" />
            <SpecialRow label="☀ 午前不足" days={days} data={shortageAM} setData={setShortageAM} isManager={isManager} cellType="number" bg="bg-red-50" color="text-red-700" />
            <SpecialRow label="🌅 午後不足" days={days} data={shortagePM} setData={setShortagePM} isManager={isManager} cellType="number" bg="bg-orange-50" color="text-orange-700" />

            <tr><td colSpan={totalCols} className="px-1.5 py-0.5 font-bold text-gray-500 bg-gray-100 border border-gray-300">ホール</td></tr>
            {hallUsers.map(u => <StaffPair key={u.id} user={u} shifts={shifts} days={days} dayInfo={dayInfo} isManager={isManager} handleCellClick={handleCellClick} />)}

            <SalesRow label="💰 売上 昼" days={days} data={salesLunch} setData={setSalesLunch} isManager={isManager} bg="bg-cyan-50" color="text-cyan-700" />
            <SalesRow label="🌙 売上 ディナー" days={days} data={salesDinner} setData={setSalesDinner} isManager={isManager} bg="bg-blue-50" color="text-blue-700" />
          </tbody>
        </table>
      </div>
      <div className="px-2 py-1 border-t border-gray-300 text-[9px] text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
        <span><span className="text-gray-300 font-light">/</span> = 未提出</span>
        <span><span className="text-red-400 font-bold">-</span> = 不採用</span>
        <span><span className="text-blue-600 font-bold">09─22</span> = 採用</span>
      </div>
    </div>
  );
}

// ── StaffRowOld: single row for employee mode ──
function StaffRowOld({ user, shifts, days, isManager, handleCellClick }) {
  const userShifts = shifts[user.id]?.shifts || {};
  return (
    <tr className="bg-white">
      <td className="sticky left-0 z-10 px-1.5 py-1 text-[10px] font-medium text-gray-700 border border-gray-300 bg-white whitespace-nowrap">{user.name}</td>
      {days.map(d => {
        const val = userShifts[d];
        const isEmpty = !val || val === '/';
        const isRejected = val === '-';
        return (
          <td key={d} onClick={() => isManager && handleCellClick(user.id, d)}
            className={`px-0 py-0 text-center border border-gray-300 ${isEmpty ? 'bg-white' : isRejected ? 'bg-red-50' : 'bg-blue-50'} ${isManager ? 'cursor-pointer hover:bg-blue-100' : ''}`}
            style={{ height: '28px' }}
          >
            {isEmpty && <span className="text-gray-300 font-light leading-none">/</span>}
            {isRejected && <span className="text-red-400 font-bold leading-none">-</span>}
            {!isEmpty && !isRejected && (
              <div className="flex flex-col items-center leading-tight py-0.5">
                <span className="text-[10px] font-bold text-gray-800">{val.split('-')[0]}</span>
                <span className="text-[7px] text-gray-400 leading-[8px]">─</span>
                <span className="text-[10px] font-bold text-gray-800">{val.split('-')[1]}</span>
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ── KpiRow: one metric row in manager view ──
function KpiRow({ label, days, w1, w2, fn, getDailyStats, isRatio }) {
  const sumW1 = w1.reduce((a, d) => { const v = fn(d); return a + (typeof v === 'number' ? v : 0); }, 0);
  const sumW2 = w2.reduce((a, d) => { const v = fn(d); return a + (typeof v === 'number' ? v : 0); }, 0);
  const total = sumW1 + sumW2;
  const w1Hours = w1.reduce((a, d) => a + (getDailyStats?.(d)?.totalHours || 0), 0) || 1;
  const w2Hours = w2.reduce((a, d) => a + (getDailyStats?.(d)?.totalHours || 0), 0) || 1;
  const w1Ratio = sumW1 / w1Hours;
  const w2Ratio = sumW2 / w2Hours;

  return (
    <tr className="bg-gray-50">
      <td className="sticky left-0 z-10 px-1.5 py-0.5 text-[9px] font-medium text-gray-500 border border-gray-300 bg-gray-50 whitespace-nowrap">{label}</td>
      {days.map(d => {
        const v = fn(d);
        return <td key={d} className={`px-0.5 py-0.5 text-center border border-gray-300 ${isRatio && typeof v === 'number' ? (v >= 0 ? 'text-green-700' : 'text-red-600') : 'text-gray-700'} font-medium`}>{v === 0 ? '0' : (v || '-')}</td>;
      })}
      <td className="px-0.5 py-0.5 text-center font-bold text-gray-700 border border-gray-300 bg-gray-100">{total.toFixed ? total.toFixed(0) : total}</td>
      {isRatio ? (
        <>
          <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300">{sumW1.toFixed(0)}</td>
          <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300">-</td>
          <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300">-</td>
          <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300">{sumW2.toFixed(0)}</td>
          <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300">-</td>
          <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300">-</td>
        </>
      ) : (
        <>
          <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300">{typeof sumW1 === 'number' ? sumW1.toFixed(1) : '-'}</td>
          <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300">-</td>
          <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300">{w1Ratio > 0 ? w1Ratio.toFixed(0) : '-'}</td>
          <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300">{typeof sumW2 === 'number' ? sumW2.toFixed(1) : '-'}</td>
          <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300">-</td>
          <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300">{w2Ratio > 0 ? w2Ratio.toFixed(0) : '-'}</td>
        </>
      )}
    </tr>
  );
}

// ── StaffPair: 2 rows (L/D or 出/退) for one staff member ──
function StaffPair({ user, shifts, days, dayInfo, isManager, handleCellClick, isManagerUser }) {
  const userShifts = shifts[user.id]?.shifts || {};
  const w1 = days.slice(0, 7), w2 = days.slice(7);

  const calcWeeklyHours = (weekDays) => {
    let total = 0;
    for (const d of weekDays) {
      const val = userShifts[d];
      if (!val || val === '/' || val === '-') continue;
      const parsed = isManagerUser ? parseManagerShift(val) : parseShiftForNewLayout(val);
      if (!parsed) continue;
      if (isManagerUser) {
        total += parseFloat(parsed.end) - parseFloat(parsed.start);
      } else {
        if (parsed.Ls != null) total += parsed.Le - parsed.Ls;
        if (parsed.Ds != null) total += parsed.De - parsed.Ds;
      }
    }
    return total;
  };

  const totalHours = calcWeeklyHours(days);
  const w1Hours = calcWeeklyHours(w1);
  const w2Hours = calcWeeklyHours(w2);

  const labelTop = isManagerUser ? '出' : 'L';
  const labelBot = isManagerUser ? '退' : 'D';

  const renderCell = (d, isTop) => {
    const val = userShifts[d];
    const isEmpty = !val || val === '/';
    const isRejected = val === '-';

    if (isEmpty || isRejected) {
      if (isManagerUser && isEmpty) {
        const n = getKohoCount(user.id, d, shifts, days);
        const circled = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'][n - 1] || `⑩`;
        return <span className="text-[8px] font-bold text-gray-500">公休{circled}</span>;
      }
      if (isTop) return <span className="text-gray-300 font-light">/</span>;
      return null;
    }

    if (isManagerUser) {
      const parsed = parseManagerShift(val);
      if (!parsed) return <span className="text-gray-300 font-light">/</span>;
      return <span className="text-[10px] font-bold text-gray-800">{isTop ? parsed.start : parsed.end}</span>;
    }

    // Part-timer
    const parsed = parseShiftForNewLayout(val);
    if (!parsed) return <span className="text-gray-300 font-light">/</span>;
    if (isTop) {
      if (parsed.Ls == null) return null;
      return <div className="flex justify-between px-0.5 text-[9px] font-bold text-gray-800"><span>{parsed.Ls}</span><span>{parsed.Le}</span></div>;
    }
    // Bottom (D)
    if (parsed.Ds == null) return null;
    return <div className="flex justify-between px-0.5 text-[9px] font-bold text-gray-800"><span>{parsed.Ds}</span><span>{parsed.De}</span></div>;
  };

  const cellClass = (d, isEmpty, isRejected) =>
    `px-0 py-0 text-center border border-gray-300 ${isEmpty ? 'bg-white' : isRejected ? 'bg-red-50' : 'bg-blue-50'} ${isManager ? 'cursor-pointer hover:bg-blue-100' : ''}`;

  return (
    <>
      {/* Top row (出/L) */}
      <tr className="bg-white">
        <td className="sticky left-0 z-10 px-1.5 py-0.5 text-[9px] font-medium text-gray-700 border border-gray-300 bg-white whitespace-nowrap">
          {labelTop} {user.name}
        </td>
        {days.map(d => {
          const val = userShifts[d];
          const isEmpty = !val || val === '/';
          const isRej = val === '-';
          return (
            <td key={`${d}-t`} onClick={() => isManager && handleCellClick(user.id, d)} className={cellClass(d, isEmpty, isRej)} style={{ height: '22px' }}>
              {renderCell(d, true)}
            </td>
          );
        })}
        <td className="px-0.5 py-0.5 text-center font-bold text-gray-700 border border-gray-300 bg-gray-100">{totalHours.toFixed(1)}</td>
        <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300" colSpan={3}>{w1Hours.toFixed(1)}</td>
        <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300" colSpan={3}>{w2Hours.toFixed(1)}</td>
      </tr>
      {/* Bottom row (退/D) */}
      <tr className="bg-white">
        <td className="sticky left-0 z-10 px-1.5 py-0.5 text-[9px] text-gray-500 border border-gray-300 bg-white whitespace-nowrap">{labelBot}</td>
        {days.map(d => {
          const val = userShifts[d];
          const isEmpty = !val || val === '/';
          const isRej = val === '-';
          return (
            <td key={`${d}-b`} onClick={() => isManager && handleCellClick(user.id, d)} className={cellClass(d, isEmpty, isRej)} style={{ height: '22px' }}>
              {renderCell(d, false)}
            </td>
          );
        })}
        <td className="px-0.5 py-0.5 border border-gray-300 bg-gray-50" />
        <td className="px-0.5 py-0.5 border border-gray-300 bg-green-100" colSpan={3} />
        <td className="px-0.5 py-0.5 border border-gray-300 bg-green-100" colSpan={3} />
      </tr>
    </>
  );
}

// ── SpecialRow: 製麺 / 午前不足 / 午後不足 ──
function SpecialRow({ label, days, data, setData, isManager, allStaff, cellType, bg = '', color = '' }) {
  const w1 = days.slice(0, 7), w2 = days.slice(7);
  const sumFn = d => { const v = data[d]; return v != null && v !== '' ? (parseInt(v) || 0) : 0; };
  const total = days.reduce((a, d) => a + sumFn(d), 0);
  const w1Total = w1.reduce((a, d) => a + sumFn(d), 0);
  const w2Total = w2.reduce((a, d) => a + sumFn(d), 0);

  return (
    <tr className={bg || 'bg-indigo-50'}>
      <td className={`sticky left-0 z-10 px-1.5 py-0.5 text-[9px] font-bold border border-gray-300 whitespace-nowrap ${color || 'text-indigo-700'} ${bg || 'bg-indigo-50'}`}>{label}</td>
      {days.map(d => {
        const val = data[d];
        return (
          <td key={d} className={`px-0.5 py-0.5 text-center border border-gray-300 ${bg || 'bg-indigo-50'}`}>
            {isManager ? (
              cellType === 'select' ? (
                <select value={val || ''} onChange={e => setData({ ...data, [d]: e.target.value })}
                  className="w-full text-[9px] px-0.5 py-0.5 border border-gray-300 rounded bg-white">
                  <option value="">-</option>
                  {allStaff.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              ) : (
                <input type="number" value={val ?? ''} onChange={e => setData({ ...data, [d]: e.target.value === '' ? undefined : parseInt(e.target.value) })}
                  className="w-full text-[9px] px-0.5 py-0.5 border border-gray-300 rounded bg-white text-center font-bold" />
              )
            ) : (
              <span className={`text-[9px] font-bold ${color || 'text-indigo-700'}`}>{val != null && val !== '' ? val : '/'}</span>
            )}
          </td>
        );
      })}
      <td className={`px-0.5 py-0.5 text-center font-bold text-gray-700 border border-gray-300 bg-gray-100`}>{total || '-'}</td>
      <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300" colSpan={3}>{w1Total || '-'}</td>
      <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300" colSpan={3}>{w2Total || '-'}</td>
    </tr>
  );
}

// ── SalesRow: 売上 昼 / 売上 ディナー ──
function SalesRow({ label, days, data, setData, isManager, bg, color }) {
  const w1 = days.slice(0, 7), w2 = days.slice(7);
  const sumFn = d => { const v = data[d]; return v?.main ? parseInt(v.main) || 0 : 0; };
  const total = days.reduce((a, d) => a + sumFn(d), 0);
  const w1Total = w1.reduce((a, d) => a + sumFn(d), 0);
  const w2Total = w2.reduce((a, d) => a + sumFn(d), 0);

  return (
    <tr className={bg}>
      <td className={`sticky left-0 z-10 px-1.5 py-0.5 text-[9px] font-bold border border-gray-300 whitespace-nowrap ${color} ${bg}`}>{label}</td>
      {days.map(d => {
        const v = data[d] || { main: '', sub: '' };
        return (
          <td key={d} className={`px-0.5 py-0.5 text-center border border-gray-300 ${bg}`}>
            {isManager ? (
              <div className="flex flex-col items-center gap-0">
                <input type="number" value={v.main} onChange={e => setData({ ...data, [d]: { ...v, main: e.target.value } })}
                  className="w-full text-[9px] px-0.5 py-0 border border-gray-300 rounded bg-white text-center font-medium" placeholder="予測" />
                <input type="number" value={v.sub} onChange={e => setData({ ...data, [d]: { ...v, sub: e.target.value } })}
                  className="w-full text-[8px] px-0.5 py-0 border border-gray-300 rounded bg-white text-center text-gray-500" placeholder="(実績)" />
              </div>
            ) : (
              <span className="text-[9px] font-medium">{v.main || '-'}{v.sub ? ` (${v.sub})` : ''}</span>
            )}
          </td>
        );
      })}
      <td className={`px-0.5 py-0.5 text-center font-bold text-gray-700 border border-gray-300 bg-gray-100`}>{total || '-'}</td>
      <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300" colSpan={3}>{w1Total || '-'}</td>
      <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300" colSpan={3}>{w2Total || '-'}</td>
    </tr>
  );
}

// ── 売上管理 ──
function SalesView({
  days, sales, setSales, editingSales, setEditingSales, handleSaveSales,
  monthlyStats, getManagerBreakHours, getMonthlyStats, users, isManager,
  shifts, kitchenUsers, hallUsers,
  seimen, shortageAM, shortagePM, salesLunch, salesDinner,
  setSeimen, setShortageAM, setShortagePM, setSalesLunch, setSalesDinner,
}) {
  const managerUser = users.find(u => u.role === 'manager');
  const allStaff = users.filter(u => u.role !== 'manager');
  const dayInfo = days.map(d => ({ d, dow: getDayOfWeek(d) }));
  const w1 = days.slice(0, 7), w2 = days.slice(7);
  const totalCols = 1 + days.length + 1 + 6;

  return (
    <div className="space-y-3">
      {/* ── Monthly summary cards ── */}
      <div className="bg-white border border-gray-300 p-3">
        <h2 className="text-xs font-bold text-gray-900 mb-2">月間サマリー</h2>
        <div className="grid grid-cols-5 gap-2">
          <div className="bg-blue-50 p-2 rounded"><div className="text-[9px] text-blue-600 font-medium">総勤務時間</div><div className="text-sm font-bold text-blue-900">{monthlyStats.totalHours.toFixed(1)}h</div></div>
          <div className="bg-green-50 p-2 rounded"><div className="text-[9px] text-green-600 font-medium">勤務日数</div><div className="text-sm font-bold text-green-900">{monthlyStats.totalDays}日</div></div>
          <div className="bg-purple-50 p-2 rounded"><div className="text-[9px] text-purple-600 font-medium">平均日勤</div><div className="text-sm font-bold text-purple-900">{monthlyStats.totalDays > 0 ? (monthlyStats.totalHours / monthlyStats.totalDays).toFixed(1) : 0}h</div></div>
          <div className="bg-rose-50 p-2 rounded"><div className="text-[9px] text-rose-600 font-medium">社員休憩</div><div className="text-sm font-bold text-rose-900">{getManagerBreakHours().toFixed(1)}h</div></div>
          <div className="bg-orange-50 p-2 rounded"><div className="text-[9px] text-orange-600 font-medium">スタッフ</div><div className="text-sm font-bold text-orange-900">{users.filter(u => u.role !== 'manager').length}人</div></div>
        </div>
      </div>

      {/* ── Daily sales entry table ── */}
      <div className="bg-white border border-gray-300 p-3">
        <h2 className="text-xs font-bold text-gray-900 mb-2">日別売上入力</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ fontSize: '10px' }}>
            <thead>
              <tr className="bg-gray-50">
                <th className="px-1 py-1 text-left font-medium text-gray-500 border border-gray-300">日</th>
                <th className="px-1 py-1 text-right font-medium text-gray-500 border border-gray-300">売上</th>
                <th className="px-1 py-1 text-right font-medium text-gray-500 border border-gray-300">前年</th>
                <th className="px-1 py-1 text-right font-medium text-gray-500 border border-gray-300">前年比</th>
                <th className="px-1 py-1 text-right font-medium text-gray-500 border border-gray-300">前年ﾗﾝﾁ</th>
                <th className="px-1 py-1 text-right font-medium text-gray-500 border border-gray-300">前年ﾃﾞｨﾅｰ</th>
                <th className="px-1 py-1 text-center font-medium text-gray-500 border border-gray-300">操作</th>
              </tr>
            </thead>
            <tbody>
              {days.map(d => {
                const ds = sales[d] || {};
                const cur = ds.current || 0, prev = ds.prevYear || 0, pl = ds.prevYearLunch || 0, pdInner = ds.prevYearDinner || 0;
                const ratio = prev > 0 ? ((cur - prev) / prev * 100).toFixed(1) : '-';
                const isEdit = editingSales === d;
                return (
                  <tr key={d} className="bg-white">
                    <td className="px-1 py-0.5 font-medium text-gray-800 border border-gray-300">{d}日</td>
                    <td className="px-1 py-0.5 text-right border border-gray-300">
                      {isEdit ? <input type="number" defaultValue={cur} onChange={e => setSales({ ...sales, [d]: { ...sales[d], current: parseInt(e.target.value) || 0 } })} className="w-full text-[9px] px-0.5 py-0 border text-right" /> : <span className="font-medium">{cur ? `¥${cur.toLocaleString()}` : '-'}</span>}
                    </td>
                    <td className="px-1 py-0.5 text-right border border-gray-300">
                      {isEdit ? <input type="number" defaultValue={prev} onChange={e => setSales({ ...sales, [d]: { ...sales[d], prevYear: parseInt(e.target.value) || 0 } })} className="w-full text-[9px] px-0.5 py-0 border text-right" /> : <span>{prev ? `¥${prev.toLocaleString()}` : '-'}</span>}
                    </td>
                    <td className="px-1 py-0.5 text-right border border-gray-300">
                      {typeof ratio === 'number' ? <span className={ratio >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{ratio >= 0 ? '+' : ''}{ratio}%</span> : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-1 py-0.5 text-right border border-gray-300">
                      {isEdit ? <input type="number" defaultValue={pl} onChange={e => setSales({ ...sales, [d]: { ...sales[d], prevYearLunch: parseInt(e.target.value) || 0 } })} className="w-full text-[9px] px-0.5 py-0 border text-right" /> : <span>{pl ? `¥${pl.toLocaleString()}` : '-'}</span>}
                    </td>
                    <td className="px-1 py-0.5 text-right border border-gray-300">
                      {isEdit ? <input type="number" defaultValue={pdInner} onChange={e => setSales({ ...sales, [d]: { ...sales[d], prevYearDinner: parseInt(e.target.value) || 0 } })} className="w-full text-[9px] px-0.5 py-0 border text-right" /> : <span>{pdInner ? `¥${pdInner.toLocaleString()}` : '-'}</span>}
                    </td>
                    <td className="px-1 py-0.5 text-center border border-gray-300">
                      {isEdit ? <button onClick={() => setEditingSales(null)} className="text-green-600 text-[9px] font-medium">保存</button> : <button onClick={() => setEditingSales(d)} className="text-blue-600 text-[9px]">編集</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Shift table (Excel-like, same as ShiftTableView manager mode) ── */}
      <div className="bg-white border border-gray-300 overflow-hidden">
        <div className="px-2 py-1 border-b border-gray-300 bg-gray-50">
          <span className="text-[10px] font-bold text-gray-700">部長提出用 シフト表</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ fontSize: '10px' }}>
            <thead>
              <tr className="bg-gray-50">
                <th rowSpan={2} className="sticky left-0 z-10 bg-gray-50 px-1.5 py-0.5 text-left font-medium text-gray-500 border border-gray-300 min-w-[75px]">氏名</th>
                {dayInfo.map(({ d, dow }) => {
                  const bg = dow === 0 ? 'bg-red-100' : dow === 6 ? 'bg-blue-100' : 'bg-green-100';
                  return <th key={d} className={`px-0.5 py-0.5 text-center font-medium text-gray-700 border border-gray-300 ${bg} w-[52px]`}>
                    <div className="text-[9px]">{d}</div>
                    <div className={`text-[8px] ${dow === 0 ? 'text-red-600' : dow === 6 ? 'text-blue-600' : 'text-green-700'}`}>{['日','月','火','水','木','金','土'][dow]}</div>
                  </th>;
                })}
                <th rowSpan={2} className="px-1 py-0.5 text-center font-medium text-gray-500 border border-gray-300 w-[52px]">前半<br/>合計</th>
                <th colSpan={3} className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300 w-[55px]">第1週</th>
                <th colSpan={3} className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300 w-[55px]">第2週</th>
              </tr>
              <tr className="bg-green-50">
                {['売上','時間','人時'].map(h => <th key={h} className="px-0.5 py-0.5 text-center font-medium text-green-700 bg-green-100 border border-gray-300 text-[8px] w-[55px]">{h}</th>)}
                {['売上','時間','人時'].map(h => <th key={h} className="px-0.5 py-0.5 text-center font-medium text-green-700 bg-green-100 border border-gray-300 text-[8px] w-[55px]">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {/* KPI rows */}
              <KpiRow label="売上予測(千円)" days={days} w1={w1} w2={w2} fn={d => (sales[d]?.current || 0) / 1000} getDailyStats={null} />
              <KpiRow label="前年売上" days={days} w1={w1} w2={w2} fn={d => sales[d]?.prevYear || 0} getDailyStats={null} />
              <KpiRow label="前年比(%)" days={days} w1={w1} w2={w2} fn={d => { const p = sales[d]?.prevYear; const c = sales[d]?.current; return (p && p > 0) ? ((c - p) / p * 100).toFixed(1) : '-'; }} getDailyStats={null} isRatio />
              <KpiRow label="前年ﾗﾝﾁ売上" days={days} w1={w1} w2={w2} fn={d => sales[d]?.prevYearLunch || 0} getDailyStats={null} />
              <KpiRow label="前年ﾃﾞｨﾅｰ売上" days={days} w1={w1} w2={w2} fn={d => sales[d]?.prevYearDinner || 0} getDailyStats={null} />

              {/* Staff section */}
              <tr><td colSpan={totalCols} className="px-1.5 py-0.5 font-bold text-gray-500 bg-gray-100 border border-gray-300">スタッフ</td></tr>

              {managerUser && <SalesStaffPair user={managerUser} shifts={shifts} days={days} dayInfo={dayInfo} isManager={isManager} isManagerUser />}
              <tr><td colSpan={totalCols} className="px-1.5 py-0.5 font-bold text-gray-500 bg-gray-100 border border-gray-300">キッチン</td></tr>
              {kitchenUsers.map(u => <SalesStaffPair key={u.id} user={u} shifts={shifts} days={days} dayInfo={dayInfo} isManager={isManager} />)}

              <SpecialRow label="🍜 製麺" days={days} data={seimen} setData={setSeimen} isManager={isManager} allStaff={allStaff} cellType="select" />
              <SpecialRow label="☀ 午前不足" days={days} data={shortageAM} setData={setShortageAM} isManager={isManager} cellType="number" bg="bg-red-50" color="text-red-700" />
              <SpecialRow label="🌅 午後不足" days={days} data={shortagePM} setData={setShortagePM} isManager={isManager} cellType="number" bg="bg-orange-50" color="text-orange-700" />

              <tr><td colSpan={totalCols} className="px-1.5 py-0.5 font-bold text-gray-500 bg-gray-100 border border-gray-300">ホール</td></tr>
              {hallUsers.map(u => <SalesStaffPair key={u.id} user={u} shifts={shifts} days={days} dayInfo={dayInfo} isManager={isManager} />)}

              <SalesRow label="💰 売上 昼" days={days} data={salesLunch} setData={setSalesLunch} isManager={isManager} bg="bg-cyan-50" color="text-cyan-700" />
              <SalesRow label="🌙 売上 ディナー" days={days} data={salesDinner} setData={setSalesDinner} isManager={isManager} bg="bg-blue-50" color="text-blue-700" />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── SalesStaffPair: 2 rows for one staff in sales view (same layout, no cell click) ──
function SalesStaffPair({ user, shifts, days, dayInfo, isManager, isManagerUser }) {
  const userShifts = shifts[user.id]?.shifts || {};

  const calcWeeklyHours = (weekDays) => {
    let total = 0;
    for (const d of weekDays) {
      const val = userShifts[d];
      if (!val || val === '/' || val === '-') continue;
      const parsed = isManagerUser ? parseManagerShift(val) : parseShiftForNewLayout(val);
      if (!parsed) continue;
      if (isManagerUser) {
        total += parseFloat(parsed.end) - parseFloat(parsed.start);
      } else {
        if (parsed.Ls != null) total += parsed.Le - parsed.Ls;
        if (parsed.Ds != null) total += parsed.De - parsed.Ds;
      }
    }
    return total;
  };

  const totalHours = calcWeeklyHours(days);
  const w1Hours = calcWeeklyHours(days.slice(0, 7));
  const w2Hours = calcWeeklyHours(days.slice(7));

  const labelTop = isManagerUser ? '出' : 'L';
  const labelBot = isManagerUser ? '退' : 'D';

  const renderCell = (d, isTop) => {
    const val = userShifts[d];
    const isEmpty = !val || val === '/';
    const isRejected = val === '-';

    if (isEmpty || isRejected) {
      if (isManagerUser && isEmpty) {
        const n = getKohoCount(user.id, d, shifts, days);
        const circled = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'][n - 1] || '⑩';
        return <span className="text-[8px] font-bold text-gray-500">公休{circled}</span>;
      }
      if (isTop) return <span className="text-gray-300 font-light">/</span>;
      return null;
    }

    if (isManagerUser) {
      const parsed = parseManagerShift(val);
      if (!parsed) return <span className="text-gray-300 font-light">/</span>;
      return <span className="text-[10px] font-bold text-gray-800">{isTop ? parsed.start : parsed.end}</span>;
    }

    const parsed = parseShiftForNewLayout(val);
    if (!parsed) return <span className="text-gray-300 font-light">/</span>;
    if (isTop) {
      if (parsed.Ls == null) return null;
      return <div className="flex justify-between px-0.5 text-[9px] font-bold text-gray-800"><span>{parsed.Ls}</span><span>{parsed.Le}</span></div>;
    }
    if (parsed.Ds == null) return null;
    return <div className="flex justify-between px-0.5 text-[9px] font-bold text-gray-800"><span>{parsed.Ds}</span><span>{parsed.De}</span></div>;
  };

  const cellClass = (d, isEmpty, isRejected) =>
    `px-0 py-0 text-center border border-gray-300 ${isEmpty ? 'bg-white' : isRejected ? 'bg-red-50' : 'bg-blue-50'}`;

  return (
    <>
      <tr className="bg-white">
        <td className="sticky left-0 z-10 px-1.5 py-0.5 text-[9px] font-medium text-gray-700 border border-gray-300 bg-white whitespace-nowrap">
          {labelTop} {user.name}
        </td>
        {days.map(d => {
          const val = userShifts[d];
          const isEmpty = !val || val === '/';
          const isRej = val === '-';
          return <td key={`${d}-t`} className={cellClass(d, isEmpty, isRej)} style={{ height: '22px' }}>{renderCell(d, true)}</td>;
        })}
        <td className="px-0.5 py-0.5 text-center font-bold text-gray-700 border border-gray-300 bg-gray-100">{totalHours.toFixed(1)}</td>
        <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300" colSpan={3}>{w1Hours.toFixed(1)}</td>
        <td className="px-0.5 py-0.5 text-center font-medium text-green-800 bg-green-100 border border-gray-300" colSpan={3}>{w2Hours.toFixed(1)}</td>
      </tr>
      <tr className="bg-white">
        <td className="sticky left-0 z-10 px-1.5 py-0.5 text-[9px] text-gray-500 border border-gray-300 bg-white whitespace-nowrap">{labelBot}</td>
        {days.map(d => {
          const val = userShifts[d];
          const isEmpty = !val || val === '/';
          const isRej = val === '-';
          return <td key={`${d}-b`} className={cellClass(d, isEmpty, isRej)} style={{ height: '22px' }}>{renderCell(d, false)}</td>;
        })}
        <td className="px-0.5 py-0.5 border border-gray-300 bg-gray-50" />
        <td className="px-0.5 py-0.5 border border-gray-300 bg-green-100" colSpan={3} />
        <td className="px-0.5 py-0.5 border border-gray-300 bg-green-100" colSpan={3} />
      </tr>
    </>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${active ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}>
      {children}
    </button>
  );
}

function CellEditForm({ onApprove, onReject }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center justify-center">
        <input type="text" inputMode="numeric" placeholder="開始" value={start} onChange={e => setStart(e.target.value.replace(/[^0-9.]/g, ''))} className="w-20 px-3 py-2 border rounded-xl text-sm text-center" autoFocus />
        <span className="text-gray-400 text-sm">→</span>
        <input type="text" inputMode="numeric" placeholder="終了" value={end} onChange={e => setEnd(e.target.value.replace(/[^0-9.Ll]/g, '').toUpperCase())} className="w-20 px-3 py-2 border rounded-xl text-sm text-center" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onApprove(start || '?', end || '?')} disabled={!start || !end} className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400">採用</button>
        <button onClick={onReject} className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-700">不採用</button>
      </div>
    </div>
  );
}

export default App;
