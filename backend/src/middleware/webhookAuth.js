// External CRM authenticates with a static shared secret (not a user JWT).
const verifyWebhookSecret = (req, res, next) => {
  const incomingSecret =
    req.headers['x-webhook-secret'] ||
    req.headers.patient_webhook_secret ||
    req.headers['patient-webhook-secret'] ||
    req.query.secret;

  if (!process.env.PATIENT_WEBHOOK_SECRET) {
    return res.status(500).json({ success: false, message: 'Webhook secret is not configured on the server' });
  }

  if (!incomingSecret || incomingSecret !== process.env.PATIENT_WEBHOOK_SECRET) {
    return res.status(401).json({ success: false, message: 'Invalid or missing webhook secret' });
  }

  next();
};

module.exports = { verifyWebhookSecret };
