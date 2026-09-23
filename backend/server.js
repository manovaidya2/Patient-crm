const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const connectDB = require('./src/config/db');
const { checkPdfRenderer } = require('./src/utils/simplePdf');
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
const bankRoutes = require('./src/routes/bankRoutes');
const salesSheetRoutes = require('./src/routes/salesSheetRoutes');
const { registerSalesSheetSocket } = require('./src/realtime/salesSheetSocket');

connectDB();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
});
app.set('io', io);
registerSalesSheetSocket(io);

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

// Actually launches the PDF renderer's headless browser so a missing system Chromium
// dependency (common on a bare Linux host) shows up here instead of only being
// discoverable by reading server logs after a completion form is submitted.
app.get('/api/health/pdf', async (req, res) => {
  const result = await checkPdfRenderer();
  res.status(result.ok ? 200 : 503).json({ success: result.ok, ...result });
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
app.use('/api/banks', bankRoutes);
app.use('/api/sales-sheet', salesSheetRoutes);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
