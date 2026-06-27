import { Router } from 'express';
import { db, uuid, now } from '../db.js';

const r = Router();

// Authentication guard: require user to be logged in
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  next();
}

// Trim free text to at most N words (details field is capped at 20 words).
function limitWords(s, max = 20) {
  if (!s) return null;
  const words = String(s).trim().split(/\s+/);
  return words.slice(0, max).join(' ');
}

const vendorName = (id) => (id ? db.prepare('SELECT name FROM vendors WHERE id=?').get(id)?.name : null);

r.get('/products', requireAuth, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM products ORDER BY name').all()
      .map((p) => ({ ...p, vendor_name: vendorName(p.vendor_id) }));
    res.json(rows);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

r.post('/products', requireAuth, (req, res) => {
  try {
    const b = req.body;
    const id = uuid();
    const ts = now();

    if (!b.name || !String(b.name).trim()) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    db.prepare(`INSERT INTO products (id,name,description,hsn_sac,list_price,details,manufacturer,vendor_id,created_at,updated_at)
      VALUES (@id,@name,@description,@hsn_sac,@list_price,@details,@manufacturer,@vendor_id,@ts,@ts)`)
      .run({ id, name: String(b.name).trim(), description: b.description || null, hsn_sac: b.hsn_sac || null, list_price: Math.round(b.list_price || 0), details: limitWords(b.details), manufacturer: b.manufacturer || null, vendor_id: b.vendor_id || null, ts });

    res.status(201).json(db.prepare('SELECT * FROM products WHERE id=?').get(id));
  } catch (err) {
    console.error('Error creating product:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

r.patch('/products/:id', requireAuth, (req, res) => {
  try {
    const ex = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
    if (!ex) return res.status(404).json({ error: 'Not found' });

    const b = req.body;
    const ts = now();
    const m = {
      name: b.name ?? ex.name,
      description: b.description ?? ex.description,
      hsn_sac: b.hsn_sac ?? ex.hsn_sac,
      list_price: b.list_price != null ? Math.round(b.list_price) : ex.list_price,
      details: b.details !== undefined ? limitWords(b.details) : ex.details,
      manufacturer: b.manufacturer ?? ex.manufacturer,
      vendor_id: b.vendor_id !== undefined ? (b.vendor_id || null) : ex.vendor_id,
    };

    db.prepare(`UPDATE products SET name=@name,description=@description,hsn_sac=@hsn_sac,list_price=@list_price,details=@details,manufacturer=@manufacturer,vendor_id=@vendor_id,updated_at=@ts WHERE id=@id`)
      .run({ id: req.params.id, ...m, ts });

    res.json(db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id));
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

r.delete('/products/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add vendor-form products to the master catalogue (skip ones already present for that vendor).
export function syncVendorProducts(vendorId, products) {
  if (!Array.isArray(products)) return;
  const ts = now();
  const exists = db.prepare('SELECT 1 FROM products WHERE vendor_id=? AND lower(name)=lower(?)');
  const ins = db.prepare(`INSERT INTO products (id,name,description,hsn_sac,list_price,details,manufacturer,vendor_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (const p of products) {
    const name = (p.description || p.name || '').trim();
    if (!name) continue;
    if (exists.get(vendorId, name)) continue;
    ins.run(uuid(), name, null, p.hsn_sac || null, Math.round(p.rate || 0), null, null, vendorId, ts, ts);
  }
}

export default r;
