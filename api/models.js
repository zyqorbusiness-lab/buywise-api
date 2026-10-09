module.exports = async (req, res) => {
  const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY } });
  const j = await r.json();
  res.status(200).json({ ids: (j.data || []).map((m) => m.id), status: r.status });
};
