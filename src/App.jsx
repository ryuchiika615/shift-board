import { useState } from 'react';
import { csvData, parseCSV, calculateHours, calculateDailyStats, getShiftColor } from './data';

function App() {
  const [viewMode, setViewMode] = useState('employee');
  const { headers, data } = parseCSV(csvData);

  const days = headers.slice(1);
  
  const totalMonthlyHours = data.reduce((sum, row) => {
    return sum + days.reduce((daySum, day) => {
      return daySum + calculateHours(row[day]);
    }, 0);
  }, 0);

  const dailyStats = days.map(day => ({
    day,
    ...calculateDailyStats(data, day)
  }));

  const totalStaffHours = dailyStats.reduce((sum, stat) => sum + stat.totalHours, 0);
  const avgDailyHours = totalStaffHours / days.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">シフト管理</h1>
          
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${viewMode === 'employee' ? 'text-blue-600' : 'text-gray-500'}`}>
              アルバイト用
            </span>
            <button
              onClick={() => setViewMode(viewMode === 'employee' ? 'manager' : 'employee')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                viewMode === 'manager' ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  viewMode === 'manager' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${viewMode === 'manager' ? 'text-blue-600' : 'text-gray-500'}`}>
              管理者用
            </span>
          </div>
        </div>

        {viewMode === 'manager' && (
          <div className="bg-white rounded-lg shadow mb-6 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">経営指標ダッシュボード</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-blue-600 font-medium">売上予測</div>
                <div className="text-2xl font-bold text-blue-900">¥2,450,000</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm text-green-600 font-medium">前年売上</div>
                <div className="text-2xl font-bold text-green-900">¥2,280,000</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-sm text-purple-600 font-medium">前年比</div>
                <div className="text-2xl font-bold text-purple-900">+7.5%</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4">
                <div className="text-sm text-yellow-600 font-medium">ランチ売上</div>
                <div className="text-2xl font-bold text-yellow-900">¥890,000</div>
              </div>
              <div className="bg-pink-50 rounded-lg p-4">
                <div className="text-sm text-pink-600 font-medium">ディナー売上</div>
                <div className="text-2xl font-bold text-pink-900">¥1,560,000</div>
              </div>
              <div className="bg-indigo-50 rounded-lg p-4">
                <div className="text-sm text-indigo-600 font-medium">人時売上</div>
                <div className="text-2xl font-bold text-indigo-900">¥4,250</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-sm text-red-600 font-medium">変動費</div>
                <div className="text-2xl font-bold text-red-900">¥735,000</div>
              </div>
              <div className="bg-teal-50 rounded-lg p-4">
                <div className="text-sm text-teal-600 font-medium">社員労働時間</div>
                <div className="text-2xl font-bold text-teal-900">120h</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 col-span-2 sm:col-span-4 lg:col-span-2">
                <div className="text-sm text-orange-600 font-medium">労働時間合計</div>
                <div className="text-2xl font-bold text-orange-900">{totalMonthlyHours.toFixed(1)}h</div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
                    従業員名
                  </th>
                  {days.map(day => (
                    <th key={day} className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[80px]">
                      {day}日
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.map((row, rowIndex) => (
                  <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 z-10">
                      <div className={`${rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'} py-1`}>
                        {row.name}
                      </div>
                    </td>
                    {days.map(day => (
                      <td key={day} className="px-2 py-2 text-center">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getShiftColor(row[day])}`}>
                          {row[day] || '休'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {viewMode === 'manager' && (
          <div className="mt-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">日別勤務統計</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">出勤人数</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">合計時間</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {dailyStats.map(stat => (
                    <tr key={stat.day}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{stat.day}日</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-center">{stat.staffCount}人</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-center">{stat.totalHours.toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-4 text-center text-sm text-gray-500">
          <p>凡例: <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">L=閉店まで</span> <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">通常勤務</span> <span className="bg-gray-100 text-gray-400 px-2 py-1 rounded text-xs">休</span></p>
        </div>
      </div>
    </div>
  );
}

export default App;
