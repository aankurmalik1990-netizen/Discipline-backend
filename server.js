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

    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
          content: `Write a formal school discipline report in Hindi for parents. Student: ${studentName}, Class: ${grade}, Violation: ${incidents[0].violation}, Date: ${incidents[0].date}. Keep it under 150 words.`
        }]
      })
    });

    const text = await apiResponse.text();
    console.log('API Response:', text); // log full response
    const data = JSON.parse(text);

    if(data.error) {
      console.log('API Error:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    if(!data.content || !data.content[0]) {
      console.log('Unexpected response:', JSON.stringify(data));
      return res.status(500).json({ error: 'Unexpected API response' });
    }

    res.json({ report: data.content[0].text });

  } catch (error) {
    console.log('Catch error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
