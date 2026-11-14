import { useState } from 'react'
import { Check, Copy, MessageCircle, X } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useApp, api } from '../context/AppContext'

export default function InviteModal({ group, onClose }) {
  const { t, pushToast, fetchMyGroups } = useApp()
  const [invitesEnabled, setInvitesEnabled] = useState(group?.invitesEnabled !== false)
  const [autoApproveJoin, setAutoApproveJoin] = useState(group?.autoApproveJoin === true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!group) return null
  const inviteCode = group.inviteCode || ''
  const inviteLink = `${window.location.origin}/join/${inviteCode}`
  const waText = `Join our expense group '${group.name}' on SplitTrack! Use code: ${inviteCode} or click: ${inviteLink}`
  const waHref = `https://wa.me/?text=${encodeURIComponent(waText)}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      pushToast('success', t('copied'))
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      pushToast('error', t('failedToLoad'))
    }
  }

  async function updateSettings(nextInvites, nextAuto) {
    setSaving(true)
    try {
      await api.put(`/groups/${group._id}`, { invitesEnabled: nextInvites, autoApproveJoin: nextAuto })
      pushToast('success', t('groupUpdated'))
      await fetchMyGroups()
    } catch (e) {
      pushToast('error', e?.response?.data?.message || t('failedToLoad'))
      setInvitesEnabled(group?.invitesEnabled !== false)
      setAutoApproveJoin(group?.autoApproveJoin === true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 modal-backdrop bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="modal-panel bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-pop w-full max-w-md p-5 sm:p-6 max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate min-w-0">
            {t('invite')} — {group.name}
          </h3>
          <button onClick={onClose} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-center bg-brand-50 dark:bg-slate-800 rounded-xl py-5 px-4 mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-600 mb-1">{t('inviteCode')}</div>
          <div className="text-2xl sm:text-3xl font-mono font-bold tracking-widest text-brand-700 dark:text-brand-300 break-all">{inviteCode || '—'}</div>
          <div className="text-xs text-slate-500 mt-2 break-all">{inviteLink}</div>
          {inviteCode && (
            <div className="mt-4 flex flex-col items-center">
              <div className="qr-wrap bg-white p-3 rounded-xl shadow-card max-w-full">
                <QRCodeSVG value={inviteLink} size={160} level="M" includeMargin />
              </div>
              <p className="text-xs text-slate-500 mt-2">{t('scanQRToJoin')}</p>
              <p className="text-xs font-mono text-slate-600 dark:text-slate-300 mt-1">{inviteCode}</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-5">
          <button onClick={copyLink} className="flex-1 flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {t('copyLink')}
          </button>
          <a href={waHref} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700">
            <MessageCircle className="w-4 h-4" />
            {t('shareWhatsApp')}
          </a>
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('invitesEnabled')}</span>
            <input
              type="checkbox"
              checked={invitesEnabled}
              disabled={saving}
              onChange={(e) => {
                setInvitesEnabled(e.target.checked)
                updateSettings(e.target.checked, autoApproveJoin)
              }}
              className="w-5 h-5 accent-brand-600"
            />
          </label>
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t('autoApprove')}</span>
            <input
              type="checkbox"
              checked={autoApproveJoin}
              disabled={saving}
              onChange={(e) => {
                setAutoApproveJoin(e.target.checked)
                updateSettings(invitesEnabled, e.target.checked)
              }}
              className="w-5 h-5 accent-brand-600"
            />
          </label>
        </div>

        <button onClick={onClose} className="w-full mt-5 py-2.5 min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-600 dark:text-slate-100 font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
          {t('close')}
        </button>
      </div>
    </div>
  )
}
