const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'Discipline Backend Running ✅' });
});

app.post('/generate-report', async (req, res) => {
  try {
    const { studentName, grade, incidents, pastCount, school } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a school discipline assistant at ${school}. Write a formal discipline report in Hindi for parents. Student: ${studentName}, Class: ${grade}, Violation: ${incidents[0].violation}, Date: ${incidents[0].date}, Past violations: ${pastCount}. Keep it under 150 words, formal and respectful.`
        }]
      })
    });

    const data = await response.json();
    if(data.error) {
      return res.status(500).json({ error: data.error.message });
    }
    res.json({ report: data.content[0].text });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
