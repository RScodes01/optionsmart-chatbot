/**
 * journal.js — Trade Journal CRUD routes (MongoDB)
 *
 * GET    /api/journal/trades        → Get all trades for user
 * POST   /api/journal/trades        → Log a new trade
 * DELETE /api/journal/trades/:id    → Delete a trade
 */

const express   = require('express');
const router    = express.Router();
const { ObjectId } = require('mongodb');
const logger    = require('../utils/logger');

function requireAuth(req, res, next) {
  const uid = req.user?.uid || req.headers['x-uid'];
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  req.uid = uid;
  next();
}

function getCollection(req) {
  return req.app.locals.db.collection('trade_journal');
}

router.get('/trades', requireAuth, async (req, res) => {
  try {
    const trades = await getCollection(req)
      .find({ uid: req.uid })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    res.json({ ok: true, trades });
  } catch (err) {
    logger.error('[Journal] Get trades error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/trades', requireAuth, async (req, res) => {
  const { date, time, instrument, strategy, entry, exit, qty, pnl, exitReason, notes } = req.body;
  if (!instrument || !entry || !exit) {
    return res.status(400).json({ error: 'instrument, entry and exit are required' });
  }
  try {
    const doc = {
      uid: req.uid,
      date, time, instrument, strategy,
      entry: parseFloat(entry),
      exit: parseFloat(exit),
      qty: parseFloat(qty) || 1,
      pnl: parseFloat(pnl),
      exitReason: exitReason || '',
      notes: notes || '',
      createdAt: new Date(),
    };
    const result = await getCollection(req).insertOne(doc);
    res.json({ ok: true, id: result.insertedId });
  } catch (err) {
    logger.error('[Journal] Save trade error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/trades/:id', requireAuth, async (req, res) => {
  try {
    await getCollection(req).deleteOne({ _id: new ObjectId(req.params.id), uid: req.uid });
    res.json({ ok: true });
  } catch (err) {
    logger.error('[Journal] Delete trade error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
