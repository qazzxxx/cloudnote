import express from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-it';

// GET /api/auth/status - Check if auth is required and if user is authenticated (frontend check)
router.get('/status', (req, res) => {
  const requiresAuth = !!process.env.PASSWORD;
  res.json({ requiresAuth });
});

// POST /api/auth/login - Login
router.post('/login', (req, res) => {
  const { password } = req.body;
  const envPassword = process.env.PASSWORD;

  if (!envPassword) {
    return res.json({ token: null, message: 'No password required' });
  }

  if (password === envPassword) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  }

  res.status(401).json({ error: 'Invalid password' });
});

export default router;
