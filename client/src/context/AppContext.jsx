import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import { locales } from '../i18n/locales'

const AppContext = createContext(null)

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

export const api = axios.create({ baseURL: API_BASE })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('splittrack_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let toastId = 0

export function AppProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('splittrack_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [token, setToken] = useState(() => localStorage.getItem('splittrack_token') || null)
  const [myGroups, setMyGroups] = useState([])
  const [activeGroup, setActiveGroupState] = useState(null)
  const [language, setLanguageState] = useState(() => localStorage.getItem('splittrack_lang') || 'en')
  const [theme, setThemeState] = useState(() => localStorage.getItem('splittrack_theme') || 'light')
  const [toasts, setToasts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [groupsLoading, setGroupsLoading] = useState(false)
  const activeGroupRef = useRef(null)
  activeGroupRef.current = activeGroup

  const t = useCallback(
    (key) => {
      const dict = locales[language] || locales.en
      return dict[key] || locales.en[key] || key
    },
    [language]
  )

  const pushToast = useCallback((type, message) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, type, message }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id))
    }, 4500)
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const setTheme = useCallback((mode) => {
    const next = mode === 'dark' ? 'dark' : 'light'
    setThemeState(next)
    localStorage.setItem('splittrack_theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }, [])
  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('splittrack_theme', next)
      document.documentElement.classList.toggle('dark', next === 'dark')
      return next
    })
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const setLanguage = useCallback((code) => {
    setLanguageState(code)
    localStorage.setItem('splittrack_lang', code)
    document.documentElement.lang = code
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr'
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  }, [language])

  const fetchMyGroups = useCallback(async () => {
    if (!localStorage.getItem('splittrack_token')) return []
    setGroupsLoading(true)
    try {
      const res = await api.get('/groups')
      const list = res.data?.data || []
      setMyGroups(list)
      const current = activeGroupRef.current
      if (!current && list.length > 0) {
        let next = null
        try {
          const storedUser = JSON.parse(localStorage.getItem('splittrack_user') || 'null')
          const lastId = storedUser?.lastActiveGroupId
          next = (lastId && list.find((g) => g._id === lastId)) || list[0]
        } catch {
          next = list[0]
        }
        setActiveGroupState(next)
      } else if (current) {
        const refreshed = list.find((g) => g._id === current._id)
        if (refreshed) setActiveGroupState(refreshed)
      }
      return list
    } catch (e) {
      setError(e?.response?.data?.message || e.message)
      return []
    } finally {
      setGroupsLoading(false)
    }
  }, [])

  const setActiveGroup = useCallback(async (group) => {
    setActiveGroupState(group)
    if (!group) return
    try {
      const storedUser = JSON.parse(localStorage.getItem('splittrack_user') || 'null')
      if (storedUser) {
        const updated = { ...storedUser, lastActiveGroupId: group._id }
        localStorage.setItem('splittrack_user', JSON.stringify(updated))
        setUser(updated)
      }
    } catch {
      // localStorage unavailable — active group still set in memory
    }
    try {
      await api.get(`/groups/${group._id}`)
    } catch {
      // Backend persistence is best-effort; group is already active locally.
    }
  }, [])

  const saveAuth = useCallback((payload) => {
    const nextToken = payload?.token || payload?.data?.token
    const nextUser = payload?.user || payload?.data?.user || null
    if (nextToken) {
      localStorage.setItem('splittrack_token', nextToken)
      setToken(nextToken)
    }
    if (nextUser) {
      localStorage.setItem('splittrack_user', JSON.stringify(nextUser))
      setUser(nextUser)
    }
    return { token: nextToken, user: nextUser }
  }, [])

  const login = useCallback(
    async (emailOrPhone, password) => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.post('/auth/login', { emailOrPhone, password })
        const saved = saveAuth(res.data?.data || res.data)
        await fetchMyGroups()
        return saved
      } catch (e) {
        const msg = e?.response?.data?.message || t('loginFailed')
        setError(msg)
        throw new Error(msg)
      } finally {
        setLoading(false)
      }
    },
    [fetchMyGroups, saveAuth, t]
  )

  const signup = useCallback(
    async (name, emailOrPhone, password) => {
      setLoading(true)
      setError(null)
      try {
        const res = await api.post('/auth/signup', { name, emailOrPhone, password })
        const saved = saveAuth(res.data?.data || res.data)
        await fetchMyGroups()
        return saved
      } catch (e) {
        const msg = e?.response?.data?.message || t('signupFailed')
        setError(msg)
        throw new Error(msg)
      } finally {
        setLoading(false)
      }
    },
    [fetchMyGroups, saveAuth, t]
  )

  const logout = useCallback(() => {
    localStorage.removeItem('splittrack_token')
    localStorage.removeItem('splittrack_user')
    setToken(null)
    setUser(null)
    setMyGroups([])
    setActiveGroupState(null)
  }, [])

  const refreshMe = useCallback(async () => {
    try {
      const res = await api.get('/auth/me')
      const me = res.data?.data || res.data?.user
      if (me) {
        localStorage.setItem('splittrack_user', JSON.stringify(me))
        setUser(me)
      }
      return me
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (token) fetchMyGroups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const value = useMemo(
    () => ({
      user,
      token,
      myGroups,
      activeGroup,
      language,
      setLanguage,
      theme,
      setTheme,
      toggleTheme,
      t,
      toasts,
      pushToast,
      removeToast,
      api,
      loading,
      error,
      setError,
      groupsLoading,
      login,
      signup,
      logout,
      fetchMyGroups,
      setActiveGroup,
      refreshMe
    }),
    [user, token, myGroups, activeGroup, language, setLanguage, theme, setTheme, toggleTheme, t, toasts, pushToast, removeToast, loading, error, groupsLoading, login, signup, logout, fetchMyGroups, setActiveGroup, refreshMe]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

export default AppContext
