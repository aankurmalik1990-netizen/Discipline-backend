const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

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

// ── Health check ──
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

// ── Incidents ──
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

// ── Users ──
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

app.post('/update-user', async function(req, res) {
  try {
    const { username, password } = req.body;
    await db('custom_users', 'PATCH', { password: password }, 'username=eq.' + username);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI Report ──
app.post('/generate-report', async function(req, res) {
  try {
    const { studentName, grade, incidents, school } = req.body;
    const apiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.GROQ_API_KEY
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: 'Write a formal school discipline report in Hindi for parents. Student: ' + studentName + ', Class: ' + grade + ', Violation: ' + incidents[0].violation + ', School: ' + school + '. Keep it under 150 words, formal and respectful.'
        }]
      })
    });
    const data = await apiResponse.json();
    console.log('Groq report:', JSON.stringify(data).substring(0, 200));
    const report = data.choices[0].message.content;
    res.json({ report });
  } catch(error) {
    console.log('AI Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── Arrangement Photo OCR (GPT-4o Vision) ──
app.post('/read-arrangement', async function(req, res) {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) { res.status(400).json({ error: 'No image provided' }); return; }

    const prompt = `This is a school Teacher's Leave Arrangement sheet (अध्यापक रिक्त पीरियड समय-सारिणी).
Read the table carefully and extract ALL arrangement entries.

Return ONLY a JSON array (no explanation, no markdown, no code fences):
[
  { "period": "I", "absentClass": "IX A", "mergeClass": "IX B", "teacher": "HASANUZZAMAN", "type": "merge" },
  { "period": "II", "absentClass": "X B", "mergeClass": null, "teacher": "MAYANK YADAV", "type": "duty" }
]

Rules:
- period: Roman numeral ONLY (I, II, III, IV, V, VI, VII, VIII)
- absentClass: class whose teacher is absent e.g. "IX A", "VIII C", "XII B"
- mergeClass: class they merge INTO (null if no merge / duty only)
- teacher: the ALTERNATE/ARRANGEMENT teacher name in CAPITAL LETTERS
- type: "merge" if two classes combine, "duty" if teacher goes alone
- Extract every single row, do not skip any
- Return ONLY the JSON array, nothing else`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`,
                detail: 'high'
              }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    const data = await openaiRes.json();
    console.log('GPT-4o OCR:', JSON.stringify(data).substring(0, 300));

    if (!openaiRes.ok) {
      console.error('OpenAI Error:', JSON.stringify(data));
      return res.status(500).json({ error: 'OpenAI Error', details: data });
    }

    let text = data.choices[0].message.content.trim();
    text = text.replace(/```json|```/g, '').trim();

    let arrangements;
    try {
      arrangements = JSON.parse(text);
    } catch(e) {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) arrangements = JSON.parse(match[0]);
      else { res.status(500).json({ error: 'Could not parse response', raw: text }); return; }
    }

    res.json({ arrangements });
  } catch(error) {
    console.log('OCR Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ════════════════════════════════════════
// 🔧 MAINTENANCE ROUTES
// ════════════════════════════════════════

// Save new maintenance report
app.post('/save-maintenance', async function(req, res) {
  try {
    const record = {
      room:        req.body.room,
      issues:      req.body.issues,
      description: req.body.description || '',
      priority:    req.body.priority || 'low',
      teacher:     req.body.teacher,
      status:      'pending',
      report_date: req.body.date,
      report_time: req.body.time,
    };
    await db('maintenance', 'POST', record, null);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Get all maintenance reports (admin)
app.get('/get-maintenance', async function(req, res) {
  try {
    const teacher = req.query.teacher;
    let filter = 'order=created_at.desc';
    if (teacher) filter += '&teacher=eq.' + encodeURIComponent(teacher);
    const data = await db('maintenance', 'GET', null, filter);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Update maintenance status (admin)
app.post('/update-maintenance', async function(req, res) {
  try {
    const { id, status } = req.body;
    await db('maintenance', 'PATCH', { status: status }, 'id=eq.' + id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete maintenance report (admin)
app.delete('/delete-maintenance/:id', async function(req, res) {
  try {
    await db('maintenance', 'DELETE', null, 'id=eq.' + req.params.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});
