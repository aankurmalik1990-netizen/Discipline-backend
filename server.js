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
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('Supabase ' + method + ' ' + table + ' failed (' + res.status + '): ' + errText);
  }
  if (method === 'GET') return await res.json();
  return res.status;
}

// ── Gemini retry helper ──
// Retries once on 429/503/UNAVAILABLE, then falls back to gemini-2.5-flash-lite.
function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

async function callGeminiOpenAI(modelList, body) {
  let lastData = null;
  for (let m = 0; m < modelList.length; m++) {
    const model = modelList[m];
    for (let attempt = 0; attempt < 2; attempt++) {
      const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.GEMINI_API_KEY
        },
        body: JSON.stringify(Object.assign({}, body, { model: model }))
      });
      const data = await resp.json();
      if (resp.ok && data.choices && data.choices[0]) {
        return { ok: true, data: data, model: model };
      }
      lastData = data;
      const code = (data && data.error && data.error.code) || resp.status;
      const retryable = (code === 429 || code === 503 || code === 500);
      console.log('Gemini ' + model + ' attempt ' + (attempt+1) + ' failed (' + code + '), retryable=' + retryable);
      if (!retryable) break;
      if (attempt === 0) await sleep(1500);
    }
  }
  return { ok: false, data: lastData };
}

async function callGeminiNative(modelList, body) {
  let lastData = null;
  for (let m = 0; m < modelList.length; m++) {
    const model = modelList[m];
    for (let attempt = 0; attempt < 2; attempt++) {
      const resp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + process.env.GEMINI_API_KEY,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );
      const data = await resp.json();
      if (resp.ok && data.candidates && data.candidates[0]) {
        return { ok: true, data: data, model: model };
      }
      lastData = data;
      const code = (data && data.error && data.error.code) || resp.status;
      const retryable = (code === 429 || code === 503 || code === 500);
      console.log('Gemini ' + model + ' attempt ' + (attempt+1) + ' failed (' + code + '), retryable=' + retryable);
      if (!retryable) break;
      if (attempt === 0) await sleep(1500);
    }
  }
  return { ok: false, data: lastData };
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
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: 'Write a formal school discipline report in English for parents. Student: ' + studentName + ', Class: ' + grade + ', Violation: ' + incidents[0].violation + ', School: ' + school + '. Keep it under 150 words, formal and respectful.'
        }]
      })
    });

    const data = await apiResponse.json();
    console.log('Groq report:', JSON.stringify(data).substring(0, 200));

    if (!apiResponse.ok || !data.choices || !data.choices[0]) {
      console.error('Groq Error:', JSON.stringify(data));
      return res.status(500).json({ error: 'Groq Error', details: data });
    }

    const report = data.choices[0].message.content;
    res.json({ report });
  } catch(error) {
    console.log('Groq Report Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── Arrangement Photo OCR (Gemini-2.5-flash Vision) ──
app.post('/read-arrangement', async function(req, res) {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) { res.status(400).json({ error: 'No image provided' }); return; }

    const prompt = `You are reading a handwritten school Teacher's Leave Arrangement sheet (अध्यापक रिक्त पीरियड समय-सारिणी).
The sheet is a TABLE with rows for each PERIOD (I through VIII) and columns showing which classes need coverage.

Your job: extract EVERY SINGLE arrangement entry from the table — usually 6 to 12 rows total.

CRITICAL: Look at the ENTIRE image carefully — top to bottom, left to right. Do not stop after finding 1 or 2 rows. A typical sheet has entries for MOST periods I through VIII. If you only find 1-2 entries, you are MISSING rows — look again at every cell of the table.

Return ONLY a JSON array (no explanation, no markdown):
[
  { "period": "I", "absentClass": "IX A", "mergeClass": "IX B", "teacher": "HASANUZZAMAN", "type": "merge" },
  { "period": "II", "absentClass": "X B", "mergeClass": null, "teacher": "MAYANK YADAV", "type": "duty" }
]

Rules:
- period: Roman numeral ONLY (I, II, III, IV, V, VI, VII, VIII)
- absentClass: class whose teacher is absent e.g. "IX A", "VIII C", "XII B". If two classes are combined like "IX B+A", keep as "IX B+A"
- mergeClass: class they merge INTO (null if no merge / duty only)
- teacher: the ALTERNATE/ARRANGEMENT teacher name in CAPITAL LETTERS (the person filling in for the absent teacher)
- type: "merge" if two classes combine, "duty" if teacher goes alone to cover
- Extract every single row visible in the table — even if handwriting is unclear, give your best guess
- If a period has multiple arrangements, return multiple entries for that period
- Return ONLY the JSON array, nothing else`;

    const result = await callGeminiNative(
      ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
      {
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } },
            { text: prompt }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8000,
          thinkingConfig: { thinkingBudget: 0 }
        }
      }
    );

    if (!result.ok) {
      console.error('Gemini OCR Error (all retries failed):', JSON.stringify(result.data));
      return res.status(503).json({ error: 'Gemini temporarily unavailable, please try again.', details: result.data });
    }

    const data = result.data;
    console.log('Gemini OCR (' + result.model + '):', JSON.stringify(data).substring(0, 1500));

    // Defensive: response may be missing parts/text on safety blocks
    if (!data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      console.error('Gemini OCR: empty content', JSON.stringify(data).substring(0, 500));
      return res.status(500).json({ error: 'Empty response from AI, please retry.' });
    }

    let text = data.candidates[0].content.parts[0].text || '';
    text = text.trim().replace(/```json|```/g, '').trim();

    // Robust JSON extraction — never let a parse error crash the process
    let arrangements = null;
    try {
      arrangements = JSON.parse(text);
    } catch(e1) {
      // Try finding the array in the text
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try { arrangements = JSON.parse(match[0]); } catch(e2) { /* fall through */ }
      }
      // Last resort: trim trailing garbage and try again (handles truncation)
      if (!arrangements) {
        const lastClose = text.lastIndexOf('}');
        if (lastClose > 0) {
          try { arrangements = JSON.parse(text.substring(0, lastClose + 1) + ']'); } catch(e3) { /* give up */ }
        }
      }
    }

    if (!Array.isArray(arrangements)) {
      console.error('OCR parse failed. Raw text:', text.substring(0, 500));
      return res.status(500).json({ error: 'Could not parse AI response. Please retry with a clearer photo.' });
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

// Global crash protectors — keep the process alive on unexpected errors.
// Without these, a single bad request can take down the whole server.
process.on('uncaughtException', function(err) {
  console.error('UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', function(reason) {
  console.error('UNHANDLED REJECTION:', reason);
});
