import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyA97LHW3LWJyzB6sRP0xms9xICCtImzWHc",
    authDomain: "mindshift-6ebe0.firebaseapp.com",
    projectId: "mindshift-6ebe0",
    storageBucket: "mindshift-6ebe0.firebasestorage.app",
    messagingSenderId: "109403972438",
    appId: "1:109403972438:web:a235f28bc2933f31b02cf7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// ดึงจาก LocalStorage เป็นค่าเริ่มต้น (แต่ในเกมจะดึงจาก DB อีกทีเพื่อความชัวร์)
export const userId = localStorage.getItem('ms_id');
export const userName = localStorage.getItem('ms_name');
export const userAvatar = localStorage.getItem('ms_avatar');