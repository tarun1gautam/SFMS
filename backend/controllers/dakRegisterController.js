const pool = require('../config/db');
const { logAction } = require('../utils/auditLogger');

async function hasFullDakAccess(req, entryCreatedBy) {
  if (req.user.role === 'admin') return true;
  if (entryCreatedBy === req.user.user_id) return true;
  const result = await pool.query(
    'SELECT dak_register_manager FROM users WHERE user_id = $1',
    [req.user.user_id]
  );
  return result.rows[0]?.dak_register_manager === true;
}

// GET /api/dak-register
const listEntries = async (req, res) => {
  try {
    const { search, from, to, page = 1, pageSize = 25, sortField, sortOrder } = req.query;

    const conditions = [];
    const values = [];
    let idx = 1;

    if (from) {
      conditions.push(`entry_date >= $${idx++}`);
      values.push(from);
    }
    if (to) {
      conditions.push(`entry_date <= $${idx++}`);
      values.push(to);
    }
    if (search) {
      conditions.push(`(assigned_to ILIKE $${idx} OR subject ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(parseInt(pageSize) || 25, 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

    const sortFieldMap = {
      id: 'd.id',
      entry_date: 'd.entry_date',
      doc_type: 'd.doc_type',
      subject: 'd.subject',
      received_by: 'd.received_by',      // new sortable field
      assigned_to: 'd.assigned_to',
      created_by: 'd.created_by',
    };
    const dbSortField = sortFieldMap[sortField] || 'd.entry_date';
    const dbSortOrder = sortOrder && sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderClause = sortField ? `ORDER BY ${dbSortField} ${dbSortOrder}` : `ORDER BY d.entry_date DESC, d.id DESC`;

    const result = await pool.query(
      `SELECT
         d.*,
         d.id AS serial_no,
         f.original_name AS linked_file_name,
         latest.location AS current_status,
         latest.moved_at AS current_status_at
       FROM dak_register d
       LEFT JOIN files f ON f.id = d.linked_file_id
       LEFT JOIN LATERAL (
         SELECT location, moved_at FROM dak_register_movements
         WHERE entry_id = d.id ORDER BY moved_at DESC LIMIT 1
       ) latest ON true
       ${whereClause}
       ${orderClause}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM dak_register d ${whereClause}`,
      values
    );

    res.json({
      entries: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      pageSize: limit,
    });
  } catch (err) {
    console.error('List dak register entries error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/dak-register
const createEntry = async (req, res) => {
  try {
    const { entry_date, doc_type, subject, description, assigned_to, received_by, linked_file_id } = req.body;

    if (!entry_date || !doc_type) {
      return res.status(400).json({ error: 'entry_date and doc_type are required' });
    }
    if (!['Letter', 'PUC'].includes(doc_type)) {
      return res.status(400).json({ error: 'doc_type must be "Letter" or "PUC"' });
    }

    const result = await pool.query(
      `INSERT INTO dak_register
         (entry_date, doc_type, subject, description, assigned_to, received_by, linked_file_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        entry_date,
        doc_type,
        subject || null,
        description || null,
        assigned_to || null,
        received_by || null,
        linked_file_id || null,
        req.user.user_id
      ]
    );

    await logAction({
      req, action: 'dak_register.entry_created', targetType: 'dak_register',
      targetId: result.rows[0].id, targetLabel: subject || doc_type,
      metadata: { assigned_to, received_by },
    });

    res.status(201).json({ entry: result.rows[0] });
  } catch (err) {
    console.error('Create dak register entry error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/dak-register/:id
const updateEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query('SELECT created_by FROM dak_register WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    if (!(await hasFullDakAccess(req, existing.rows[0].created_by))) {
      return res.status(403).json({ error: 'You do not have permission to edit this entry' });
    }
    if (req.body.doc_type !== undefined && !['Letter', 'PUC'].includes(req.body.doc_type)) {
      return res.status(400).json({ error: 'doc_type must be "Letter" or "PUC"' });
    }

    const allowedFields = ['entry_date', 'doc_type', 'subject', 'description', 'assigned_to', 'received_by', 'linked_file_id'];

    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(req.body[key] === '' ? null : req.body[key]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }
    fields.push(`updated_at = NOW()`);

    values.push(id);
    const result = await pool.query(
      `UPDATE dak_register SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    await logAction({
      req, action: 'dak_register.entry_updated', targetType: 'dak_register',
      targetId: id, targetLabel: result.rows[0].subject,
    });

    res.json({ entry: result.rows[0] });
  } catch (err) {
    console.error('Update dak register entry error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/dak-register/:id
const deleteEntry = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query('SELECT created_by, subject FROM dak_register WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    if (!(await hasFullDakAccess(req, existing.rows[0].created_by))) {
      return res.status(403).json({ error: 'You do not have permission to delete this entry' });
    }

    await pool.query('DELETE FROM dak_register WHERE id = $1', [id]);

    await logAction({
      req, action: 'dak_register.entry_deleted', targetType: 'dak_register',
      targetId: id, targetLabel: existing.rows[0].subject,
    });

    res.json({ message: 'Entry deleted' });
  } catch (err) {
    console.error('Delete dak register entry error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/dak-register/:id/movements
const listMovements = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT * FROM dak_register_movements WHERE entry_id = $1 ORDER BY moved_at ASC`,
      [id]
    );
    res.json({ movements: result.rows });
  } catch (err) {
    console.error('List movements error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/dak-register/:id/movements
const addMovement = async (req, res) => {
  try {
    const { id } = req.params;
    const { location, sent_by, received_by, description, remarks, occurred_at } = req.body;

    if (!location || !location.trim()) {
      return res.status(400).json({ error: 'location is required' });
    }

    const entry = await pool.query('SELECT created_by FROM dak_register WHERE id = $1', [id]);
    if (entry.rows.length === 0) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const result = await pool.query(
      `INSERT INTO dak_register_movements
         (entry_id, location, sent_by, received_by, description, remarks, occurred_at, logged_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        id, location.trim(), sent_by || null, received_by || null,
        description || null, remarks || null, occurred_at || null, req.user.user_id,
      ]
    );

    await logAction({
      req, action: 'dak_register.movement_logged', targetType: 'dak_register',
      targetId: id, targetLabel: location,
    });

    res.status(201).json({ movement: result.rows[0] });
  } catch (err) {
    console.error('Add movement error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/dak-register/:id/movements/:movementId
const deleteMovement = async (req, res) => {
  try {
    const { id, movementId } = req.params;

    const movement = await pool.query(
      `SELECT m.*, d.created_by AS entry_created_by
       FROM dak_register_movements m
       JOIN dak_register d ON d.id = m.entry_id
       WHERE m.id = $1 AND m.entry_id = $2`,
      [movementId, id]
    );
    if (movement.rows.length === 0) {
      return res.status(404).json({ error: 'Movement not found' });
    }

    const { logged_by, entry_created_by } = movement.rows[0];
    const isAdmin = req.user.role === 'admin';
    const isManager = await pool.query(
      'SELECT dak_register_manager FROM users WHERE user_id = $1',
      [req.user.user_id]
    ).then(res => res.rows[0]?.dak_register_manager === true);
    const isEntryCreator = entry_created_by === req.user.user_id;
    const isMovementLogger = logged_by === req.user.user_id;

    if (!isAdmin && !isManager && !isEntryCreator && !isMovementLogger) {
      return res.status(403).json({ error: 'You do not have permission to delete this update' });
    }

    await pool.query('DELETE FROM dak_register_movements WHERE id = $1', [movementId]);

    await logAction({
      req, action: 'dak_register.movement_deleted', targetType: 'dak_register',
      targetId: id, targetLabel: movement.rows[0].location,
    });

    res.json({ message: 'Movement deleted' });
  } catch (err) {
    console.error('Delete movement error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/dak-register/locations/suggestions
const listLocationSuggestions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT location FROM dak_register_movements ORDER BY location ASC LIMIT 50`
    );
    res.json({ locations: result.rows.map(r => r.location) });
  } catch (err) {
    console.error('List location suggestions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/dak-register/files/search
const searchLinkableFiles = async (req, res) => {
  try {
    const { q = '' } = req.query;
    const result = await pool.query(
      `SELECT id, original_name FROM files WHERE original_name ILIKE $1 ORDER BY created_at DESC LIMIT 10`,
      [`%${q}%`]
    );
    res.json({ files: result.rows });
  } catch (err) {
    console.error('Search linkable files error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/dak-register/admin/users/:userId/access
const adminSetDakAccess = async (req, res) => {
  try {
    const { userId } = req.params;
    const { hasAccess } = req.body;

    if (typeof hasAccess !== 'boolean') {
      return res.status(400).json({ error: 'hasAccess must be true or false' });
    }

    const result = await pool.query(
      'UPDATE users SET dak_register_manager = $1 WHERE user_id = $2 RETURNING user_id, dak_register_manager',
      [hasAccess, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await logAction({
      req,
      action: hasAccess ? 'dak_register.access_granted' : 'dak_register.access_revoked',
      targetType: 'user', targetId: userId, targetLabel: userId,
      metadata: { by: req.user.user_id },
    });

    res.json({ user_id: userId, dak_register_manager: hasAccess });
  } catch (err) {
    console.error('Admin set dak access error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  listEntries, createEntry, updateEntry, deleteEntry, searchLinkableFiles,
  listMovements, addMovement, deleteMovement, listLocationSuggestions, adminSetDakAccess,
};