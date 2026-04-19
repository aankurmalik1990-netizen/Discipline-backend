const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

const SUPABASE_URL = 'https://cyepadaagpiblzgdytrf.supabase.co';
const SUPABASE_KEY = process.env.DB_KEY || '';

async function db(table, method, data, filter) {
  let url = SUPABASE_URL + '/rest/v1/' + table;
  if (filter) url += '?' + filter;
  const res = await fetch(url, {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'apikey': SUPABASE_KEY,
      'Prefer': 'return=minimal'
    },
    body: data ? JSON.stringify(data) : undefined
  });
  if (method === 'GET') return await res.json();
  return res.status;
}

app.get('/', function(req, res) {
  res.json({
    status: 'Running',
    key_set: SUPABASE_KEY.length > 0,
    key_start: SUPABASE_KEY.substring(0, 10)
  });
});

app.get('/test-db', async function(req, res) {
  try {
    const result = await db('incidents', 'GET', null, 'limit=1');
    res.json({ success: true, result: result });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

app.post('/save-incident', async function(req, res) {
  try {
    await db('incidents', 'POST', req.body, null);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/get-incidents', async function(req, res) {
  try {
    const data = await db('incidents', 'GET', null, 'order=created_at.desc');
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/save-user', async function(req, res) {
  try {
    await db('custom_users', 'POST', req.body, null);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/get-users', async function(req, res) {
  try {
    const data = await db('custom_users', 'GET', null, null);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/delete-user/:id', async function(req, res) {
  try {
    await db('custom_users', 'DELETE', null, 'id=eq.' + req.params.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/generate-report', async function(req, res) {
  try {
    const { studentName, grade, incidents, school } = req.body;
    const apiResponse = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + process.env.GEMINI_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Write a formal school discipline report in Hindi for parents. Student: ' + studentName + ', Class: ' + grade + ', Violation: ' + incidents[0].violation + ', School: ' + school + '. Keep it under 150 words.' }] }]
        })
      }
    );
    const data = await apiResponse.json();
    const report = data.candidates[0].content.parts[0].text;
    res.json({ report: report });
  } catch(error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});
