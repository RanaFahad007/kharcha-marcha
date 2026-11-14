import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Plus, UserPlus } from 'lucide-react'
import { useApp, api } from '../context/AppContext'

const COLORS = ['#0D9488', '#059669', '#DC2626', '#D97706', '#0891B2', '#4F46E5', '#0f2440']

export default function OnboardingCards() {
  const { t, pushToast, fetchMyGroups, setActiveGroup } = useApp()
  const navigate = useNavigate()
  const [groupName, setGroupName] = useState('')
  const [groupColor, setGroupColor] = useState(COLORS[0])
  const [creating, setCreating] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    if (!groupName.trim()) {
      pushToast('error', t('nameRequired'))
      return
    }
    setCreating(true)
    try {
      const res = await api.post('/groups', { name: groupName.trim(), color: groupColor })
      // createGroup returns { data: { group } }.
      const group = res.data?.data?.group || res.data?.data || res.data
      pushToast('success', t('groupCreated'))
      const list = await fetchMyGroups()
      const created = list.find((g) => g._id === group?._id) || group
      if (created) {
        await setActiveGroup(created)
        navigate(`/groups/${created._id}`)
      }
    } catch (err) {
      pushToast('error', err?.response?.data?.message || t('failedToLoad'))
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    const code = inviteCode.trim().toUpperCase()
    if (!code) {
      pushToast('error', t('invalidCode'))
      return
    }
    setJoining(true)
    try {
      await api.get(`/groups/join/${code}`)
      navigate(`/join/${code}`)
    } catch (err) {
      pushToast('error', err?.response?.data?.message || t('invalidCode'))
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 py-6 sm:py-10 min-w-0">
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{t('appName')}</h1>
        <p className="text-slate-500 mt-2">{t('tagline')}</p>
        <p className="text-slate-400 text-sm mt-1">{t('noGroupsDesc')}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-5 sm:p-6 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center mb-4">
            <Plus className="w-6 h-6" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{t('createGroup')}</h2>
          <p className="text-sm text-slate-500 mt-1 mb-5">{t('createGroupDesc')}</p>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t('groupName')}</label>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Weekend Trip"
                className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{t('groupColor')}</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setGroupColor(c)}
                    className={`w-11 h-11 rounded-full border-2 ${groupColor === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="w-full py-2.5 min-h-[44px] rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {creating && <Loader2 className="w-4 h-4 spinner" />}
              {t('create')}
            </button>
          </form>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-5 sm:p-6 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
            <UserPlus className="w-6 h-6" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">{t('joinGroup')}</h2>
          <p className="text-sm text-slate-500 mt-1 mb-5">{t('joinGroupDesc')}</p>
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t('inviteCode')}</label>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder={t('joinCodePlaceholder')}
                className="w-full px-3 py-2.5 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase tracking-widest font-mono text-center text-lg"
              />
            </div>
            <button
              type="submit"
              disabled={joining}
              className="w-full py-2.5 min-h-[44px] rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {joining && <Loader2 className="w-4 h-4 spinner" />}
              {t('join')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
