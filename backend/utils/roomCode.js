import crypto from 'crypto';

export function generateRoomCode(length = 6) {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const allChars = uppercase + numbers;

  while (true) {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += allChars[crypto.randomInt(0, allChars.length)];
    }
    if (length < 2 || (/[A-Z]/.test(code) && /[0-9]/.test(code))) {
      return code;
    }
  }
}

export const newRoomCode = generateRoomCode;

