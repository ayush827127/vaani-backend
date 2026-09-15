const AppError = require('../../utils/AppError');
const env = require('../../config/env');

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
// llama-3.3-70b-versatile (the model this proxy originally mirrored from the
// client-side code) has been retired by Groq — confirmed via /v1/models this
// account no longer has access to any llama-3.x chat model. gpt-oss-20b is
// fast and follows the "JSON array only" instruction cleanly in testing.
const GROQ_MODEL = 'openai/gpt-oss-20b';

// Thin passthrough — all prompt-building and response-parsing business logic
// stays in the Flutter app. This exists solely so the Groq key never ships
// inside the app bundle.
async function parse(prompt) {
  if (!env.groqApiKey) {
    throw new AppError('Voice AI is not configured', 500);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AppError('Voice AI request timed out', 504);
    }
    throw new AppError('Voice AI request failed', 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new AppError('Voice AI request failed', 502);
  }

  const envelope = await response.json();
  const text = envelope?.choices?.[0]?.message?.content?.toString().trim() ?? '';
  return text;
}

module.exports = { parse };
