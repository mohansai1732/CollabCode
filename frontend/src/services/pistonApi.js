// import axios from 'axios';

// const API_URL =  'http://localhost:5001/api';
// // const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// /**
//  * Execute code via our backend proxy to Piston API.
//  * This is more secure and avoids CORS issues.
//  */
// export async function executeCode({ language, content }) {
//   const { data } = await axios.post(
//     `${API_URL}/execute`,
//     {
//       language,
//       content,
//     },
//     { 
//       headers: { 'Content-Type': 'application/json' }, 
//       timeout: 30000 
//     }
//   );
//   return data;
// }
