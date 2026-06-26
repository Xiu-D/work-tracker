/* ======================================
   Authentication Module
   ====================================== */

import { auth, googleProvider } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

// ─── DOM References ──────────────────────────────
const $ = (sel) => document.querySelector(sel);
const elLoginScreen   = $('#loginScreen');
const elMainApp       = $('#mainApp');
const elUserBar       = $('#userBar');
const elUserEmail     = $('#userEmail');
const elLoginForm     = $('#loginForm');
const elAuthEmail     = $('#authEmail');
const elAuthPassword  = $('#authPassword');
const elLoginBtn      = $('#loginBtn');
const elSignupBtn     = $('#signupBtn');
const elGoogleBtn     = $('#googleLoginBtn');
const elLogoutBtn     = $('#logoutBtn');
const elAuthError     = $('#authError');
const elLoadingOverlay = $('#loadingOverlay');

// ─── Show / Hide helpers ─────────────────────────
function showLogin() {
  elLoginScreen.style.display = 'flex';
  elMainApp.style.display = 'none';
  elUserBar.style.display = 'none';
  elLoadingOverlay.style.display = 'none';
}

function showApp(user) {
  elLoginScreen.style.display = 'none';
  elMainApp.style.display = 'block';
  elUserBar.style.display = 'flex';
  elLoadingOverlay.style.display = 'none';
  elUserEmail.textContent = user.email || user.displayName || '使用者';
}

function showError(msg) {
  elAuthError.textContent = msg;
  elAuthError.style.display = 'block';
  setTimeout(() => { elAuthError.style.display = 'none'; }, 4000);
}

function setLoading(loading) {
  elLoginBtn.disabled = loading;
  elSignupBtn.disabled = loading;
  elGoogleBtn.disabled = loading;
}

// ─── Firebase error → 繁體中文 ──────────────────
function translateError(code) {
  const map = {
    'auth/email-already-in-use': '此電子郵件已被註冊',
    'auth/invalid-email': '電子郵件格式不正確',
    'auth/user-not-found': '找不到此帳號',
    'auth/wrong-password': '密碼錯誤',
    'auth/weak-password': '密碼強度不足（至少 6 個字元）',
    'auth/too-many-requests': '登入嘗試次數過多，請稍後再試',
    'auth/popup-closed-by-user': '已取消 Google 登入',
    'auth/network-request-failed': '網路連線失敗，請檢查網路',
    'auth/invalid-credential': '電子郵件或密碼錯誤',
  };
  return map[code] || '登入失敗，請再試一次';
}

// ─── Email/Password Sign Up ─────────────────────
elSignupBtn.addEventListener('click', async () => {
  const email = elAuthEmail.value.trim();
  const password = elAuthPassword.value;
  if (!email || !password) { showError('請輸入電子郵件與密碼'); return; }
  setLoading(true);
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (e) {
    showError(translateError(e.code));
  }
  setLoading(false);
});

// ─── Email/Password Sign In ─────────────────────
elLoginBtn.addEventListener('click', async () => {
  const email = elAuthEmail.value.trim();
  const password = elAuthPassword.value;
  if (!email || !password) { showError('請輸入電子郵件與密碼'); return; }
  setLoading(true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    showError(translateError(e.code));
  }
  setLoading(false);
});

// ─── Google Sign In ─────────────────────────────
elGoogleBtn.addEventListener('click', async () => {
  setLoading(true);
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    showError(translateError(e.code));
  }
  setLoading(false);
});

// ─── Enter key on password → sign in ────────────
elAuthPassword.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); elLoginBtn.click(); }
});

// ─── Sign Out ───────────────────────────────────
elLogoutBtn.addEventListener('click', async () => {
  await signOut(auth);
});

// ─── Auth State Observer ────────────────────────
// Export a promise-based listener for app.js to hook into
let authReadyResolve;
const authReady = new Promise((resolve) => { authReadyResolve = resolve; });

let onLoginCallback = null;
let onLogoutCallback = null;

function onLogin(cb) { onLoginCallback = cb; }
function onLogout(cb) { onLogoutCallback = cb; }

onAuthStateChanged(auth, (user) => {
  if (user) {
    showApp(user);
    if (onLoginCallback) onLoginCallback(user);
  } else {
    showLogin();
    if (onLogoutCallback) onLogoutCallback();
  }
  authReadyResolve();
});

export { authReady, onLogin, onLogout };
