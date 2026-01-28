import { db, userId, userName, userAvatar } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { renderStatsModal } from './stats-module.js';

// --- [Asset & Sound Settings] ---
const sounds = {
    tap: new Audio('sounds/tap.mp3'),
    confirm: new Audio('sounds/confirm.mp3'),
    denied: new Audio('sounds/denied.mp3'),
    click: new Audio('https://actions.google.com/sounds/v1/foley/button_click.ogg'),
    win: new Audio('https://actions.google.com/sounds/v1/cartoon/clime_up_the_ladder.ogg'),
    fail: new Audio('https://actions.google.com/sounds/v1/human_voices/fart.ogg'),
    break: new Audio('https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg'),
    levelup: new Audio('https://actions.google.com/sounds/v1/cartoon/conga_drum_accent.ogg')
};

const unlockAudio = () => {
    Object.values(sounds).forEach(s => {
        s.play().then(() => { s.pause(); s.currentTime = 0; }).catch(() => { });
    });
    document.removeEventListener('click', unlockAudio);
    console.log("🔊 Sound System Unlocked");
};
document.addEventListener('click', unlockAudio);

const playSound = (soundKey) => {
    const s = sounds[soundKey];
    if (s) {
        s.currentTime = 0;
        const playPromise = s.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                console.warn(`[Sound System] ${soundKey} play blocked:`, e.message);
            });
        }
    }
};

// --- 1. ตัวแปรสถานะเกม ---
export let score = 0;
export let currentSkin = "default";
export let currentBG = "classroom.jpg";
let isSleeping = false;
let periodEnergy = 100;
let hasFailedPeriod = false;

// --- 2. ตัวแปรระบบช่วงเวลา ---
let currentPeriod = 1;
let totalPeriods = 6;
let isBreakMode = false;
let timeLeft = 1800;
let periodScores = [];
let tabSwitchCount = 0;
let totalFocusSeconds = 0;
let gameInterval = null;

// ตัวแปรพิเศษ
let lastBlurTime = 0;
let isActuallySwitched = false;

// ✨ [อัปเดตสถานะไปยัง Firebase]
async function updateOnlineStatus(status) {
    if (!userId) return;
    try {
        const userRef = doc(db, "students", userId);
        await updateDoc(userRef, {
            status: status,
            lastSeen: Date.now()
        });
    } catch (error) {
        console.error("Error updating status:", error);
    }
}

// --- [แก้ไขใหญ่] ระบบคำนวณเวลาและพลังงานเมื่อกลับมา ---
function handleBackgroundTime() {
    if (hasFailedPeriod || isBreakMode || !gameInterval) return;

    const lastExit = localStorage.getItem("lastExitTime");
    if (lastExit && lastExit !== "undefined") {
        const currentTime = Date.now();
        const diffSeconds = Math.floor((currentTime - parseFloat(lastExit)) / 1000);

        if (diffSeconds > 0) {
            // หักเวลาที่เหลืออยู่ตามจริง
            timeLeft = Math.max(0, timeLeft - diffSeconds);

            // 🛠️ ตรวจสอบ: ถ้าหายไปนานแต่ "ไม่ได้รับสัญญาณว่าสลับแอป" (isActuallySwitched เป็น false)
            // หรือถ้าหายไปนานเกิน 5 วินาทีในขณะที่สลับหน้าจอ (กรณีจอดับเครื่องจะนิ่งไปเลย)
            // เราจะถือว่า "จอดับ" -> ให้คะแนนปกติ ไม่หักพลังงาน
            if (isActuallySwitched && diffSeconds < 5) {
                // กรณีสลับแอปแวบเดียว (เช่นไปตอบแชทแล้วรีบกลับมา) -> หักพลังงาน
                const energyLost = diffSeconds * 2.0; 
                periodEnergy = Math.max(0, periodEnergy - energyLost);
            } else {
                // กรณีจอดับ หรือล็อคเครื่อง (diffSeconds จะเยอะ และเครื่องไม่ได้ส่งสัญญาณสลับแอปถี่ๆ)
                totalFocusSeconds += diffSeconds;
                // ไม่หักพลังงาน และอาจจะเพิ่มให้เล็กน้อยเหมือนตอนเปิดจอ
                periodEnergy = Math.min(100, periodEnergy + (diffSeconds * 0.1));
            }

            updateUI();
            updateImage();

            if (periodEnergy <= 0) {
                periodEnergy = 0;
                handleEnergyDepleted();
            }
        }
        localStorage.removeItem("lastExitTime");
    }
    // รีเซ็ตสถานะ
    isActuallySwitched = false;
}

// --- 3. ระบบจัดการเลเวล ---
function getCurrentLevel() {
    if (score >= 100) return 'grad';
    if (score >= 50) return '3';
    if (score >= 20) return '2';
    return '1';
}

// --- 4. ระบบจัดการรูปภาพตัวละคร ---
export function updateImage() {
    const img = document.getElementById('main-character-img');
    if (!img) return;

    img.classList.add('character-breathing');
    const lv = getCurrentLevel();
    let fileName = "";

    if (hasFailedPeriod) {
        fileName = (lv === '1') ? `${userAvatar}_fail1.png` : `${userAvatar}_${lv}_fail.png`;
    }
    else if (isSleeping || periodEnergy <= 30) {
        fileName = `${userAvatar}_sleep${lv}.png`;
    }
    else if (isBreakMode) {
        fileName = (currentSkin !== "default" && currentSkin !== "")
            ? currentSkin.replace('.png', '') + "_idle.png"
            : `${userAvatar}_${lv}.png`;
    }
    else {
        fileName = (currentSkin !== "default" && currentSkin !== "") ? currentSkin : `${userAvatar}_${lv}.png`;
    }

    if (!fileName.endsWith('.png')) fileName += ".png";
    const newSrc = `images/${fileName}`;
    
    if (img.getAttribute('src') !== newSrc) {
        img.src = newSrc;
    }

    img.onerror = () => {
        img.src = hasFailedPeriod ? `images/${userAvatar}_fail1.png` : (isSleeping ? `images/${userAvatar}_sleep1.png` : `images/${userAvatar}_1.png`);
    };
}

// --- 5. ระบบจัดการพื้นหลัง ---
export function updateBackground() {
    const gameBody = document.querySelector('.game-body');
    if (gameBody) {
        const bgFile = currentBG || "classroom.jpg";
        gameBody.style.backgroundImage = `url('images/${bgFile}')`;
    }
}

// --- 6. ระบบบันทึกข้อมูล ---
async function saveUserData() {
    if (!userId) return;
    try {
        const timestamp = Date.now();
        const userRef = doc(db, "students", userId);
        await updateDoc(userRef, {
            name: userName,
            avatar: userAvatar,
            points: score,
            currentSkin: currentSkin,
            currentBG: currentBG,
            status: isSleeping ? (isActuallySwitched ? "สลับแอป" : "ออนไลน์ (ปิดจอ)") : "online",
            lastSeen: timestamp,
            stats: {
                focusSeconds: totalFocusSeconds,
                switches: tabSwitchCount,
                history: periodScores
            },
            lastUpdate: timestamp
        });
        localStorage.setItem("localLastUpdate", timestamp.toString());
    } catch (error) {
        console.error("Firebase Save Error:", error);
    }
}

// --- 7. ฟังก์ชันจัดการหน้าจอ ---
function showScreen(screenId) {
    document.getElementById('lobby-screen').style.setProperty('display', 'none', 'important');
    document.getElementById('setup-screen').style.setProperty('display', 'none', 'important');
    document.getElementById('main-game-area').style.display = 'none';

    if (screenId === 'game') {
        document.getElementById('main-game-area').style.display = 'block';
    } else {
        const target = document.getElementById(screenId);
        if (target) target.style.setProperty('display', 'flex', 'important');
    }
}

window.showSetup = () => { playSound('tap'); showScreen('setup-screen'); };
window.hideSetup = () => { playSound('tap'); showScreen('lobby-screen'); };
window.logout = () => { if (confirm("ออกจากระบบใช่หรือไม่?")) window.location.href = 'index.html'; };

window.selectDuration = (totalMinutes) => {
    playSound('confirm');
    totalPeriods = totalMinutes / 30;
    currentPeriod = 1;
    timeLeft = 1800;
    periodEnergy = 100;
    hasFailedPeriod = false;
    showScreen('game');
    startGameLoop();
    updateUI();
};

// --- 8. ลูปเกมและการจัดการ UI ---
export async function initGame() {
    if (!userId) { window.location.href = 'index.html'; return; }
    updateOnlineStatus("online");

    onSnapshot(doc(db, "students", userId), (docSnap) => {
        if (!docSnap.exists()) {
            localStorage.clear();
            window.location.href = 'index.html';
            return;
        }
        const data = docSnap.data();
        score = data.points || 0;
        const serverTime = data.lastUpdate || 0;
        const localTime = parseInt(localStorage.getItem("localLastUpdate") || "0");

        if (serverTime > localTime) {
            currentSkin = data.currentSkin || "default";
            currentBG = data.currentBG || "classroom.jpg";
            totalFocusSeconds = data.stats?.focusSeconds || 0;
            tabSwitchCount = data.stats?.switches || 0;
            periodScores = data.stats?.history || [];
            localStorage.setItem("localLastUpdate", serverTime.toString());
        }
        updatePointsUI();
        updateImage();
        updateBackground();
    });

    showScreen('lobby-screen');
}

// --- [แก้ไข] ลูปเกมหลัก: ขณะปิดจอ Loop นี้จะหยุดรันบนมือถือส่วนใหญ่ ---
function startGameLoop() {
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(async () => {
        if (hasFailedPeriod) return;
        if (timeLeft > 0) {
            timeLeft--;
            if (!isBreakMode) {
                // 🟢 ในลูปปกติ (ขณะเปิดจอ) ให้คะแนนไปเรื่อยๆ
                totalFocusSeconds++;
                if (periodEnergy < 100) periodEnergy += 0.3;
            }
            updateUI();
        } else {
            await handlePeriodEnd();
        }
    }, 1000);
}

// ✨ [ส่วนแก้ไข: การตรวจจับที่ยืดหยุ่น]
window.addEventListener('blur', () => {
    lastBlurTime = Date.now();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        isSleeping = true;
        // บันทึกเวลาที่ออกไป
        localStorage.setItem("lastExitTime", Date.now().toString());
        
        const timeSinceBlur = Date.now() - lastBlurTime;
        
        // ถ้าวินาทีที่หายไประหว่าง Blur กับ Hidden มันสั้นมาก (< 600ms) 
        // มักจะเป็นพฤติกรรมการกดปุ่ม Home หรือสลับแอปแบบตั้งใจ
        if (timeSinceBlur < 600) { 
            isActuallySwitched = true; 
            tabSwitchCount++;
            updateOnlineStatus("สลับแอป");
        } else {
            // ถ้าช้ากว่านั้น (เช่นจอดับเอง หรือกด Power) ไม่ถือว่าสลับแอป
            isActuallySwitched = false;
            updateOnlineStatus("ออนไลน์ (ปิดจอ)");
        }
        updateImage();
    } else {
        isSleeping = false;
        // ⚡️ หัวใจสำคัญ: คำนวณเวลาที่หายไปตอนจอดับตรงนี้
        handleBackgroundTime(); 
        updateImage();
        updateOnlineStatus("online");
    }
});

async function handleEnergyDepleted() {
    if (!hasFailedPeriod && !isBreakMode) {
        playSound('denied');
        hasFailedPeriod = true;
        const msg = document.getElementById('status-msg');
        if (msg) { msg.innerText = "หลุดโฟกัสจนพลังหมด! ⚡"; msg.style.color = "#f44336"; }
        const resetBtn = document.getElementById('reset-btn');
        if (resetBtn) resetBtn.style.display = "block";
        if (score >= 5) score -= 5; else score = 0;
        await saveUserData();
        updatePointsUI();
        updateImage();
    }
}

async function handlePeriodEnd() {
    if (!isBreakMode) {
        periodScores.push(Math.floor(periodEnergy));
        if (periodEnergy > 50) {
            playSound('confirm');
            score += 10;
            await saveUserData();
            updatePointsUI();
        }
        if (currentPeriod < totalPeriods) {
            isBreakMode = true;
            timeLeft = 300;
            playSound('break');
            alert(`🌟 จบช่วงที่ ${currentPeriod} แล้ว! พักผ่อนได้ 5 นาที`);
        } else {
            showFinalSummary();
            clearInterval(gameInterval);
            showScreen('lobby-screen');
        }
    } else {
        isBreakMode = false;
        currentPeriod++;
        timeLeft = 1800;
        periodEnergy = 100;
        hasFailedPeriod = false;
        playSound('tap');
        alert(`🔔 เริ่มช่วงที่ ${currentPeriod}! กลับมาโฟกัสกันเถอะ`);
    }
    updateImage(); updateBackground(); updateUI();
}

window.restartSession = function () {
    playSound('tap');
    hasFailedPeriod = false;
    periodEnergy = 100;
    timeLeft = 1800;
    const msg = document.getElementById('status-msg');
    if (msg) { msg.innerText = "กำลังใช้สมาธิ... ✨"; msg.style.color = "#4db6ac"; }
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.style.display = "none";
    updateImage(); updateUI();
};

function updateUI() {
    let m = Math.floor(timeLeft / 60);
    let s = timeLeft % 60;
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;

    const energyFill = document.getElementById('energy-fill');
    if (energyFill) {
        energyFill.style.width = `${periodEnergy}%`;
        energyFill.style.background = isBreakMode ? "#4fc3f7" : "linear-gradient(90deg, #4db6ac, #81c784)";
    }
}

window.showStatistics = () => {
    playSound('tap');
    renderStatsModal(periodScores, totalFocusSeconds, tabSwitchCount, userName, getCurrentLevel());
};

function showFinalSummary() {
    const avgFocus = periodScores.length > 0 ? (periodScores.reduce((a, b) => a + b, 0) / periodScores.length) : 0;
    alert(`🏁 จบการเรียนวันนี้!\n- โฟกัสเฉลี่ย: ${avgFocus.toFixed(2)}%\n- สลับหน้าจอรวม: ${tabSwitchCount} ครั้ง\n- แต้มปัจจุบัน: ${score} 💎`);
}

window.openShop = () => { playSound('tap'); updatePointsUI(); document.getElementById('shop-modal').style.display = 'flex'; switchShopTab('skins'); };
window.closeShop = () => { playSound('tap'); document.getElementById('shop-modal').style.display = 'none'; };

window.switchShopTab = (tab) => {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const itemsList = document.querySelector('.items-list');
    if (itemsList) itemsList.innerHTML = "";
    let lv = getCurrentLevel();
    let shopLv = (lv === 'grad') ? '3' : lv;

    if (tab === 'skins') {
        itemsList.innerHTML = `
            <div class="item-card" onclick="selectItem('ชุดเริ่มต้น', 0, 'images/${userAvatar}_${lv}.png', 'skin')"><span>🎓 ชุดพื้นฐาน (Lv.${lv})</span><span class="price free">ฟรี</span></div>
            <div class="item-card" onclick="selectItem('ชุดแฟชั่น 1', 20, 'images/${userAvatar}_${shopLv}_shop1.png', 'skin')"><span>🌟 ชุดแฟชั่น 1</span><span class="price">20 💎</span></div>
            <div class="item-card" onclick="selectItem('ชุดแฟชั่น 2', 40, 'images/${userAvatar}_${shopLv}_shop2.png', 'skin')"><span>✨ ชุดแฟชั่น 2</span><span class="price">40 💎</span></div>
            <div class="item-card" onclick="selectItem('ชุดแฟชั่น 3', 60, 'images/${userAvatar}_${shopLv}_shop3.png', 'skin')"><span>🔥 ชุดแฟชั่น 3</span><span class="price">60 💎</span></div>`;
    } else {
        itemsList.innerHTML = `
            <div class="item-card" onclick="selectItem('ห้องเรียนหลัก', 0, 'images/classroom.jpg', 'bg')"><span>🏫 ห้องเรียนหลัก</span><span class="price free">ฟรี</span></div>
            <div class="item-card" onclick="selectItem('ห้องเรียนสีเขียว', 20, 'images/classroom1.jpg', 'bg')"><span>📘 ห้องเรียนสีเขียว</span><span class="price">20 💎</span></div>
            <div class="item-card" onclick="selectItem('ห้องเรียนยามเย็น', 40, 'images/classroom3.jpg', 'bg')"><span>🌇 ห้องเรียนยามเย็น</span><span class="price">40 💎</span></div>
            <div class="item-card" onclick="selectItem('ห้องเรียนสีฟ้าสดใส', 60, 'images/classroom2.jpg', 'bg')"><span>🩵 ห้องเรียนสีฟ้าสดใส</span><span class="price">60 💎</span></div>`;
    }
};

window.selectItem = (name, price, imgSrc, type) => {
    playSound('tap');
    const previewImg = document.getElementById('shop-preview-img');
    const previewName = document.getElementById('preview-item-name');
    const confirmBtn = document.getElementById('confirm-buy-btn');
    if (previewImg) previewImg.src = imgSrc;
    if (previewName) previewName.innerText = `${name} (${price === 0 ? 'ฟรี' : price + ' 💎'})`;
    
    confirmBtn.onclick = async () => {
        if (score >= price) {
            if (price > 0 && !confirm(`ใช้ ${price} แต้มเพื่อเลือก ${name}?`)) return;
            score -= price;
            const fileName = imgSrc.split('/').pop(); 
            if (type === 'skin') currentSkin = fileName; else currentBG = fileName;
            await saveUserData();
            updatePointsUI();
            if (type === 'skin') updateImage(); else updateBackground();
            playSound('confirm');
            window.closeShop();
        } else { playSound('denied'); alert("แต้มไม่พอ!"); }
    };
};

window.processRedeem = async (cost) => {
    playSound('tap');
    if (score >= cost) {
        if(!confirm(`ต้องการใช้ ${cost} แต้ม เพื่อแลกรางวัลใช่หรือไม่?`)) return;
        score -= cost; 
        try {
            await saveUserData();
            updatePointsUI(); 
            playSound('confirm');
            alert(`แลกรางวัลสำเร็จ! หักไป ${cost} แต้ม`);
        } catch (error) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล"); }
    } else { playSound('denied'); alert("แต้มของคุณไม่เพียงพอ"); }
}

export function updatePointsUI() {
    const ids = ['pts', 'lobby-pts', 'shop-pts-balance', 'current-points', 'points-display'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.innerText = score; });
    const btn50 = document.querySelector('.btn-redeem-small');
    const btn100 = document.querySelector('.btn-redeem-large');
    if(btn50) btn50.disabled = (score < 50);
    if(btn100) btn100.disabled = (score < 100);
}

initGame();