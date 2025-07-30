import multer from "multer";

const tempStorage = multer.memoryStorage();

const filter = (req, file, cb) => {
  if (file.mimetype === "image/jpeg" || file.mimetype === "image/png" || file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

export const uploadInstance = multer({ storage: tempStorage, fileFilter: filter });
