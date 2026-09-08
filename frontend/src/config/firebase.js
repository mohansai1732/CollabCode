// src/config/firebase.js - Firebase configuration


// /**
//  * Universal helper to call your backend API with optional Clerk auth token
//  */
// export async function fetchFromAPI(endpoint, options = {}, getClerkToken = null) {
//   const headers = {
//     "Content-Type": "application/json",
//     ...(options.headers || {}),
//   };

//   // If a Clerk token getter is passed, attach the Bearer token for secure backend verification
//   if (getClerkToken) {
//     try {
//       const token = await getClerkToken();
//       if (token) {
//         headers["Authorization"] = `Bearer ${token}`;
//       }
//     } catch (err) {
//       console.error("Failed to retrieve auth token:", err);
//     }
//   }

//   const response = await fetch(`${API_BASE_URL}${endpoint}`, {
//     ...options,
//     headers,
//   });

//   if (!response.ok) {
//     const errorData = await response.json().catch(() => ({}));
//     throw new Error(errorData.message || `API Error: ${response.status}`);
//   }

//   return response.json();
// }