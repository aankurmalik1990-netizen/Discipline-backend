const express = require('express');
const cors = require('cors');
const app = express();

// ✅ Only your Netlify site can call this
app.use(cors({ 
  origin: origin: 'https://asgsbvrsp1003152.netlify.app' // replace with your URL
}));
app.use(express.json());

// ✅ Health check
app.get('/', (req, res) => {
  res.json({ status: 'Discipline Backend Running ✅' });
});

// ✅ Generate AI discipline report
app.post('/generate-report', async (req, res) => {
  try {
    const { studentName, grade, incidents } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `You are a school discipline assistant. Write a professional 
          discipline report for the following student:
          
          Name: ${studentName}
          Grade: ${grade}
          Incidents: ${JSON.stringify(incidents)}
          
          Write a formal, respectful report suitable for parents and school records.`
        }]
      })
    });

    const data = await response.json();
    res.json({ report: data.content[0].text });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

// ✅ Log a new incident
app.post('/log-incident', async (req, res) => {
  try {
    const { studentName, grade, description, severity, teacherName } = req.body;
    
    // For now returns success — later connect to database
    res.json({ 
      success: true, 
      message: 'Incident logged',
      incident: { studentName, grade, description, severity, teacherName, date: new Date() }
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to log incident' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
