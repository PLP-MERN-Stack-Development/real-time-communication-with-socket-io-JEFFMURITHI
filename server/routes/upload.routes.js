// server/routes/upload.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// --------------------
// Ensure upload directory exists
// --------------------
const UPLOAD_DIR = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// --------------------
// Configure multer for file uploads
// --------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    console.log("Processing file:", file.originalname);
    const allowedTypes = /jpeg|jpg|png|gif/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Unsupported file type. Only images are allowed.'));
  },
}).single('file');

// --------------------
// Routes
// --------------------

// Single file upload
router.post('/', (req, res) => {
  console.log("Upload request received");

  upload(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);
      return res.status(400).json({
        message: "Upload failed",
        error: err.message,
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    console.log("File uploaded successfully:", fileUrl);

    res.status(200).json({
      message: "File uploaded successfully",
      file: {
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        contentType: req.file.mimetype, // important for frontend rendering
      },
    });
  });
});

module.exports = router;
