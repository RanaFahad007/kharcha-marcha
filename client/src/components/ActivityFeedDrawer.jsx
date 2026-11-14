import { useEffect, useState } from 'react'
import { Activity, Loader2, X } from 'lucide-react'
import { useApp, api } from '../context/AppContext'

function nameOf(v) {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v.name || v.email || v._id || ''
}

function actionLabel(action, t) {
  const map = {
    EXPENSE_CREATED: t('expenseAdded'),
    EXPENSE_EDITED: t('expenseUpdated'),
    EXPENSE_DELETED: t('expenseDeleted'),
    MEMBER_JOINED: t('groupJoined'),
    MEMBER_LEFT: t('leftGroup'),
    SETTLEMENT_RECORDED: t('settlementRecorded'),
    GROUP_CREATED: t('groupCreated'),
    GROUP_UPDATED: t('groupUpdated')
  }
  return map[action] || action || t('activityLog')
}

export default function ActivityFeedDrawer({ groupId, open, onClose }) {
  const { t } = useApp()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !groupId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await api.get(`/groups/${groupId}/activity`)
        // Backend returns { data: { activity: [...] } }; the server already
        // filters to the caller's own entries for non-admins.
        if (!cancelled) {
          const d = res.data?.data || {}
          setLogs(Array.isArray(d) ? d : d.activity || [])
        }
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.message || t('failedToLoad'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open, groupId, t])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label={t('activityFeed')}>
      <div className="absolute inset-0 bg-black/50 modal-backdrop" onClick={onClose} />
      <div className="drawer-slide-in relative w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-pop overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-5 py-4 flex items-center gap-2 z-10">
          <Activity className="w-5 h-5 text-brand-700" />
          <h3 className="font-bold text-slate-900 dark:text-white flex-1">{t('activityFeed')}</h3>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0" aria-label={t('close')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
              <Loader2 className="w-5 h-5 spinner" />
              {t('loading')}
            </div>
          )}
          {!loading && error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && logs.length === 0 && <p className="text-sm text-slate-500 py-6 text-center">{t('noActivity')}</p>}
          {!loading &&
            logs.map((log, i) => {
              const action = log.action || log.type || ''
              // Backend populates the actor as actorId.
              const actor = nameOf(log.actorId || log.actor || log.user || log.createdBy)
              const details = log.details || log.description || log.expense?.title || log.title || ''
              const time = log.createdAt ? new Date(log.createdAt).toLocaleString() : ''
              const history = log.expense?.editHistory || log.editHistory || []
              const prev = history.length ? history[history.length - 1] : null
              const prevAmount = prev?.previousAmount ?? log.previousAmount
              const prevTitle = prev?.previousTitle ?? log.previousTitle
              const curAmount = log.expense?.amount ?? log.amount
              const curTitle = log.expense?.title ?? log.title
              return (
                <div key={log._id || i} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50 dark:bg-slate-800">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">{actionLabel(action, t)}</span>
                    <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">{time}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white mt-2 break-words">
                    {actor}
                    {details ? ` — ${details}` : ''}
                  </p>
                  {action === 'EXPENSE_EDITED' && (prevAmount !== undefined || prevTitle) && (
                    <div className="mt-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 space-y-1">
                      <div className="text-slate-500">
                        {t('before')}: {prevTitle ? `${prevTitle} — ` : ''}
                        {prevAmount !== undefined && prevAmount !== null ? prevAmount : '—'}
                      </div>
                      <div className="text-slate-700 dark:text-slate-200">
                        {t('after')}: {curTitle ? `${curTitle} — ` : ''}
                        {curAmount !== undefined && curAmount !== null ? curAmount : '—'}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
