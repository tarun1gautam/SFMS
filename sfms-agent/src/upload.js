const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const CENTRAL_UPLOAD_URL = 'http://10.43.8.136:5000/api/upload';

// filePaths: array of local absolute paths
// extra: optional extra fields to send with each upload (visibility, virtual_path, etc.)
async function uploadSelected(filePaths, extra = {}, authToken = null) {
  const results = [];

  for (const filePath of filePaths) {
    try {
      if (!fs.existsSync(filePath)) {
        results.push({ filePath, status: 'error', error: 'File not found' });
        continue;
      }

      const form = new FormData();
      form.append('file', fs.createReadStream(filePath), path.basename(filePath));

      for (const [key, value] of Object.entries(extra)) {
        form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }

      const headers = form.getHeaders();
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const response = await axios.post(CENTRAL_UPLOAD_URL, form, {
        headers,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      results.push({ filePath, status: 'uploaded', data: response.data });
    } catch (err) {
      results.push({
        filePath,
        status: 'error',
        error: err.response?.data?.error || err.message,
      });
    }
  }

  return results;
}

module.exports = { uploadSelected };