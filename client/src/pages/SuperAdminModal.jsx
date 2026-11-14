import { useCallback, useEffect, useState } from 'react'
import { Ban, Loader2, Shield, X } from 'lucide-react'
import { useApp, api } from '../context/AppContext'

function nameOf(v) {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v.name || v.email || v._id || ''
}

export default function SuperAdminModal({ open, onClose }) {
  const { user, t, pushToast } = useApp()
  const [stats, setStats] = useState(null)
  const [groups, setGroups] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, groupsRes, usersRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/groups'),
        api.get('/admin/users'),
      ])
      setStats(statsRes.data?.data || statsRes.data || null)
      const gData = groupsRes.data?.data || {}
      setGroups(Array.isArray(gData) ? gData : gData.groups || [])
      const uData = usersRes.data?.data || {}
      setUsers(Array.isArray(uData) ? uData : uData.users || [])
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [pushToast, t])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  async function toggleBlock(targetUser, isBlocked) {
    const uid = targetUser?._id || targetUser
    if (!uid) return
    if (uid === user?._id) {
      pushToast('error', t('cannotBlockSelf'))
      return
    }
    if (!isBlocked && !window.confirm(t('confirmBlockUser'))) return
    setBusyId(uid)
    try {
      const action = isBlocked ? 'unblock' : 'block'
      await api.post(`/admin/users/${uid}/${action}`)
      pushToast('success', isBlocked ? t('userUnblocked') : t('userBlocked'))
      load()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDeleteUser(targetUser) {
    const uid = targetUser?._id || targetUser
    if (!uid) return
    if (uid === user?._id) {
      pushToast('error', t('cannotBlockSelf'))
      return
    }
    if (!window.confirm(t('confirmDeleteUser'))) return
    setBusyId(uid)
    try {
      await api.delete(`/admin/users/${uid}`)
      pushToast('success', t('userDeleted'))
      load()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setBusyId(null)
    }
  }

  if (!open) return null

  const statCards = [
    { label: t('totalUsers'), value: stats?.totalUsers ?? stats?.users ?? stats?.userCount ?? '—' },
    { label: t('totalGroups'), value: stats?.totalGroups ?? stats?.groups ?? stats?.groupCount ?? groups.length },
    { label: t('totalExpenses'), value: stats?.totalExpenses ?? stats?.expenses ?? stats?.expenseCount ?? '—' }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 modal-backdrop bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="modal-panel bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-pop w-full max-w-3xl p-5 sm:p-6 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-brand-700" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex-1">{t('superAdmin')}</h3>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0" aria-label={t('close')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
            <Loader2 className="w-5 h-5 spinner" />
            {t('loading')}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
              {statCards.map((c) => (
                <div key={c.label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                  <div className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white break-words">{c.value}</div>
                  <div className="text-xs text-slate-500 mt-1">{c.label}</div>
                </div>
              ))}
            </div>

            <h4 className="font-bold text-slate-900 dark:text-white mb-2">{t('allGroups')}</h4>
            <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5">{t('groupName')}</th>
                    <th className="px-4 py-2.5">{t('members')}</th>
                    <th className="px-4 py-2.5">{t('totalExpenses')}</th>
                    <th className="px-4 py-2.5">{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-4 py-4 text-center text-slate-500">
                        {t('noGroups')}
                      </td>
                    </tr>
                  )}
                  {groups.map((g) => (
                    <tr key={g._id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{g.name}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{g.members?.length ?? g.memberCount ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{g.expenseCount ?? g.totalExpenses ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">{t('active')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Card list on small screens — the table above is md+ only. */}
            <div className="md:hidden space-y-3 mb-6">
              {groups.length === 0 && <p className="text-sm text-slate-500 text-center py-4">{t('noGroups')}</p>}
              {groups.map((g) => (
                <div key={g._id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900 dark:text-white truncate min-w-0">{g.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0">{t('active')}</span>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-slate-500">
                    <span>
                      {t('members')}: {g.members?.length ?? g.memberCount ?? '—'}
                    </span>
                    <span>
                      {t('totalExpenses')}: {g.expenseCount ?? g.totalExpenses ?? '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <h4 className="font-bold text-slate-900 dark:text-white mb-2">{t('members')}</h4>
            {users.length === 0 && <p className="text-sm text-slate-500">{t('noMembers')}</p>}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1 min-w-0">
              {users.map((u) => {
                const isBlocked = u.isBlocked === true || u.status === 'blocked'
                const isSelf = u._id === user?._id
                return (
                  <div key={u._id} className="flex items-center gap-3 flex-wrap border border-slate-200 dark:border-slate-700 rounded-xl px-3 sm:px-4 py-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs">{(u.name || 'U').charAt(0).toUpperCase()}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-slate-900 dark:text-white truncate">{nameOf(u)}</span>
                      <span className="block text-xs text-slate-500 truncate">{u.emailOrPhone || u.email || ''}</span>
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isBlocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{isBlocked ? t('blocked') : t('active')}</span>
                    <button
                      onClick={() => toggleBlock(u, isBlocked)}
                      disabled={busyId === u._id || isSelf}
                      title={isSelf ? t('cannotBlockSelf') : ''}
                      className={`flex items-center gap-1 text-xs font-semibold px-3 py-2.5 min-h-[44px] rounded-lg disabled:opacity-50 ${isBlocked ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
                    >
                      <Ban className="w-3.5 h-3.5" />
                      {isBlocked ? t('unblockUser') : t('blockUser')}
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u)}
                      disabled={busyId === u._id || isSelf}
                      title={isSelf ? t('cannotBlockSelf') : t('deleteUser')}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-2.5 min-h-[44px] rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {t('deleteUser')}
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
