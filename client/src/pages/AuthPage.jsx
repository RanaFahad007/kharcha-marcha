import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Wallet } from 'lucide-react'
import { useApp } from '../context/AppContext'

export default function AuthPage() {
  const { t, pushToast, login, signup, loading } = useApp()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!emailOrPhone.trim()) {
      pushToast('error', t('emailRequired'))
      return
    }
    if (!password) {
      pushToast('error', t('passwordRequired'))
      return
    }
    if (mode === 'signup' && !name.trim()) {
      pushToast('error', t('nameRequired'))
      return
    }
    try {
      if (mode === 'login') await login(emailOrPhone.trim(), password)
      else await signup(name.trim(), emailOrPhone.trim(), password)
      const pending = localStorage.getItem('pendingInviteCode')
      if (pending) {
        localStorage.removeItem('pendingInviteCode')
        navigate(`/join/${pending}`)
      } else {
        navigate('/')
      }
    } catch (err) {
      pushToast('error', err.message || (mode === 'login' ? t('loginFailed') : t('signupFailed')))
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto mb-3">
            <Wallet className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{t('appName')}</h1>
          <p className="text-slate-500 text-sm mt-1">{t('tagline')}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-6">
          <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-lg p-1 mb-6">
            <button onClick={() => setMode('login')} className={`py-2 rounded-md text-sm font-semibold ${mode === 'login' ? 'bg-white shadow text-indigo-700' : 'text-slate-500'}`}>
              {t('login')}
            </button>
            <button onClick={() => setMode('signup')} className={`py-2 rounded-md text-sm font-semibold ${mode === 'signup' ? 'bg-white shadow text-indigo-700' : 'text-slate-500'}`}>
              {t('signup')}
            </button>
          </div>

          <h2 className="text-lg font-bold text-slate-900 mb-4">{mode === 'login' ? t('welcomeBack') : t('createAccount')}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('name')}</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" autoComplete="name" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('emailOrPhone')}</label>
              <input value={emailOrPhone} onChange={(e) => setEmailOrPhone(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" autoComplete="username" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('password')}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </div>
            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 spinner" />}
              {mode === 'login' ? t('login') : t('signup')}
            </button>
          </form>

          <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="w-full text-center text-sm text-indigo-600 hover:underline mt-4">
            {mode === 'login' ? t('noAccountYet') : t('alreadyHaveAccount')}
          </button>
          <p className="text-center text-xs text-slate-400 mt-4">{t('demoHint')}</p>
        </div>
      </div>
    </div>
  )
}
