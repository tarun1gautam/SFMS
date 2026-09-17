// import axios from 'axios'

// const currentHost = window.location.hostname; 
// export const baseURL = `http://${currentHost}:5000/api`;

// const api = axios.create({
//   // Point directly to your backend Express server port
//   baseURL: baseURL,
//   withCredentials: true,
//   timeout: 0, // No timeout for large file uploads
// })

// // Request Interceptor: Inject token automatically on every outbound call
// api.interceptors.request.use(
//   (config) => {
//     const token = localStorage.getItem('sfms_token')
//     if (token) {
//       config.headers['Authorization'] = `Bearer ${token}`
//     }
//     return config
//   },
//   (error) => {
//     return Promise.reject(error)
//   }
// )

// // Response Interceptor: Manage unauthorized session expiries
// api.interceptors.response.use(
//   (response) => response,
//   (error) => {
//     // Only intercept 401s if they aren't coming from the explicit login submission path
//     if (error.response?.status === 401 && !error.config.url.includes('/auth/login')) {
//       localStorage.removeItem('sfms_token')
//       localStorage.removeItem('sfms_user')
      
//       // Stop infinite redirect flash-loops by validating we aren't already on /login
//       if (window.location.pathname !== '/login') {
//         window.location.href = '/login'
//       }
//     }
//     return Promise.reject(error)
//   }
// )

// export default api
import axios from 'axios'

const currentHost = window.location.hostname; 
export const baseURL = `http://${currentHost}:5000/api`;

const api = axios.create({
  // Point directly to your backend Express server port
  baseURL: baseURL,
  withCredentials: true,
  timeout: 0, // No timeout for large file uploads
})

// Request Interceptor: Inject token automatically on every outbound call
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('sfms_token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response Interceptor: Manage unauthorized session expiries
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only intercept 401s if they aren't coming from the explicit login submission path
    if (error.response?.status === 401 && !error.config.url.includes('/auth/login')) {
      localStorage.removeItem('sfms_token')
      localStorage.removeItem('sfms_user')

      // Stop infinite redirect flash-loops by validating we aren't already on /login
      if (window.location.pathname !== '/login') {
        // Dispatch instead of window.location.href — a hard redirect here
        // would destroy in-memory state (e.g. an open upload modal with a
        // file already selected, mid-upload progress, etc.) on top of just
        // being unnecessary in an SPA. App.jsx listens for this event and
        // does a normal client-side navigate() instead.
        window.dispatchEvent(new CustomEvent('sfms:session-expired'))
      }
    }
    return Promise.reject(error)
  }
)

export default api