const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const connectDB = require('./src/config/db');
const { errorHandler } = require('./src/middleware/errorHandler');
const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const patientRoutes = require('./src/routes/patientRoutes');
const webhookRoutes = require('./src/routes/webhookRoutes');
const scheduleRoutes = require('./src/routes/scheduleRoutes');
const medicineRoutes = require('./src/routes/medicineRoutes');
const courierRoutes = require('./src/routes/courierRoutes');
const accountRoutes = require('./src/routes/accountRoutes');
const adviceRoutes = require('./src/routes/adviceRoutes');
const worksheetRoutes = require('./src/routes/worksheetRoutes');
const crmChatRoutes = require('./src/routes/crmChatRoutes');
const speechRoutes = require('./src/routes/speechRoutes');
const digitalMarketingRoutes = require('./src/routes/digitalMarketingRoutes');
const packageNotBoughtRoutes = require('./src/routes/packageNotBoughtRoutes');

connectDB();

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.text({ type: 'text/*', limit: '2mb' }));
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.get('/api/health', (req, res) => {
  res.status(200).json({ success: true, message: 'CRM API is running' });
});

// Uploaded payment screenshots — served at http://<host>/uploads/payments/<file>
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/medicine', medicineRoutes);
app.use('/api/courier', courierRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/advice', adviceRoutes);
app.use('/api/worksheet', worksheetRoutes);
app.use('/api/crm-chat', crmChatRoutes);
app.use('/api/speech', speechRoutes);
app.use('/api/digital-marketing', digitalMarketingRoutes);
app.use('/api/package-not-bought', packageNotBoughtRoutes);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
