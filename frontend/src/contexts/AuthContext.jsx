import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { jwtDecode } from 'jwt-decode'
import api from '../utils/api'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Centralized logout function wrapped in useCallback
  const logout = useCallback(() => {
    localStorage.removeItem('sfms_token')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
    setLoading(false)
  }, [])

  // Helper function to decode and validate JWT token
  const getUserFromToken = (token) => {
    try {
      const decoded = jwtDecode(token)
      // Check if token is expired (exp is in seconds)
      if (decoded.exp && decoded.exp * 1000 < Date.now()) {
        return null
      }
      return decoded
    } catch {
      return null
    }
  }

  // 1. Initial boot check
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('sfms_token')

      if (token) {
        const decodedUser = getUserFromToken(token)

        if (decodedUser) {
          // Set authorization header immediately
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`
          setUser(decodedUser) // Immediate synchronous update from JWT payload

          // Verify with server to fetch fresh profile/permissions
          try {
            const res = await api.get('/auth/profile')
            setUser(res.data.user)
          } catch (error) {
            console.error("Token verification failed, logging out:", error)
            logout()
          }
        } else {
          // Token is invalid or expired
          logout()
        }
      }

      setLoading(false)
    }

    initializeAuth()
  }, [logout])

  // 2. Periodic background revalidation & tab focus/storage handlers
  useEffect(() => {
    if (!user) return

    const revalidate = async () => {
      try {
        const res = await api.get('/auth/profile')
        setUser(res.data.user)
      } catch {
        logout()
      }
    }

    const interval = setInterval(revalidate, 300_000)
    // window.addEventListener('focus', revalidate)

    // Handle cross-tab logout (if token is removed in another tab)
    const handleStorageChange = (e) => {
      if (e.key === 'sfms_token' && !e.newValue) {
        logout()
      }
    }
    window.addEventListener('storage', handleStorageChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', revalidate)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [user, logout])

  // 3. Login handler
  const login = async (token, userData = null) => {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    localStorage.setItem('sfms_token', token)

    // Fall back to decoded JWT payload if backend didn't return userData
    const activeUser = userData || getUserFromToken(token)
    setUser(activeUser)
    setLoading(false)
  }

  const isAdmin = user?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin, loading }}>
      {!loading ? children : (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900 text-blue-500 font-bold text-xl">
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