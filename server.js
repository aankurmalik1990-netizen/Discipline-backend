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

    const apiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
    console.log('Gemini response:', JSON.stringify(data));

    const report = data.candidates[0].content.parts[0].text;
    res.json({ report });

  } catch (error) {
    console.log('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
