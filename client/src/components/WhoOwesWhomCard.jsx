import { useState } from 'react'
import { ArrowRight, CheckCircle2, Loader2, MessageCircle } from 'lucide-react'
import { useApp, api } from '../context/AppContext'

function userLabel(u) {
  if (!u) return ''
  if (typeof u === 'string') return u
  return u.name || u.email || u._id || ''
}
function userId(u) {
  if (!u) return ''
  if (typeof u === 'string') return u
  return u._id || ''
}

export default function WhoOwesWhomCard({ group, balances, settlements, onSettled, currency, isAdmin = true }) {
  const cur = currency || group?.currency || ''
  const { t, pushToast, user } = useApp()
  const [settlingKey, setSettlingKey] = useState(null)

  // Privacy: the backend already filters /balances for members; filter
  // again here so a non-admin never sees another member's debts/balances.
  const list = isAdmin
    ? settlements || []
    : (settlements || []).filter((s) => userId(s.from) === user?._id || userId(s.to) === user?._id)
  const balanceList = isAdmin
    ? balances || []
    : (balances || []).filter((b) => userId(b.user) === user?._id)

  async function handleSettle(s) {
    const fromId = userId(s.from)
    const toId = userId(s.to)
    if (!fromId || !toId || !group?._id) return
    const key = `${fromId}-${toId}-${s.amount}`
    setSettlingKey(key)
    try {
      await api.post(`/groups/${group._id}/settlements`, { from: fromId, to: toId, amount: Number(s.amount) })
      pushToast('success', t('settlementRecorded'))
      onSettled?.()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
    } finally {
      setSettlingKey(null)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-900 dark:text-white min-w-0">{t('whoOwesWhom')}</h3>
        <span className="text-xs px-2 py-1 rounded-full bg-brand-50 text-brand-700 font-medium">
          {list.length} {t('settlement')}
        </span>
      </div>

      {list.length === 0 ? (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-800">{t('everyoneSettled')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((s, i) => {
            const key = `${userId(s.from)}-${userId(s.to)}-${s.amount}-${i}`
            const busy = settlingKey === `${userId(s.from)}-${userId(s.to)}-${s.amount}`
            return (
              <div key={key} className="flex items-center gap-2 flex-wrap bg-slate-50 dark:bg-slate-800 rounded-xl px-3 sm:px-4 py-3 min-w-0">
                <span className="font-semibold text-slate-900 dark:text-white text-sm truncate max-w-full">{userLabel(s.from)}</span>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-900 dark:text-white text-sm truncate max-w-full">{userLabel(s.to)}</span>
                <span className="ml-auto font-bold text-brand-700 dark:text-brand-300 whitespace-nowrap">{cur ? `${cur} ` : ''}{Number(s.amount || 0).toFixed(2)}</span>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Hey ${userLabel(s.from)}! Quick reminder from our '${group?.name || ''}' group: you owe ${cur} ${Number(s.amount || 0).toFixed(2)} to ${userLabel(s.to)}. Let's settle up when free!`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold px-3 py-2.5 min-h-[44px] rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1"
                  title={t('remindOnWhatsApp')}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  {t('remindOnWhatsApp')}
                </a>
                <button
                  onClick={() => handleSettle(s)}
                  disabled={busy}
                  className="text-xs font-semibold px-3 py-2.5 min-h-[44px] rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1"
                >
                  {busy && <Loader2 className="w-3 h-3 spinner" />}
                  {t('markAsSettled')}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {balanceList.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t('balance')}</h4>
          <div className="space-y-1.5">
            {balanceList.map((b, i) => {
              const name = userLabel(b.user)
              const net = Number(b.netBalance ?? 0)
              return (
                <div key={b.user?._id || i} className="flex items-center justify-between gap-2 flex-wrap text-sm min-w-0">
                  <span className="text-slate-700 dark:text-slate-200 truncate min-w-0">{name}</span>
                  <span className="text-slate-500 text-xs">
                    {t('paid')}: {Number(b.totalPaid ?? 0).toFixed(2)} · {t('share')}: {Number(b.totalShare ?? 0).toFixed(2)}
                  </span>
                  <span className={`font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {net >= 0 ? '+' : ''}
                    {net.toFixed(2)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
