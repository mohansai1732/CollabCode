// export function newRoomCode(length = 6) {
//   const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
//   const lowercase = 'abcdefghijklmnopqrstuvwxyz';
//   const numbers = '0123456789';
//   const allChars = uppercase + lowercase + numbers;

//   while (true) {
//     let code = '';
//     for (let i = 0; i < length; i++) {
//       const index = Math.floor(Math.random() * allChars.length);
//       code += allChars[index];
//     }
//     if (length < 3 || (/[A-Z]/.test(code) && /[a-z]/.test(code) && /[0-9]/.test(code))) {
//       return code;
//     }
//   }
// }
