require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const market = require('./market');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
const users = new Map(JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')).map(u => [u.email.toLowerCase(), u]));
const saveUsers = () => fs.writeFileSync(USERS_FILE, JSON.stringify([...users.values()], null, 2));

app.use(express.json({ limit: '20kb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-session-secret-before-deployment',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/me', (req, res) => res.json(req.session.userEmail
  ? { authenticated: true, email: req.session.userEmail }
  : { authenticated: false }));

// Existing email => authenticate; new email => create account and sign in.
app.post('/api/auth', async (req, res) => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const password = (req.body || {}).password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'لطفاً ایمیل معتبر وارد کنید.' });
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'رمز عبور باید حداقل ۸ کاراکتر باشد.' });
    let user = users.get(email);
    if (user) {
      if (!(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'رمز عبور اشتباه است.' });
    } else {
      user = { email, passwordHash: await bcrypt.hash(password, 12), createdAt: new Date().toISOString() };
      users.set(email, user);
      saveUsers();
    }
    req.session.userEmail = email;
    res.json({ ok: true, email });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ورود یا ثبت‌نام انجام نشد.' });
  }
});

app.post('/api/change-password', async (req, res) => {
  try {
    const email = req.session.userEmail;
    if (!email) return res.status(401).json({ error: 'ابتدا وارد حساب شوید.' });
    const { oldPassword, newPassword } = req.body || {};
    const user = users.get(email);
    if (!user || !(await bcrypt.compare(String(oldPassword || ''), user.passwordHash))) return res.status(401).json({ error: 'رمز فعلی اشتباه است.' });
    if (typeof newPassword !== 'string' || newPassword.length < 8) return res.status(400).json({ error: 'رمز جدید باید حداقل ۸ کاراکتر باشد.' });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    users.set(email, user);
    saveUsers();
    res.json({ message: 'رمز عبور با موفقیت تغییر کرد.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'تغییر رمز ناموفق بود.' });
  }
});

const requireAuth = (req, res, next) => req.session.userEmail ? next() : res.status(401).json({ error: 'ابتدا وارد حساب شوید.' });
app.get('/api/stocks', requireAuth, (req, res) => { res.set('Cache-Control', 'no-store'); res.json(market.snapshot()); });
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
   app.listen(PORT, '0.0.0.0', () => {
 { console.log(`Sahmyar V12: http://localhost:${PORT}`); market.start(); });
