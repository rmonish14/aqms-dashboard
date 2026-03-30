const express = require('express');
const { pool } = require('../config/db');
const router = express.Router();

// Get database overview (size, table list, row counts)
router.get('/overview', async (req, res) => {
  try {
    const sizeRes = await pool.query('SELECT pg_size_pretty(pg_database_size(current_database())) as size, current_database() as db_name');
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tables = [];
    for (const row of tablesRes.rows) {
      const countRes = await pool.query(`SELECT COUNT(*) FROM "${row.table_name}"`);
      tables.push({
        name: row.table_name,
        rowCount: parseInt(countRes.rows[0].count, 10)
      });
    }

    res.json({
      database: sizeRes.rows[0].db_name,
      size: sizeRes.rows[0].size,
      tables
    });
  } catch (err) {
    console.error('[DB Route] Error fetching overview:', err.message);
    res.status(500).json({ error: 'Failed to fetch database overview' });
  }
});

// Get table data
router.get('/table/:name', async (req, res) => {
  const tableName = req.params.name;
  
  try {
    // Validate table name to prevent SQL Injection
    const validTablesRes = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const validTables = validTablesRes.rows.map(r => r.table_name);
    
    if (!validTables.includes(tableName)) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const dataRes = await pool.query(`SELECT * FROM "${tableName}" ORDER BY id DESC LIMIT 100`);
    
    // Mask passwords for safety
    let rows = dataRes.rows;
    if (tableName === 'users') {
      rows = rows.map(r => ({ ...r, password: '••••••••••••••••' }));
    }

    // Get column info
    const colsRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [tableName]);

    res.json({
      table: tableName,
      columns: colsRes.rows.map(c => ({ name: c.column_name, type: c.data_type })),
      rows
    });
  } catch (err) {
    console.error(`[DB Route] Error fetching table ${tableName}:`, err.message);
    res.status(500).json({ error: `Failed to fetch table ${tableName}` });
  }
});

module.exports = router;
