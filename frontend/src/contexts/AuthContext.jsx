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
          const res = await api.get('/auth/profile')
          const freshUser = res.data.user
          localStorage.setItem('sfms_user', JSON.stringify(freshUser))  // overwrite any tampering
      setUser(freshUser)
        } catch (error) {
          console.error("Token verification failed, clearing auth status:", error)
          localStorage.removeItem('sfms_token')
          localStorage.removeItem('sfms_user')
          delete api.defaults.headers.common['Authorization']
          setUser(null)
        }
      }
      setLoading(false)
    }

    initializeAuth()
  }, [])

  useEffect(() => {
  if (!user) return

  const revalidate = async () => {
    try {
      const res = await api.get('/auth/profile')
      const freshUser = res.data.user
      if (JSON.stringify(freshUser) !== localStorage.getItem('sfms_user')) {
        localStorage.setItem('sfms_user', JSON.stringify(freshUser))
        setUser(freshUser)
        console.log(freshUser);
      }
    } catch {
      logout()
    }
  }

  const interval = setInterval(revalidate, 60_000)      // periodic check
  window.addEventListener('focus', revalidate)           // came back to the tab
  window.addEventListener('storage', revalidate)          // another tab changed localStorage

  return () => {
    clearInterval(interval)
    window.removeEventListener('focus', revalidate)
    window.removeEventListener('storage', revalidate)
  }
}, [user])

  const login = async (token, userData) => {
    // Set headers and storage synchronously before modifying layout states
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    localStorage.setItem('sfms_token', token)
    localStorage.setItem('sfms_user', JSON.stringify(userData))
    setUser(userData)
    setLoading(false)
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