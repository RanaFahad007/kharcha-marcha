import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loader2, RefreshCw, Users } from 'lucide-react'
import { useApp, api } from '../context/AppContext'

export default function JoinGroupScreen() {
  const { inviteCode } = useParams()
  const { user, token, t, pushToast, fetchMyGroups, setActiveGroup } = useApp()
  const navigate = useNavigate()
  const [preview, setPreview] = useState(null)
  const [status, setStatus] = useState('loading')
  const [sending, setSending] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const loadPreview = useCallback(async () => {
    if (!inviteCode) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await api.get(`/groups/join/${inviteCode}`)
      const data = res.data?.data || res.data
      setPreview(data?.group || data)
      const st = data?.status || data?.membershipStatus || data?.group?.status
      if (data?.isMember || st === 'accepted') setStatus('accepted')
      else if (st === 'pending') setStatus('pending')
      else if (st === 'rejected') setStatus('rejected')
      else setStatus('ready')
    } catch (e) {
      setStatus('error')
      setErrorMsg(e?.response?.data?.message || t('invalidCode'))
    }
  }, [inviteCode, t])

  useEffect(() => {
    if (!token) {
      localStorage.setItem('pendingInviteCode', inviteCode)
      navigate('/login')
      return
    }
    loadPreview()
  }, [token, inviteCode, navigate, loadPreview])

  useEffect(() => {
    if (status === 'accepted') {
      const go = async () => {
        const list = await fetchMyGroups()
        const found = list.find((g) => g.inviteCode === inviteCode || g._id === preview?._id)
        if (found) {
          await setActiveGroup(found)
          navigate(`/groups/${found._id}`)
        } else {
          navigate('/')
        }
      }
      go()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  async function handleJoin() {
    setSending(true)
    try {
      const res = await api.post(`/groups/join/${inviteCode}`)
      const data = res.data?.data || res.data
      const st = data?.status || data?.membershipStatus
      if (st === 'accepted' || data?.isMember || data?.group) {
        pushToast('success', t('groupJoined'))
        const list = await fetchMyGroups()
        const found = list.find((g) => g.inviteCode === inviteCode) || data?.group
        if (found) {
          await setActiveGroup(found)
          navigate(`/groups/${found._id}`)
          return
        }
        navigate('/')
      } else {
        setStatus('pending')
        pushToast('success', t('requestSent'))
      }
    } catch (e) {
      const msg = e?.response?.data?.message || t('failedToLoad')
      pushToast('error', msg)
      if (/pending/i.test(msg)) setStatus('pending')
    } finally {
      setSending(false)
    }
  }

  if (!token) return null

  if (status === 'loading' || status === 'accepted') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 spinner text-brand-700" />
        <p>{t('loading')}</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="max-w-md mx-auto px-4 py-8 sm:py-16 text-center">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-5 sm:p-8 min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('invalidCode')}</h1>
          <p className="text-sm text-slate-500 mb-6">{errorMsg}</p>
          <Link to="/" className="inline-flex items-center px-5 py-2.5 min-h-[44px] rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700">
            {t('backToDashboard')}
          </Link>
        </div>
      </div>
    )
  }

  const invitesOff = preview?.invitesEnabled === false
  const memberCount = preview?.memberCount ?? preview?.members?.length ?? 0

  return (
    <div className="max-w-md mx-auto px-4 py-8 sm:py-16">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-5 sm:p-8 text-center min-w-0">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center text-white" style={{ backgroundColor: preview?.color || '#0D9488' }}>
          <Users className="w-8 h-8" />
        </div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('groupPreview')}</div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1 break-words">{preview?.name}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {memberCount} {t('membersCount')}
        </p>
        <p className="text-sm font-mono tracking-widest text-brand-700 dark:text-brand-300 mt-2 break-all">{inviteCode}</p>

        {status === 'pending' && (
          <div className="mt-6">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">{t('waitingForAdmin')}</div>
            <button onClick={loadPreview} className="mt-4 inline-flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-lg border border-slate-300 dark:border-slate-600 dark:text-slate-100 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
              <RefreshCw className="w-4 h-4" />
              {t('refresh')}
            </button>
          </div>
        )}

        {status === 'rejected' && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">{t('requestNotAccepted')}</div>
        )}

        {status === 'ready' && (
          <div className="mt-6">
            {invitesOff ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600">{t('invitesDisabledMsg')}</div>
            ) : (
              <button onClick={handleJoin} disabled={sending} className="w-full py-2.5 min-h-[44px] rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-2">
                {sending && <Loader2 className="w-4 h-4 spinner" />}
                {t('sendJoinRequest')}
              </button>
            )}
          </div>
        )}

        <Link to="/" className="inline-block text-sm text-brand-700 hover:underline mt-5">
          {t('backToDashboard')}
        </Link>
      </div>
    </div>
  )
}
