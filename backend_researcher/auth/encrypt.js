const SECRET_KEY = Buffer.from(process.env.ENCRYPTION_SECRET, "hex"); // 32 bytes
const IV = Buffer.from(process.env.ENCRYPTION_IV, "hex"); 

export function encryptText(plainText) {
    const cipher = crypto.createCipheriv("aes-256-cbc", SECRET_KEY, IV);
    let encrypted = cipher.update(plainText, "utf8", "base64");
    encrypted += cipher.final("base64");
    return encrypted;
  }

export function decryptText(encryptedBase64) {
    const decipher = crypto.createDecipheriv("aes-256-cbc", SECRET_KEY, IV);
    let decrypted = decipher.update(encryptedBase64, "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }