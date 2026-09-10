const { asyncHandler } = require('../middleware/errorHandler');

const TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
const TRANSCRIPTION_TEXT_MODEL = process.env.OPENAI_TRANSCRIBE_TEXT_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini';

const hasNonRomanScript = (text = '') => /[\u0600-\u06FF\u0900-\u097F]/.test(text);

const cleanTranscription = (text = '') => {
  let clean = String(text || '').trim();
  clean = clean.replace(/Clinic CRM dictation\. Hindi or Hinglish should be written in Roman Hinglish, English in English\. Keep CRM words exact\.?/gi, '').trim();
  clean = clean.replace(/context:\s*###.*?###/gis, '').trim();
  clean = clean.replace(/###\s*Transcribe this clinic CRM voice note accurately.*$/gis, '').trim();
  clean = clean.replace(/Transcribe this clinic CRM voice note accurately\..*?Return only the spoken text\.?/gis, '').trim();
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
};

const extractResponseText = (data = {}) =>
  data.output_text
  || (data.output || [])
    .flatMap((item) => item.content || [])
    .map((item) => item.text || '')
    .join('\n')
    .trim();

const romanizeTranscription = async (text, apiKey) => {
  if (!hasNonRomanScript(text)) return text;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: TRANSCRIPTION_TEXT_MODEL,
      instructions: [
        'Convert the given transcription into Roman Hinglish only.',
        'If any part is already English, keep it as English.',
        'Do not add, remove, answer, summarize, or explain anything.',
        'Keep CRM terms exact: CRM, patient, member, follow-up, SFS, family session, doctor advice, payment, medicine, courier, worksheet, stage.',
        'Return only the converted spoken text.',
      ].join(' '),
      input: text,
      max_output_tokens: 250,
    }),
  });

  if (!response.ok) return text;
  const data = await response.json();
  return cleanTranscription(extractResponseText(data) || text);
};

const transcribeSpeech = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No audio uploaded' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      message: 'OPENAI_API_KEY is not configured',
    });
  }

  const mimeType = req.file.mimetype || 'audio/webm';
  const fileName = req.file.originalname || 'voice.webm';
  const formData = new FormData();
  formData.append('model', TRANSCRIPTION_MODEL);
  formData.append('response_format', 'json');
  formData.append('file', new Blob([req.file.buffer], { type: mimeType }), fileName);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    return res.status(response.status).json({
      success: false,
      message: 'Speech transcription failed',
      details: errorText,
    });
  }

  const data = await response.json();
  const text = await romanizeTranscription(cleanTranscription(data.text || ''), apiKey);
  return res.status(200).json({
    success: true,
    text,
  });
});

module.exports = {
  transcribeSpeech,
};
