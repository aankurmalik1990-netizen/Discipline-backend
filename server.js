const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

const SUPABASE_URL = 'https://cyepadaagpiblzgdytrf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SEC || '';

async function db(table, method, data = null, filter = null) {
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  if (filter) url += `?${filter}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'apikey': SUPABASE_KEY,
    'Prefer': 'return=minimal'
  };
  const res = await fetch(url, {
    method, headers,
    body: data ? JSON.stringify(data) : undefined
  });
  console.log(`${method} ${table} → status: ${res.status}`);
  if (method === 'GET') {
    const text = await res.text();
    console.log('Response:', text.substring(0, 200));
    return JSON.parse(text);
  }
  return res.status;
}

app.get('/', (req, res) => {
  res.json({ 
  status: 'Discipline Backend Running ✅', 
  key_set: !!SUPABASE_KEY,
  env_keys: Object.keys(process.env).filter(k => k.includes('SUPA'))
});
});

app.get('/test-db', async (req, res) => {
  try {
    const result = await db('incidents', 'GET', null, 'limit=1');
    res.json({ success: true, result });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

app.post('/save-incident', async (req, res) => {
  try {
    await db('incidents', 'POST', req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/get-incidents', async (req, res) => {
  try {
    const data = await db('incidents', 'GET', null, 'order=created_at.desc');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/save-user', async (req, res) => {
  try {
    await db('custom_users', 'POST', req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/get-users', async (req, res) => {
  try {
    const data = await db('custom_users', 'GET');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/delete-user/:id', async (req, res) => {
  try {
    await db('custom_users', 'DELETE', null, `id=eq.${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/generate-report', async (req, res) => {
  try {
    const { studentName, grade, incidents, school } = req.body;
    const apiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Write a formal school discipline report in Hindi for parents. Student: ${studentName}, Class: ${grade}, Violation: ${incidents[0].violation}, Date: ${incidents[0].date}, School: ${school}. Keep it under 150 words.` }] }]
        })
      }
    );
    const data = await apiResponse.json();
    const report = data.candidates[0].content.parts[0].text;
    res.json({ report });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
