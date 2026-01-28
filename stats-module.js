export function renderStatsModal(periodScores, totalFocusSeconds, tabSwitchCount, userName, currentLevel) {
    const focusHours = Math.floor(totalFocusSeconds / 3600);
    const focusMins = Math.floor((totalFocusSeconds % 3600) / 60);

    const modal = document.createElement('div');
    modal.className = 'screen-overlay';
    modal.style.zIndex = "3000";
    modal.innerHTML = `
        <div class="lobby-container" style="max-width: 500px; width: 95%; background: #1a252f; border: 4px solid #4fc3f7;">
            <h2 style="color: #4fc3f7; margin-bottom: 15px;">📊 Focus Analysis: ${userName}</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
                <div style="background: rgba(79, 195, 247, 0.1); padding: 10px; border-radius: 10px;">
                    <small style="color: #4fc3f7;">เวลาโฟกัสสะสม</small>
                    <div style="font-size: 1.1em; color: #fff;">${focusHours}ชม. ${focusMins}นาที</div>
                </div>
                <div style="background: rgba(229, 115, 115, 0.1); padding: 10px; border-radius: 10px;">
                    <small style="color: #e57373;">สลับหน้าจอรวม</small>
                    <div style="font-size: 1.1em; color: #ff8a80;">${tabSwitchCount} ครั้ง</div>
                </div>
            </div>
            <div style="background: white; padding: 10px; border-radius: 10px; margin-bottom: 15px;">
                <canvas id="focusChart" height="180"></canvas>
            </div>
            <p style="color: #bdc3c7; font-size: 0.85em; margin-bottom: 15px;">ระดับ: Lv.${currentLevel.toUpperCase()}</p>
            <button class="game-btn info" id="close-stats-btn">ปิดหน้าต่าง</button>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-stats-btn').onclick = () => modal.remove();

    const ctx = document.getElementById('focusChart').getContext('2d');
    const labels = periodScores.length > 0 ? periodScores.map((_, i) => `ช่วง ${i + 1}`) : ['ไม่มีข้อมูล'];
    const dataPoints = periodScores.length > 0 ? periodScores : [0];

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'คุณภาพสมาธิ (%)',
                data: dataPoints,
                borderColor: '#4db6ac',
                backgroundColor: 'rgba(77, 182, 172, 0.2)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#00897b',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, max: 100, ticks: { color: '#666' } },
                x: { ticks: { color: '#666' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}