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

    const apiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama3-8b-instant',
        messages: [{
          role: 'user',
          content: `Write a formal school discipline report in Hindi for parents. Student: ${studentName}, Class: ${grade}, Violation: ${incidents[0].violation}, Date: ${incidents[0].date}, School: ${school}. Keep it under 150 words, formal and respectful.`
        }],
        max_tokens: 500
      })
    });

    const data = await apiResponse.json();
    console.log('Groq response:', JSON.stringify(data));
    const report = data.choices[0].message.content;
    res.json({ report });

  } catch (error) {
    console.log('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
