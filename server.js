const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Supabase setup
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cyepadaagpiblzgdytrf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET;

async function supabase(table, method, data = null, filter = null) {
  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  if (filter) url += `?${filter}`;
  const res = await fetch(url, {
    method,
    headers: {
  'Content-Type': 'application/json',
  'apikey': process.env.SUPABASE_SECRET,
  'Authorization': `Bearer ${process.env.SUPABASE_SECRET}`,
  'Prefer': method === 'POST' ? 'return=minimal' : ''
},
    body: data ? JSON.stringify(data) : undefined
  });
  if (method === 'GET') return await res.json();
  return res.status;
}

app.get('/', (req, res) => {
  res.json({ status: 'Discipline Backend Running ✅' });
});

// Save incident
app.post('/save-incident', async (req, res) => {
  try {
    await supabase('incidents', 'POST', req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get all incidents
app.get('/get-incidents', async (req, res) => {
  try {
    const data = await supabase('incidents', 'GET', null, 'order=created_at.desc');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save custom user
app.post('/save-user', async (req, res) => {
  try {
    await supabase('custom_users', 'POST', req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get custom users
app.get('/get-users', async (req, res) => {
  try {
    const data = await supabase('custom_users', 'GET');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete custom user
app.delete('/delete-user/:id', async (req, res) => {
  try {
    await supabase('custom_users', 'DELETE', null, `id=eq.${req.params.id}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Save custom class
app.post('/save-class', async (req, res) => {
  try {
    await supabase('custom_classes', 'POST', req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get custom classes
app.get('/get-classes', async (req, res) => {
  try {
    const data = await supabase('custom_classes', 'GET');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// AI Report
app.post('/generate-report', async (req, res) => {
  try {
    const { studentName, grade, incidents, pastCount, school } = req.body;
    const apiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Write a formal school discipline report in Hindi for parents. Student: ${studentName}, Class: ${grade}, Violation: ${incidents[0].violation}, Date: ${incidents[0].date}, School: ${school}. Keep it under 150 words, formal and respectful.`
            }]
          }]
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
