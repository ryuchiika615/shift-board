// Main JavaScript

// フラッシュメッセージの自動非表示
document.addEventListener('DOMContentLoaded', function() {
    const flashMessages = document.querySelectorAll('.flash-message');
    flashMessages.forEach(msg => {
        setTimeout(() => {
            msg.style.opacity = '0';
            msg.style.transition = 'opacity 0.3s';
            setTimeout(() => msg.remove(), 300);
        }, 3000);
    });
});

// 日付フォーマット
function formatDate(dateStr) {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];
    return `${month}/${day} (${weekday})`;
}

// 時間のバリデーション
function validateTimeRange(start, end) {
    if (!start || !end) return false;
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return endMinutes > startMinutes;
}

// 数値フォーマット
function formatCurrency(value) {
    return '¥' + value.toLocaleString();
}

function formatHours(value) {
    return value.toFixed(1) + 'h';
}

// ローディング表示
function showLoading(element) {
    element.disabled = true;
    element.textContent = '保存中...';
}

function hideLoading(element, originalText) {
    element.disabled = false;
    element.textContent = originalText;
}

// エラー表示
function showError(message) {
    const div = document.createElement('div');
    div.className = 'flash-message';
    div.style.background = '#fee2e2';
    div.style.color = '#991b1b';
    div.style.borderLeftColor = '#ef4444';
    div.textContent = message;
    document.querySelector('.container').prepend(div);
    setTimeout(() => div.remove(), 5000);
}

// 成功表示
function showSuccess(message) {
    const div = document.createElement('div');
    div.className = 'flash-message';
    div.textContent = message;
    document.querySelector('.container').prepend(div);
    setTimeout(() => div.remove(), 3000);
}
