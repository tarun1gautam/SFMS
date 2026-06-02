import { createContext, useContext, useState, useEffect } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true) // Starts as true to guard initialization

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('sfms_token')
      const savedUser = localStorage.getItem('sfms_user')

      if (token && savedUser) {
        try {
          // 1. Set the bearer token right away for initialization
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`
          
          // 2. OPTIONAL BUT RECOMMENDED: Verify the token is still valid with backend
          // const res = await api.get('/auth/verify') 
          // setUser(res.data.user)

          // For now, hydrate from localStorage safely
          setUser(JSON.parse(savedUser))
        } catch (error) {
          console.error("Token verification failed, clearing auth status:", error)
          // Clear stale data if token verification hits a 401 error
          localStorage.removeItem('sfms_token')
          localStorage.removeItem('sfms_user')
          delete api.defaults.headers.common['Authorization']
          setUser(null)
        }
      }
      
      // 3. Turn off loading ONLY after synchronization finishes completely
      setLoading(false)
    }

    initializeAuth()
  }, [])

  const login = async (token, userData) => {
    // Set headers and storage synchronously before modifying layout states
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    localStorage.setItem('sfms_token', token)
    localStorage.setItem('sfms_user', JSON.stringify(userData))
    
    setUser(userData)
    setLoading(false) // Ensure loading is fully closed on explicit login triggers
  }

  const logout = () => {
    localStorage.removeItem('sfms_token')
    localStorage.removeItem('sfms_user')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
    setLoading(false)
  }

  const isAdmin = user?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin, loading }}>
      {/* 4. Crucial: Do not render routes until the boot setup has completed */}
      {!loading ? children : (
        <div className="flex min-h-screen items-center justify-center bg-gray-900 text-blue-500 font-bold text-xl">
          Loading Application...
        </div>
      )}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}