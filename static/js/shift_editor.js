let currentCell = null;

function openShiftModal(cell) {
    currentCell = cell;
    const modal = document.getElementById('shiftModal');
    const employeeId = cell.dataset.employeeId;
    const date = cell.dataset.date;
    const periodId = cell.dataset.periodId;

    document.getElementById('modalEmployeeId').value = employeeId;
    document.getElementById('modalDate').value = date;
    document.getElementById('modalPeriodId').value = periodId;

    // 日付表示
    const dateObj = new Date(date);
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[dateObj.getDay()];
    document.getElementById('modalDateLabel').textContent = `${month}/${day} (${weekday})`;

    // 既存データをセット
    const timeEl = cell.querySelector('.shift-time');
    if (timeEl) {
        const times = timeEl.textContent.split('-');
        document.getElementById('modalStartTime').value = times[0].trim();
        document.getElementById('modalEndTime').value = times[1].trim();
    } else {
        document.getElementById('modalStartTime').value = '';
        document.getElementById('modalEndTime').value = '';
    }

    const typeEl = cell.querySelector('.shift-type');
    if (typeEl) {
        document.getElementById('modalShiftType').value = typeEl.textContent;
    } else {
        document.getElementById('modalShiftType').value = 'L';
    }

    const areaEl = cell.querySelector('.shift-area');
    if (areaEl) {
        document.getElementById('modalArea').value = areaEl.textContent;
    } else {
        document.getElementById('modalArea').value = '';
    }

    modal.style.display = 'flex';
}

function closeShiftModal() {
    document.getElementById('shiftModal').style.display = 'none';
    currentCell = null;
}

function saveShift(event) {
    event.preventDefault();

    const data = {
        employee_id: parseInt(document.getElementById('modalEmployeeId').value),
        period_id: parseInt(document.getElementById('modalPeriodId').value),
        date: document.getElementById('modalDate').value,
        start_time: document.getElementById('modalStartTime').value,
        end_time: document.getElementById('modalEndTime').value,
        shift_type: document.getElementById('modalShiftType').value,
        area: document.getElementById('modalArea').value,
        break_minutes: parseInt(document.getElementById('modalBreak').value)
    };

    fetch('/manager/shift/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            // セルを更新
            if (currentCell) {
                currentCell.classList.add('has-shift');
                currentCell.classList.remove('unavailable');
                currentCell.innerHTML = `
                    <div class="shift-time">${data.start_time}-${data.end_time}</div>
                    <div class="shift-type">${data.shift_type}</div>
                    ${data.area ? `<div class="shift-area">${data.area}</div>` : ''}
                `;
            }
            closeShiftModal();
        }
    });
}

function deleteShift() {
    if (!confirm('このシフトを削除しますか？')) return;

    const data = {
        employee_id: parseInt(document.getElementById('modalEmployeeId').value),
        period_id: parseInt(document.getElementById('modalPeriodId').value),
        date: document.getElementById('modalDate').value
    };

    fetch('/manager/shift/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            if (currentCell) {
                currentCell.classList.remove('has-shift');
                currentCell.innerHTML = '';
            }
            closeShiftModal();
        }
    });
}

// モーダル外クリックで閉じる
document.getElementById('shiftModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeShiftModal();
    }
});

// ESCキーで閉じる
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeShiftModal();
    }
});
