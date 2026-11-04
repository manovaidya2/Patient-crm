require('dotenv').config();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const User = require('./src/models/User');
  const Patient = require('./src/models/Patient');
  const u = await User.findOne({ name: /sakshi/i, role: 'assistant_doctor' }).lean();
  const p = await Patient.findOne({ patientCode: 'R-3400' }).select('_id assignedDoctor').lean();
  console.log('user', String(u._id), 'assigned', String(p.assignedDoctor));
  const token = jwt.sign({ id: String(u._id) }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const r = await fetch(`http://localhost:5000/api/patients/${p._id}/book-appointment`, { headers: { Authorization: `Bearer ${token}`, Cookie: `token=${token}` } });
  console.log(r.status, (await r.text()).slice(0, 300));
  await mongoose.disconnect();
})().catch((e) => console.log('ERR', e.message));
